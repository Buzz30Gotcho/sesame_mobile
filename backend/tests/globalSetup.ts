import { execSync } from 'child_process';
import path from 'path';
import { TEST_PG_CONTAINER, TEST_PG_PORT, TEST_PG_DB } from './helpers/testConfig';

// Démarre un Postgres jetable (Docker) AVANT toute la suite et applique les migrations
// 001/002. Conteneur recréé à neuf à chaque run → état propre garanti. Une seule
// commande `npm test` suffit (prérequis : daemon Docker démarré).
//
// Dév itératif : KEEP_TEST_DB=1 conserve le conteneur entre les runs (cf. globalTeardown)
// et réutilise un conteneur déjà migré pour gagner ~8 s.

const IMAGE = 'postgres:16-alpine';

function sh(cmd: string, opts: { silent?: boolean } = {}): string {
    return execSync(cmd, { stdio: opts.silent ? 'pipe' : 'inherit', encoding: 'utf8' }) as unknown as string;
}
function silent(cmd: string): string | null {
    try { return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' }).toString(); } catch { return null; }
}

function ensureDockerAvailable(): void {
    if (silent('docker info') === null) {
        throw new Error(
            '\n[tests] Docker est requis pour les tests d\'intégration backend mais le daemon ne répond pas.\n' +
            '        Démarre Docker puis relance `npm test`.\n'
        );
    }
}

function isRunning(): boolean {
    const out = silent(`docker ps --filter "name=^/${TEST_PG_CONTAINER}$" --filter "status=running" --format "{{.Names}}"`);
    return !!out && out.trim() === TEST_PG_CONTAINER;
}

function migrationsApplied(): boolean {
    const out = silent(
        `docker exec ${TEST_PG_CONTAINER} psql -U postgres -d ${TEST_PG_DB} -tAc ` +
        `"SELECT to_regclass('public.utilisateurs') IS NOT NULL"`
    );
    return !!out && out.trim() === 't';
}

function applyMigrations(): void {
    const dir = path.resolve(__dirname, '../src/migrations');
    for (const f of ['001_schema_initial.sql', '002_migration_safe.sql']) {
        sh(`docker cp "${path.join(dir, f)}" ${TEST_PG_CONTAINER}:/tmp/${f}`, { silent: true });
        sh(`docker exec ${TEST_PG_CONTAINER} psql -U postgres -d ${TEST_PG_DB} -v ON_ERROR_STOP=1 -q -f /tmp/${f}`, { silent: true });
    }
}

// Snapshot des paramètres système seedés → restauré entre chaque test (resetDb),
// pour qu'un test modifiant un paramètre ne contamine pas les suivants.
function createSeedSnapshot(): void {
    sh(
        `docker exec ${TEST_PG_CONTAINER} psql -U postgres -d ${TEST_PG_DB} -q -c ` +
        `"CREATE TABLE IF NOT EXISTS _seed_parametres AS TABLE parametres_systeme"`,
        { silent: true }
    );
}

module.exports = async function globalSetup(): Promise<void> {
    ensureDockerAvailable();

    if (isRunning()) {
        if (!migrationsApplied()) applyMigrations();
        createSeedSnapshot();
        return; // réutilisation (KEEP_TEST_DB du run précédent)
    }

    silent(`docker rm -f ${TEST_PG_CONTAINER}`);
    sh(
        `docker run -d --name ${TEST_PG_CONTAINER} ` +
        `-e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=${TEST_PG_DB} ` +
        `-p ${TEST_PG_PORT}:5432 ${IMAGE}`,
        { silent: true }
    );

    // Attente de disponibilité (jusqu'à 60 s). On ne se fie PAS à pg_isready seul :
    // l'image postgres démarre un serveur d'init temporaire puis le redémarre, et
    // pg_isready peut répondre « prêt » pendant cette phase → une requête tombe alors
    // sur « the database system is shutting down ». On exige donc un vrai SELECT 1
    // réussi sur la base cible pour considérer le serveur réellement prêt.
    let ready = false;
    for (let i = 0; i < 60; i++) {
        const out = silent(`docker exec ${TEST_PG_CONTAINER} psql -U postgres -d ${TEST_PG_DB} -tAc "SELECT 1"`);
        if (out !== null && out.trim() === '1') { ready = true; break; }
        await new Promise(r => setTimeout(r, 1000));
    }
    if (!ready) throw new Error('[tests] Le Postgres de test n\'est pas devenu disponible à temps.');

    applyMigrations();
    createSeedSnapshot();
};
