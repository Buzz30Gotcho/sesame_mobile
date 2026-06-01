import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'sesame-secret';

function signToken(userId: string) {
    return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '2h' });
}

router.post('/inscription', async (req, res) => {
    const { type, prenom, nom, email, telephone, mot_de_passe, date_naissance, lieu_naissance, pays_naissance } = req.body;
    if (!type || !prenom || !nom || !email || !telephone || !mot_de_passe) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    const hashed = await bcrypt.hash(mot_de_passe, 10);
    const userResult = await query(
        'INSERT INTO utilisateurs(type, prenom, nom, email, telephone, mot_de_passe_hash, date_naissance, lieu_naissance, pays_naissance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        [type, prenom, nom, email, telephone, hashed, date_naissance, lieu_naissance, pays_naissance]
    );

    const userId = userResult.rows[0].id;
    res.status(201).json({ token: signToken(userId), userId });
});

router.post('/connexion', async (req, res) => {
    const { email, mot_de_passe } = req.body;
    if (!email || !mot_de_passe) {
        return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const result = await query(
        `SELECT u.id,
                u.mot_de_passe_hash,
                u.type AS utilisateur_type,
                a.id AS ambassadeur_id,
                c.id AS chauffeur_id
         FROM utilisateurs u
         LEFT JOIN ambassadeurs a ON a.utilisateur_id = u.id
         LEFT JOIN chauffeurs c ON c.utilisateur_id = u.id
         WHERE u.email = $1`,
        [email]
    );

    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(mot_de_passe, user.mot_de_passe_hash))) {
        return res.status(401).json({ error: 'Identifiants invalides' });
    }

    res.json({
        token: signToken(user.id),
        userId: user.id,
        role: user.utilisateur_type,
        ambassadeur_id: user.ambassadeur_id || null,
        chauffeur_id: user.chauffeur_id || null,
    });
});

router.post('/deconnexion', async (req, res) => {
    res.json({ success: true });
});

router.post('/mot-de-passe-oublie', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });

    // TODO: implémenter envoi SMS via fournisseur externe
    res.json({ message: 'Code de réinitialisation envoyé si le compte existe.' });
});

router.post('/reinitialiser-mot-de-passe', async (req, res) => {
    const { email, code, nouveau_mot_de_passe } = req.body;
    if (!email || !code || !nouveau_mot_de_passe) {
        return res.status(400).json({ error: 'Email, code et nouveau mot de passe requis' });
    }

    // TODO: vérifier le code de réinitialisation et le stocker en base
    const hashed = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await query('UPDATE utilisateurs SET mot_de_passe = $1 WHERE email = $2', [hashed, email]);
    res.json({ message: 'Mot de passe réinitialisé.' });
});

export default router;
