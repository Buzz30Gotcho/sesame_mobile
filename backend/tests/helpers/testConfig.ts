// Configuration partagée du Postgres de test (conteneur Docker jetable).
// Port volontairement non standard pour ne pas entrer en conflit avec un Postgres local.
export const TEST_PG_CONTAINER = 'sesame-test-pg';
export const TEST_PG_PORT = 55433;
export const TEST_PG_DB = 'sesame_test';
export const TEST_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${TEST_PG_PORT}/${TEST_PG_DB}`;
