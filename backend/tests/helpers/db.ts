import pool, { query } from '../../src/db';

export { pool, query };

// Vide toutes les tables entre deux tests puis restaure les paramètres système seedés
// depuis le snapshot _seed_parametres (créé par globalSetup) — ainsi un test qui modifie
// un paramètre ne contamine pas les suivants. RESTART IDENTITY + CASCADE : séquences
// remises à zéro, contraintes FK levées le temps du TRUNCATE.
let cachedTableList: string | null = null;

export async function resetDb(): Promise<void> {
    if (cachedTableList === null) {
        const r = await pool.query(
            `SELECT tablename FROM pg_tables
             WHERE schemaname = 'public' AND tablename <> '_seed_parametres'`
        );
        cachedTableList = r.rows.map((row: any) => `"${row.tablename}"`).join(', ');
    }
    if (cachedTableList) {
        await pool.query(`TRUNCATE ${cachedTableList} RESTART IDENTITY CASCADE`);
        await pool.query(`INSERT INTO parametres_systeme SELECT * FROM _seed_parametres`);
    }
}
