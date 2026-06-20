import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export async function query(text: string, params?: any[]) {
    const client = await pool.connect();
    try {
        const result = await client.query(text, params);
        return result;
    } finally {
        client.release();
    }
}

// Exécute `fn` dans une transaction (BEGIN/COMMIT, ROLLBACK en cas d'erreur).
// `fn` reçoit une fonction `q` aux mêmes signatures que `query`, liée au client transactionnel.
export async function withTransaction<T>(
    fn: (q: (text: string, params?: any[]) => Promise<any>) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn((text, params) => client.query(text, params));
        await client.query('COMMIT');
        return result;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

export default pool;
