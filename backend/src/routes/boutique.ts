import express from 'express';
import { query } from '../db';

const router = express.Router();

router.get('/offres', async (req, res) => {
    // Boutique bloquée si contrat fournisseur non signé (specs §6.3)
    const result = await query(
        `SELECT o.* FROM offres_boutique o
         JOIN fournisseurs f ON f.id = o.fournisseur_id
         WHERE o.statut = 'en_ligne'
           AND (o.stock IS NULL OR o.stock > 0)
           AND f.contrat_signe = true
           AND f.statut <> 'suspendu'
         ORDER BY o.nom ASC`
    );
    res.json(result.rows);
});

export default router;
