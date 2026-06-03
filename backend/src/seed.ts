import 'dotenv/config';
import bcrypt from 'bcrypt';
import { query } from './db';

async function safeQuery(sql: string, params?: any[]) {
    try {
        return await query(sql, params);
    } catch (err: any) {
        if (err.code === '42P01') {
            console.warn(`[Attention] La table n'existe pas encore, elle sera ignorée : ${sql.split(' ')[2]}`);
            return { rows: [] };
        }
        throw err;
    }
}

async function seed() {
    console.log('--- Démarrage du seeding SÉSAME (Spécifications Mai 2026) ---');
    const passwordHash = await bcrypt.hash('sesame123', 10);

    try {
        console.log('Nettoyage des anciennes données de test...');
        const emails = ['admin@sesame-pro.com', 'jean@hotel.fr', 'ahmed@chauffeur.fr'];
        
        // Nettoyage sécurisé
        await safeQuery(`DELETE FROM messages_chat WHERE course_id IN (SELECT id FROM courses WHERE reference LIKE 'CRS-100%')`);
        await safeQuery(`DELETE FROM courses WHERE reference LIKE 'CRS-100%'`);
        await safeQuery(`DELETE FROM echanges WHERE ambassadeur_id IN (SELECT a.id FROM ambassadeurs a JOIN utilisateurs u ON a.utilisateur_id = u.id WHERE u.email = ANY($1))`, [emails]);
        await safeQuery(`DELETE FROM offres_boutique WHERE reference = 'KRT-30MIN'`);
        await safeQuery(`DELETE FROM fournisseurs WHERE legal_email = 'contact@karting.fr'`);
        await safeQuery(`DELETE FROM ambassadeurs WHERE utilisateur_id IN (SELECT id FROM utilisateurs WHERE email = ANY($1))`, [emails]);
        await safeQuery(`DELETE FROM chauffeurs WHERE utilisateur_id IN (SELECT id FROM utilisateurs WHERE email = ANY($1))`, [emails]);
        await safeQuery(`DELETE FROM utilisateurs WHERE email = ANY($1)`, [emails]);

        console.log('Création des utilisateurs...');
        
        // ADMIN
        const adminRes = await query(`
            INSERT INTO utilisateurs (type, prenom, nom, email, telephone, mot_de_passe_hash) 
            VALUES ('admin', 'Abdallah', 'NAJAH', 'admin@sesame-pro.com', '0745207006', $1) RETURNING id`, [passwordHash]);

        // AMBASSADEUR PHYSIQUE (Jean Dupont)
        const uAmb1Res = await query(`
            INSERT INTO utilisateurs (type, prenom, nom, email, telephone, mot_de_passe_hash) 
            VALUES ('ambassadeur', 'Jean', 'Dupont', 'jean@hotel.fr', '0601020304', $1) RETURNING id`, [passwordHash]);
        const uAmb1Id = uAmb1Res.rows[0].id;

        const amb1Res = await query(`
            INSERT INTO ambassadeurs (utilisateur_id, type_ambassadeur, etablissement, metier, points_solde, niveau, code_parrainage) 
            VALUES ($1, 'physique', 'Hôtel Mercure', 'Réceptionniste', 847, 'pro', 'JD2026') RETURNING id`, [uAmb1Id]);
        const amb1Id = amb1Res.rows[0].id;

        // CHAUFFEUR (Ahmed Benali)
        const uChauf1Res = await query(`
            INSERT INTO utilisateurs (type, prenom, nom, email, telephone, mot_de_passe_hash) 
            VALUES ('chauffeur', 'Ahmed', 'Benali', 'ahmed@chauffeur.fr', '0605060708', $1) RETURNING id`, [passwordHash]);
        const uChauf1Id = uChauf1Res.rows[0].id;

        const chauf1Res = await query(`
            INSERT INTO chauffeurs (utilisateur_id, vehicule_type, vehicule_marque, vehicule_modele, vehicule_couleur, vehicule_immat, disponible)
            VALUES ($1, 'berline', 'Toyota', 'Camry', 'Gris', 'AB-123-CD', true) RETURNING id`, [uChauf1Id]);
        const chauf1Id = chauf1Res.rows[0].id;

        console.log('Ajout des partenaires et offres...');
        const secretHash = await bcrypt.hash('1234', 10);
        
        const f1Res = await query(`
            INSERT INTO fournisseurs (nom_societe, legal_email, code_secret_hash, contrat_signe, statut, option_paiement)
            VALUES ('Karting Aventure', 'contact@karting.fr', $1, true, 'actif', 'c') RETURNING id`, [secretHash]);
        const f1Id = f1Res.rows[0].id;

        await query(`
            INSERT INTO offres_boutique (fournisseur_id, reference, nom, pts_requis, stock, validite_bon_mois, statut) 
            VALUES ($1, 'KRT-30MIN', 'Session Karting 30 min', 75, 100, 3, 'en_ligne')`, [f1Id]);

        console.log("Ajout de l'historique des courses...");
        await safeQuery(`
            INSERT INTO courses (reference, ambassadeur_id, chauffeur_id, statut, type_course, adresse_depart, adresse_destination, montant, points_attribues, date_fin)
            VALUES
            ('CRS-1001', $1, $2, 'terminee', 'immediate', 'Hôtel Mercure', 'Aéroport Montpellier', 36.00, 3, now() - interval '2 days'),
            ('CRS-1002', $1, $2, 'terminee', 'reservation', 'Gare Saint-Roch', 'Montpellier Business School', 24.50, 2, now() - interval '1 day')`, [amb1Id, chauf1Id]);

        console.log('--- Seeding terminé avec succès ---');
        console.log('Comptes créés (Password: sesame123):');
        console.log('- Admin: admin@sesame-pro.com');
        console.log('- Ambassadeur: jean@hotel.fr');
        console.log('- Chauffeur: ahmed@chauffeur.fr');
        
        process.exit(0);
    } catch (err) {
        console.error('Erreur lors du seeding:', err);
        process.exit(1);
    }
}

seed();
