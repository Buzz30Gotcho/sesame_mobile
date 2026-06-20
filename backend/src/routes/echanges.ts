import express from 'express';
import { randomBytes } from 'crypto';
import { query, withTransaction } from '../db';
import { calculatePoints } from '../lib/rules';
import { requireAuth, ownActorBodyQuery, ownEchangeParam } from '../middleware/auth';

const router = express.Router();

function makeReference(prefix: string) {
    const ts = Date.now().toString().slice(-8);
    const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}-${ts}-${rand}`;
}

router.post('/creer', requireAuth, ownActorBodyQuery, async (req, res) => {
    const { ambassadeur_id, offre_id } = req.body;
    if (!ambassadeur_id || !offre_id) {
        return res.status(400).json({ error: 'Données manquantes' });
    }

    // Vérifier que l'ambassadeur est de type physique (la boutique est interdite pour les Moraux)
    const ambResult = await query('SELECT points_solde, type_ambassadeur FROM ambassadeurs WHERE id = $1', [ambassadeur_id]);
    const ambassadeur = ambResult.rows[0];
    if (!ambassadeur) return res.status(404).json({ error: 'Ambassadeur introuvable' });
    if (ambassadeur.type_ambassadeur === 'moral') {
        return res.status(403).json({ error: 'La boutique n\'est pas disponible pour les Ambassadeurs Moraux.' });
    }

    // L'offre doit être en ligne ET son fournisseur signé et non suspendu
    // (mêmes conditions que la boutique — anti-contournement par appel direct).
    const offreResult = await query(
        `SELECT o.* FROM offres_boutique o
         JOIN fournisseurs f ON f.id = o.fournisseur_id
         WHERE o.id = $1 AND o.statut = 'en_ligne'
           AND f.contrat_signe = true AND f.statut <> 'suspendu'`,
        [offre_id]
    );
    const offre = offreResult.rows[0];
    if (!offre) return res.status(404).json({ error: 'Offre indisponible (hors ligne, ou fournisseur non signé / suspendu).' });

    const pointsNeeded = Number(offre.pts_requis);
    const solde = Number(ambassadeur.points_solde || 0);

    if (solde < pointsNeeded) {
        return res.status(400).json({ error: `Points insuffisants. Solde : ${solde} pts. Requis : ${pointsNeeded} pts.` });
    }

    const exchangeReference = makeReference('BON');
    // Token imprévisible (crypto) — il sert à valider/remettre le bon, ne doit pas être devinable.
    const tokenQr = `${exchangeReference}-${randomBytes(6).toString('hex').toUpperCase()}`;

    try {
        await withTransaction(async (q) => {
            // Décrément atomique du stock AVANT tout : si limité, on ne décrémente que si stock > 0.
            // 0 ligne renvoyée = plus de stock (ou offre passée hors ligne) → on annule l'échange.
            // (stock NULL = illimité : NULL - 1 reste NULL, l'offre n'est jamais épuisée.)
            const dec = await q(
                `UPDATE offres_boutique SET stock = stock - 1
                 WHERE id = $1 AND statut = 'en_ligne' AND (stock IS NULL OR stock > 0)
                 RETURNING id`,
                [offre.id]
            );
            if (dec.rows.length === 0) {
                const err: any = new Error('Offre épuisée ou hors ligne.');
                err.statusCode = 409;
                throw err;
            }

            // Déduire les points (garde anti-solde négatif sous concurrence).
            const ded = await q(
                'UPDATE ambassadeurs SET points_solde = points_solde - $1 WHERE id = $2 AND points_solde >= $1 RETURNING points_solde',
                [pointsNeeded, ambassadeur_id]
            );
            if (ded.rows.length === 0) {
                const err: any = new Error('Points insuffisants.');
                err.statusCode = 400;
                throw err;
            }

            await q(
                'INSERT INTO points_historique(ambassadeur_id, type, montant, solde_avant, solde_apres, description) VALUES ($1,$2,$3,$4,$5,$6)',
                [ambassadeur_id, 'depense', pointsNeeded, solde, solde - pointsNeeded, `Échange boutique : ${offre.nom}`]
            );

            await q(
                'INSERT INTO echanges(reference, ambassadeur_id, offre_id, fournisseur_id, points_deduits, token_qr, statut, remis_at, expire_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                [exchangeReference, ambassadeur_id, offre.id, offre.fournisseur_id, pointsNeeded, tokenQr, 'en_attente_admin', null, null]
            );
        });
    } catch (e: any) {
        return res.status(e.statusCode || 500).json({ error: e.message || "Échec de l'échange." });
    }

    res.status(201).json({ reference: exchangeReference, points_deduits: pointsNeeded, statut: 'en_attente_admin' });
});

router.get('/mes-bons', requireAuth, ownActorBodyQuery, async (req, res) => {
    const { ambassadeur_id } = req.query;
    const result = await query(
        `SELECT e.*, o.nom AS nom_offre,
                f.prest_telephone, f.prest_adresse, f.prest_cp, f.prest_ville
         FROM echanges e
         LEFT JOIN offres_boutique o ON o.id = e.offre_id
         LEFT JOIN fournisseurs f ON f.id = e.fournisseur_id
         WHERE e.ambassadeur_id = $1
         ORDER BY e.remis_at DESC NULLS LAST`,
        [ambassadeur_id]
    );
    res.json(result.rows);
});

// Endpoint pour la page web fournisseur — infos publiques du bon via token
router.get('/info', async (req, res) => {
    const { token } = req.query as { token?: string };
    if (!token) return res.status(400).json({ error: 'token requis' });

    const result = await query(
        `SELECT e.id, e.reference, e.statut, e.expire_at, e.remis_at, e.utilise_at,
                o.nom AS nom_offre
         FROM echanges e
         JOIN offres_boutique o ON o.id = e.offre_id
         WHERE e.token_qr = $1`,
        [token]
    );
    const bon = result.rows[0];
    if (!bon) return res.status(404).json({ error: 'Bon introuvable' });

    if (bon.statut === 'utilise') return res.status(400).json({ statut: 'utilise', error: 'Bon déjà utilisé', reference: bon.reference, nom_offre: bon.nom_offre });
    if (bon.statut === 'expire' || (bon.expire_at && new Date(bon.expire_at) <= new Date())) {
        return res.status(400).json({ statut: 'expire', error: 'Bon expiré', reference: bon.reference, nom_offre: bon.nom_offre, expire_at: bon.expire_at });
    }
    res.json({ reference: bon.reference, nom_offre: bon.nom_offre, expire_at: bon.expire_at, remis_at: bon.remis_at });
});

router.get('/:id/qrcode', requireAuth, ownEchangeParam, async (req, res) => {
    const result = await query('SELECT * FROM echanges WHERE id = $1 AND statut = $2', [req.params.id, 'valide']);
    const exchange = result.rows[0];
    if (!exchange) return res.status(404).json({ error: 'Bon QR introuvable' });
    res.json({ token_qr: exchange.token_qr, reference: exchange.reference, expire_at: exchange.expire_at, statut: exchange.statut });
});

export default router;
