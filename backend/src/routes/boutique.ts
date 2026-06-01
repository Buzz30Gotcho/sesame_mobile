import express from 'express';
import { query } from '../db';

const router = express.Router();

router.get('/offres', async (req, res) => {
    const result = await query('SELECT * FROM offres_boutique WHERE statut = $1 AND (stock IS NULL OR stock > 0) ORDER BY nom ASC', ['en_ligne']);
    res.json(result.rows);
});

export default router;
