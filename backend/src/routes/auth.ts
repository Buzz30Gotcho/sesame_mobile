import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomInt } from 'crypto';
import { query } from '../db';
import { stripe } from '../lib/stripeClient';
import { sendResetEmail } from '../lib/mailer';
import { JWT_SECRET, IS_PROD } from '../config';

const router = express.Router();

function luhnCheck(num: string): boolean {
    let sum = 0;
    for (let i = 0; i < num.length; i++) {
        let d = parseInt(num[num.length - 1 - i]);
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return sum % 10 === 0;
}


function signToken(userId: string) {
    // 24h : l'app rafraîchit automatiquement le token avant/à son expiration (intercepteur axios).
    return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '24h' });
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
        code += chars[randomInt(chars.length)];
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
        vehicule_immat,
        code_parrainage_parrain,
    } = req.body;

    try {
        if (!type) return res.status(400).json({ error: 'Type de compte manquant' });
        if (!email) return res.status(400).json({ error: 'Email obligatoire' });
        if (!telephone) return res.status(400).json({ error: 'Téléphone obligatoire' });
        if (!mot_de_passe) return res.status(400).json({ error: 'Mot de passe obligatoire' });
        if (mot_de_passe.length < 8) {
            return res.status(400).json({ error: 'Mot de passe trop court (8 caractères minimum).' });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({ error: 'Adresse email invalide.' });
        }
        const phoneClean = telephone.replace(/[\s\-\.]/g, '');
        if (!/^(\+?\d{9,15})$/.test(phoneClean)) {
            return res.status(400).json({ error: 'Numéro de téléphone invalide.' });
        }

        if (siret) {
            const s = siret.replace(/\s/g, '');
            if (!/^\d{14}$/.test(s) || !luhnCheck(s)) {
                return res.status(400).json({ error: 'SIRET invalide (14 chiffres).' });
            }
        }
        if (iban) {
            const i = iban.replace(/\s/g, '').toUpperCase();
            if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(i)) {
                return res.status(400).json({ error: 'IBAN invalide.' });
            }
        }

        const dateNaissanceISO = parseDateNaissance(date_naissance);

        // Vérification blacklist — toujours par téléphone, et par identité si les champs sont présents
        {
            let blacklistQuery = `SELECT id FROM blacklist WHERE LOWER(telephone) = LOWER($1)`;
            const blacklistParams: any[] = [telephone];
            if (nom && prenom && dateNaissanceISO && lieu_naissance) {
                blacklistQuery += ` OR (LOWER(nom) = LOWER($2) AND LOWER(prenom) = LOWER($3) AND date_naissance = $4 AND LOWER(lieu_naissance) = LOWER($5))`;
                blacklistParams.push(nom, prenom, dateNaissanceISO, lieu_naissance);
            }
            const blacklistCheck = await query(blacklistQuery, blacklistParams);
            if (blacklistCheck.rows.length > 0) {
                return res.status(400).json({ error: 'Difficulté technique pour valider votre inscription. Contactez support@sesame-pro.com' });
            }
        }

        const hashed = await bcrypt.hash(mot_de_passe, 10);

        const statutInscription = (type === 'ambassadeur' && ambassador_type === 'moral') ? 'suspendu' : 'actif';
        const userResult = await query(
            `INSERT INTO utilisateurs(type, prenom, nom, email, telephone, mot_de_passe_hash, date_naissance, lieu_naissance, pays_naissance, statut)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [type, prenom || '', nom || '', email, telephone, hashed, dateNaissanceISO, lieu_naissance || null, pays_naissance || null, statutInscription]
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

            // Résoudre le parrain si un code de parrainage a été saisi (uniquement Physique)
            let parrainId: string | null = null;
            if (code_parrainage_parrain && (ambassador_type === 'physique' || !ambassador_type)) {
                const parrainRes = await query(
                    `SELECT a.id FROM ambassadeurs a
                     JOIN utilisateurs u ON u.id = a.utilisateur_id
                     WHERE a.code_parrainage = $1 AND a.type_ambassadeur = 'physique' AND u.statut = 'actif'`,
                    [code_parrainage_parrain.trim().toUpperCase()]
                );
                parrainId = parrainRes.rows[0]?.id || null;
            }

            await query(
                `INSERT INTO ambassadeurs(utilisateur_id, type_ambassadeur, etablissement, metier, siret, iban, responsable_legal_nom, code_parrainage, parrain_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    userId,
                    ambassador_type || 'physique',
                    etablissement || null,
                    metier || null,
                    siret || null,
                    iban || null,
                    ambassador_type === 'moral' ? `${prenom} ${nom}` : null,
                    codeParrainage,
                    parrainId,
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

        let ambassadeur_id: string | null = null;
        let chauffeur_id: string | null = null;

        if (type === 'ambassadeur') {
            const r = await query('SELECT id FROM ambassadeurs WHERE utilisateur_id = $1', [userId]);
            ambassadeur_id = r.rows[0]?.id || null;
        } else if (type === 'chauffeur') {
            const r = await query('SELECT id FROM chauffeurs WHERE utilisateur_id = $1', [userId]);
            chauffeur_id = r.rows[0]?.id || null;
        }

        res.status(201).json({ token: signToken(userId), userId, role: type, ambassadeur_id, chauffeur_id });
    } catch (err: any) {
        console.error('[inscription]', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Cet email ou ce numéro de téléphone est déjà utilisé.' });
        }
        res.status(500).json({ error: err.message || 'Erreur serveur lors de l\'inscription' });
    }
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
                a.contrat_moral_signe,
                c.id AS chauffeur_id,
                (SELECT id FROM sous_comptes_employes WHERE utilisateur_id = u.id LIMIT 1) AS sous_compte_id
         FROM utilisateurs u
         LEFT JOIN ambassadeurs a ON a.utilisateur_id = u.id
         LEFT JOIN chauffeurs c ON c.utilisateur_id = u.id
         WHERE u.email = $1`,
        [email]
    );

    const user = result.rows[0];
    // En prod : ne pas loguer de données personnelles (PII / RGPD). Log de débogage en dev uniquement.
    if (!IS_PROD) {
        console.log('[connexion] email:', email, 'user_id:', user?.id, 'ambassadeur_id:', user?.ambassadeur_id);
    }
    if (!user || !(await bcrypt.compare(mot_de_passe, user.mot_de_passe_hash))) {
        return res.status(401).json({ error: 'Identifiants invalides' });
    }
    if (user.statut === 'suspendu') {
        let msg: string;
        if (user.type_ambassadeur === 'moral' && !user.contrat_moral_signe) {
            msg = 'Votre compte entreprise est en attente de validation par notre équipe.\nVous serez contacté dès que votre dossier sera examiné.';
        } else if (user.utilisateur_type === 'chauffeur') {
            msg = 'Compte suspendu.\nRéglez votre facture depuis l\'app pour réactiver votre accès.';
        } else {
            msg = 'Votre compte a été suspendu.\nContactez support@sesame-pro.com pour plus d\'informations.';
        }
        return res.status(403).json({ error: msg });
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
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });

    const result = await query('SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER($1)', [email]);
    if (result.rows.length === 0) {
        return res.json({ message: 'Code envoyé si le compte existe.' });
    }

    const code = randomInt(100000, 1000000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await query(
        'UPDATE utilisateurs SET reset_code = $1, reset_code_expires_at = $2 WHERE LOWER(email) = LOWER($3)',
        [code, expires, email]
    );

    await sendResetEmail(email, code);

    res.json({ message: 'Code envoyé si le compte existe.' });
});

router.post('/reinitialiser-mot-de-passe', async (req, res) => {
    const { email, code, nouveau_mot_de_passe } = req.body;
    if (!email || !code || !nouveau_mot_de_passe) {
        return res.status(400).json({ error: 'Email, code et nouveau mot de passe requis' });
    }
    if (nouveau_mot_de_passe.length < 8) {
        return res.status(400).json({ error: 'Mot de passe trop court (8 caractères minimum).' });
    }

    const result = await query(
        'SELECT id, reset_code, reset_code_expires_at FROM utilisateurs WHERE LOWER(email) = LOWER($1)',
        [email]
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
        'UPDATE utilisateurs SET mot_de_passe_hash = $1, reset_code = NULL, reset_code_expires_at = NULL WHERE LOWER(email) = LOWER($2)',
        [hashed, email]
    );

    res.json({ message: 'Mot de passe réinitialisé.' });
});

router.post('/refresh', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token requis' });
    const token = authHeader.split(' ')[1];
    try {
        // On accepte un token EXPIRÉ (on vérifie juste la signature) pour pouvoir le rafraîchir.
        // Garde-fou : un token plus vieux que 30 jours ne peut plus être rafraîchi → reconnexion forcée.
        const payload = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as { sub: string; iat?: number };
        const MAX_AGE_S = 30 * 24 * 3600;
        if (payload.iat && Date.now() / 1000 - payload.iat > MAX_AGE_S) {
            return res.status(401).json({ error: 'Session expirée, reconnexion requise' });
        }
        const result = await query(
            `SELECT u.id,
                    u.type AS utilisateur_type,
                    u.statut,
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
        // Sécurité : un compte suspendu / blacklisté ne doit pas pouvoir renouveler son token.
        // On force la reconnexion → /connexion renverra le message détaillé adapté à son statut.
        if (user.statut !== 'actif') {
            return res.status(401).json({ error: 'Compte non actif, reconnexion requise' });
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
    } catch {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
});


export default router;
