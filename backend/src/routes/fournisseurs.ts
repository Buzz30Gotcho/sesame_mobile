import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db';
import { fournisseurLimiter } from '../middleware/rateLimit';

const router = express.Router();

router.post('/valider-bon', fournisseurLimiter, async (req, res) => {
    const { token_qr, code_secret } = req.body;
    if (!token_qr || !code_secret) {
        return res.status(400).json({ error: 'token_qr et code_secret requis' });
    }

    const exchangeResult = await query('SELECT * FROM echanges WHERE token_qr = $1', [token_qr]);
    const exchange = exchangeResult.rows[0];
    if (!exchange) return res.status(404).json({ error: 'Bon introuvable' });
    if (exchange.statut === 'utilise' || exchange.statut === 'expire') {
        return res.status(400).json({ error: 'Bon déjà utilisé ou expiré' });
    }

    const fournisseurResult = await query('SELECT * FROM fournisseurs WHERE id = $1', [exchange.fournisseur_id]);
    const fournisseur = fournisseurResult.rows[0];
    if (!fournisseur || fournisseur.bloque) {
        return res.status(403).json({ error: 'Fournisseur non autorisé' });
    }

    const secretOk = await bcrypt.compare(code_secret, fournisseur.code_secret_hash);
    if (!secretOk) {
        await query('UPDATE fournisseurs SET nb_tentatives_echouees = nb_tentatives_echouees + 1 WHERE id = $1', [fournisseur.id]);
        if (fournisseur.nb_tentatives_echouees + 1 >= 3) {
            await query('UPDATE fournisseurs SET bloque = true WHERE id = $1', [fournisseur.id]);
        }
        return res.status(401).json({ error: 'Code secret incorrect' });
    }

    const offreResult = await query('SELECT * FROM offres_boutique WHERE id = $1 AND statut = $2', [exchange.offre_id, 'en_ligne']);
    const offre = offreResult.rows[0];
    if (!offre) {
        return res.status(400).json({ error: 'Offre non active' });
    }

    if (!exchange.remis_at || !exchange.expire_at) {
        return res.status(400).json({ error: 'Bon non prêt à être validé' });
    }
    if (new Date(exchange.expire_at) <= new Date()) {
        await query('UPDATE echanges SET statut = $1 WHERE id = $2', ['expire', exchange.id]);
        return res.status(400).json({ error: 'Bon expiré' });
    }

    // Code correct → on remet le compteur d'échecs à zéro (évite un verrouillage progressif au fil du temps).
    if (fournisseur.nb_tentatives_echouees > 0) {
        await query('UPDATE fournisseurs SET nb_tentatives_echouees = 0 WHERE id = $1', [fournisseur.id]);
    }

    await query('UPDATE echanges SET statut = $1, utilise_at = now() WHERE id = $2', ['utilise', exchange.id]);
    res.json({ success: true, message: 'Bon validé', reference: exchange.reference });
});

export default router;
