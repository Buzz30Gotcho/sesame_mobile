import express from 'express';
import { query } from '../db';
import { calculatePoints } from '../lib/rules';

const router = express.Router();

function makeReference(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

router.post('/creer', async (req, res) => {
    const { ambassadeur_id, offre_id } = req.body;
    if (!ambassadeur_id || !offre_id) {
        return res.status(400).json({ error: 'Données manquantes' });
    }

    const offreResult = await query('SELECT * FROM offres_boutique WHERE id = $1 AND statut = $2', [offre_id, 'en_ligne']);
    const offre = offreResult.rows[0];
    if (!offre) return res.status(404).json({ error: 'Offre introuvable ou hors ligne' });

    const pointsNeeded = Number(offre.pts_requis);
    const exchangeReference = makeReference('BON');
    const tokenQr = `${exchangeReference}-${Math.floor(Math.random() * 1000000).toString(36).toUpperCase()}`;

    await query(
        'INSERT INTO echanges(reference, ambassadeur_id, offre_id, fournisseur_id, points_deduits, token_qr, statut, remis_at, expire_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [exchangeReference, ambassadeur_id, offre.id, offre.fournisseur_id, pointsNeeded, tokenQr, 'en_attente_admin', null, null]
    );

    res.status(201).json({ reference: exchangeReference, points_deduits: pointsNeeded, statut: 'en_attente_admin' });
});

router.get('/mes-bons', async (req, res) => {
    const { ambassadeur_id } = req.query;
    const result = await query('SELECT * FROM echanges WHERE ambassadeur_id = $1 ORDER BY remis_at DESC NULLS LAST', [ambassadeur_id]);
    res.json(result.rows);
});

router.get('/:id/qrcode', async (req, res) => {
    const result = await query('SELECT * FROM echanges WHERE id = $1 AND statut = $2', [req.params.id, 'valide']);
    const exchange = result.rows[0];
    if (!exchange) return res.status(404).json({ error: 'Bon QR invivable' });
    res.json({ token_qr: exchange.token_qr, reference: exchange.reference, expire_at: exchange.expire_at, statut: exchange.statut });
});

export default router;
