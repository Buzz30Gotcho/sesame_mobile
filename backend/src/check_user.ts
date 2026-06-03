import 'dotenv/config';
import { query } from './db';

async function checkUser() {
    const result = await query("SELECT id, email, mot_de_passe_hash, type FROM utilisateurs WHERE email = 'jean@hotel.fr'");
    console.log('User check:', result.rows);
    process.exit(0);
}

checkUser();
