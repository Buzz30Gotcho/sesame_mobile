import { execSync } from 'child_process';
import { TEST_PG_CONTAINER } from './helpers/testConfig';

// Arrête et supprime le conteneur Postgres de test après la suite.
// KEEP_TEST_DB=1 le laisse tourner (dév itératif : runs suivants plus rapides).
module.exports = async function globalTeardown(): Promise<void> {
    if (process.env.KEEP_TEST_DB === '1') return;
    try {
        execSync(`docker rm -f ${TEST_PG_CONTAINER}`, { stdio: 'pipe' });
    } catch {
        // conteneur déjà absent : rien à faire
    }
};
