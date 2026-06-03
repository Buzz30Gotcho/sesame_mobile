import 'dotenv/config';
import { query } from './db';

async function clean() {
    console.log('--- Nettoyage de la base de données SÉSAME ---');
    try {
        // Ordre respectant les contraintes de clés étrangères
        const tables = [
            'messages_chat',
            'points_historique',
            'sanctions_en_attente',
            'echanges',
            'courses',
            'offres_boutique',
            'fournisseurs',
            'documents_chauffeur',
            'chauffeurs',
            'sous_comptes_employes',
            'ambassadeurs',
            'blacklist',
            'utilisateurs'
        ];

        for (const table of tables) {
            console.log(`Suppression des données de la table: ${table}...`);
            await query(`DELETE FROM ${table}`);
        }

        console.log('--- Nettoyage terminé ---');
        process.exit(0);
    } catch (err) {
        console.error('Erreur lors du nettoyage:', err);
        process.exit(1);
    }
}

clean();
