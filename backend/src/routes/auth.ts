import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'sesame-secret';

function signToken(userId: string) {
    return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '2h' });
}

function generateCodeParrainage(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

router.post('/inscription', async (req, res) => {
    const {
        type,
        ambassador_type,
        prenom,
        nom,
        email,
        telephone,
        mot_de_passe,
        date_naissance,
        lieu_naissance,
        pays_naissance,
        etablissement,
        metier,
        cp,
        raison_sociale,
        siret,
        iban,
        vehicule_type,
        vehicule_marque,
        vehicule_modele,
        vehicule_couleur,
        vehicule_immat
    } = req.body;

    if (!type || !email || !telephone || !mot_de_passe) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    // Vérification blacklist avant création (critères : nom + prénom + date_naissance + lieu_naissance + telephone)
    if (nom && prenom && date_naissance && lieu_naissance) {
        const blacklistCheck = await query(
            `SELECT id FROM blacklist WHERE LOWER(telephone) = LOWER($1) OR (LOWER(nom) = LOWER($2) AND LOWER(prenom) = LOWER($3) AND date_naissance = $4 AND LOWER(lieu_naissance) = LOWER($5))`,
            [telephone, nom, prenom, date_naissance, lieu_naissance]
        );
        if (blacklistCheck.rows.length > 0) {
            // Blocage silencieux — ne jamais mentionner la blacklist
            return res.status(400).json({ error: 'Difficulté technique pour valider votre inscription. Contactez support@sesame-pro.com' });
        }
    }

    const hashed = await bcrypt.hash(mot_de_passe, 10);

    const userResult = await query(
        `INSERT INTO utilisateurs(type, prenom, nom, email, telephone, mot_de_passe_hash, date_naissance, lieu_naissance, pays_naissance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [type, prenom || '', nom || '', email, telephone, hashed, date_naissance || null, lieu_naissance || null, pays_naissance || null]
    );

    const userId = userResult.rows[0].id;

    if (type === 'ambassadeur') {
        // Générer un code_parrainage unique à 6 caractères
        let codeParrainage = generateCodeParrainage();
        let exists = await query('SELECT id FROM ambassadeurs WHERE code_parrainage = $1', [codeParrainage]);
        while (exists.rows.length > 0) {
            codeParrainage = generateCodeParrainage();
            exists = await query('SELECT id FROM ambassadeurs WHERE code_parrainage = $1', [codeParrainage]);
        }

        await query(
            `INSERT INTO ambassadeurs(utilisateur_id, type_ambassadeur, etablissement, metier, siret, iban, responsable_legal_nom, code_parrainage)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                userId,
                ambassador_type || 'physique',
                etablissement || null,
                metier || null,
                siret || null,
                iban || null,
                ambassador_type === 'moral' ? `${prenom} ${nom}` : null,
                codeParrainage
            ]
        );
    } else if (type === 'chauffeur') {
        await query(
            `INSERT INTO chauffeurs(utilisateur_id, vehicule_type, vehicule_marque, vehicule_modele, vehicule_couleur, vehicule_immat, iban, siret)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [userId, vehicule_type || 'berline', vehicule_marque || null, vehicule_modele || null, vehicule_couleur || null, vehicule_immat || null, iban || null, siret || null]
        );
    }

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
    await query('UPDATE utilisateurs SET mot_de_passe_hash = $1 WHERE email = $2', [hashed, email]);
    res.json({ message: 'Mot de passe réinitialisé.' });
});

router.post('/refresh', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token requis' });
    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
        const result = await query(
            `SELECT u.id, u.type AS utilisateur_type, a.id AS ambassadeur_id, c.id AS chauffeur_id
             FROM utilisateurs u
             LEFT JOIN ambassadeurs a ON a.utilisateur_id = u.id
             LEFT JOIN chauffeurs c ON c.utilisateur_id = u.id
             WHERE u.id = $1`,
            [payload.sub]
        );
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
        res.json({
            token: signToken(user.id),
            userId: user.id,
            role: user.utilisateur_type,
            ambassadeur_id: user.ambassadeur_id || null,
            chauffeur_id: user.chauffeur_id || null,
        });
    } catch {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
});


export default router;
