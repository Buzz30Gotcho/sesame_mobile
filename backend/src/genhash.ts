// Génère le hash bcrypt d'un mot de passe admin, à coller dans ADMIN_PASSWORD_HASH (.env).
// Usage : npm run genhash -- "MonMotDePasse"
import bcrypt from 'bcrypt';

const pw = process.argv[2];
if (!pw) {
    console.error('Usage : npm run genhash -- "<mot_de_passe>"');
    process.exit(1);
}

bcrypt.hash(pw, 10).then((hash) => {
    console.log('\nAjoutez cette ligne à votre .env :\n');
    console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
});
