import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import twilio from 'twilio';
import { query } from '../db';
import { stripe } from '../lib/stripeClient';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'sesame-secret';

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendSMS(to: string, body: string): Promise<void> {
    await twilioClient.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER!,
        to,
        body,
    });
}

function signToken(userId: string) {
    return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '2h' });
}

function parseDateNaissance(dateStr: string | undefined | null): string | null {
    if (!dateStr) return null;
    const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
        return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
    return dateStr;
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

    const dateNaissanceISO = parseDateNaissance(date_naissance);

    // Vérification blacklist avant création (critères : nom + prénom + date_naissance + lieu_naissance + telephone)
    if (nom && prenom && dateNaissanceISO && lieu_naissance) {
        const blacklistCheck = await query(
            `SELECT id FROM blacklist WHERE LOWER(telephone) = LOWER($1) OR (LOWER(nom) = LOWER($2) AND LOWER(prenom) = LOWER($3) AND date_naissance = $4 AND LOWER(lieu_naissance) = LOWER($5))`,
            [telephone, nom, prenom, dateNaissanceISO, lieu_naissance]
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
        [type, prenom || '', nom || '', email, telephone, hashed, dateNaissanceISO, lieu_naissance || null, pays_naissance || null]
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
        const customer = await stripe.customers.create({
            email,
            name: `${prenom || ''} ${nom || ''}`.trim(),
            metadata: { sesame_user_id: userId },
        }).catch(() => null);

        await query(
            `INSERT INTO chauffeurs(utilisateur_id, vehicule_type, vehicule_marque, vehicule_modele, vehicule_couleur, vehicule_immat, iban, siret, stripe_customer_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [userId, vehicule_type || 'berline', vehicule_marque || null, vehicule_modele || null, vehicule_couleur || null, vehicule_immat || null, iban || null, siret || null, customer?.id || null]
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
                u.statut,
                u.type AS utilisateur_type,
                a.id AS ambassadeur_id,
                a.type_ambassadeur,
                c.id AS chauffeur_id,
                (SELECT id FROM sous_comptes_employes WHERE utilisateur_id = u.id LIMIT 1) AS sous_compte_id
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
    if (user.statut === 'suspendu') {
        return res.status(403).json({ error: 'Compte suspendu. Réglez votre facture depuis l\'app pour réactiver votre accès.' });
    }
    if (user.statut === 'blackliste') {
        return res.status(403).json({ error: 'Difficulté technique pour valider votre connexion. Contactez support@sesame-pro.com' });
    }

    res.json({
        token: signToken(user.id),
        userId: user.id,
        role: user.utilisateur_type,
        ambassadeur_id: user.ambassadeur_id || null,
        chauffeur_id: user.chauffeur_id || null,
        type_ambassadeur: user.type_ambassadeur || null,
        is_sous_compte: !!user.sous_compte_id,
    });
});

router.post('/deconnexion', async (req, res) => {
    res.json({ success: true });
});

router.post('/mot-de-passe-oublie', async (req, res) => {
    const { telephone } = req.body;
    if (!telephone) return res.status(400).json({ error: 'Numéro de téléphone requis' });

    const result = await query('SELECT id, prenom FROM utilisateurs WHERE telephone = $1', [telephone]);
    // Réponse identique que le compte existe ou non (sécurité)
    if (result.rows.length === 0) {
        return res.json({ message: 'Code envoyé si le compte existe.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await query(
        'UPDATE utilisateurs SET reset_code = $1, reset_code_expires_at = $2 WHERE telephone = $3',
        [code, expires, telephone]
    );

    await sendSMS(telephone, `SÉSAME - Votre code de réinitialisation : ${code}\nValable 15 minutes.`);

    res.json({ message: 'Code envoyé si le compte existe.' });
});

router.post('/reinitialiser-mot-de-passe', async (req, res) => {
    const { telephone, code, nouveau_mot_de_passe } = req.body;
    if (!telephone || !code || !nouveau_mot_de_passe) {
        return res.status(400).json({ error: 'Téléphone, code et nouveau mot de passe requis' });
    }

    const result = await query(
        'SELECT id, reset_code, reset_code_expires_at FROM utilisateurs WHERE telephone = $1',
        [telephone]
    );

    const user = result.rows[0];
    if (!user || user.reset_code !== code) {
        return res.status(400).json({ error: 'Code incorrect.' });
    }
    if (!user.reset_code_expires_at || new Date() > new Date(user.reset_code_expires_at)) {
        return res.status(400).json({ error: 'Code expiré. Veuillez recommencer.' });
    }

    const hashed = await bcrypt.hash(nouveau_mot_de_passe, 10);
    await query(
        'UPDATE utilisateurs SET mot_de_passe_hash = $1, reset_code = NULL, reset_code_expires_at = NULL WHERE telephone = $2',
        [hashed, telephone]
    );

    res.json({ message: 'Mot de passe réinitialisé.' });
});

router.post('/refresh', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token requis' });
    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
        const result = await query(
            `SELECT u.id,
                    u.type AS utilisateur_type,
                    a.id AS ambassadeur_id,
                    a.type_ambassadeur,
                    c.id AS chauffeur_id,
                    (SELECT id FROM sous_comptes_employes WHERE utilisateur_id = u.id LIMIT 1) AS sous_compte_id
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
            type_ambassadeur: user.type_ambassadeur || null,
            is_sous_compte: !!user.sous_compte_id,
        });
    } catch {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
});


export default router;
