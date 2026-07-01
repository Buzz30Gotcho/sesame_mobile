import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app';
import { pool, query } from './db';

export { app, query };

// Compteur global → emails / téléphones uniques (contraintes UNIQUE en base).
let seq = 0;
function nextSeq(): number {
    return seq++;
}

// Téléphone FR à 10 chiffres unique : 06xxxxxxxx.
function uniquePhone(): string {
    const n = String(600000000 + nextSeq()).padStart(9, '0');
    return `0${n}`.slice(0, 10);
}
function uniqueEmail(prefix: string): string {
    return `${prefix}_${nextSeq()}_${Date.now()}@test.fr`;
}

export const PASSWORD = 'password123';

export interface RegisteredUser {
    token: string;
    userId: string;
    role: string;
    ambassadeur_id: string | null;
    chauffeur_id: string | null;
    email: string;
    auth: { Authorization: string };
}

function asUser(body: any, email: string): RegisteredUser {
    return {
        token: body.token,
        userId: body.userId,
        role: body.role,
        ambassadeur_id: body.ambassadeur_id ?? null,
        chauffeur_id: body.chauffeur_id ?? null,
        email,
        auth: { Authorization: `Bearer ${body.token}` },
    };
}

// Inscrit un ambassadeur (physique par défaut) via la vraie route /inscription.
export async function registerAmbassadeur(overrides: Record<string, any> = {}): Promise<RegisteredUser> {
    const email = overrides.email ?? uniqueEmail('amb');
    const body = {
        type: 'ambassadeur',
        ambassador_type: 'physique',
        prenom: 'Amb',
        nom: 'Test',
        telephone: uniquePhone(),
        mot_de_passe: PASSWORD,
        ...overrides,
        email,
    };
    const res = await request(app).post('/api/auth/inscription').send(body);
    if (res.status !== 201) throw new Error(`registerAmbassadeur a échoué (${res.status}): ${JSON.stringify(res.body)}`);
    return asUser(res.body, email);
}

// Inscrit un chauffeur via la vraie route /inscription.
export async function registerChauffeur(overrides: Record<string, any> = {}): Promise<RegisteredUser> {
    const email = overrides.email ?? uniqueEmail('chf');
    const body = {
        type: 'chauffeur',
        prenom: 'Chf',
        nom: 'Test',
        telephone: uniquePhone(),
        mot_de_passe: PASSWORD,
        vehicule_type: 'berline',
        ...overrides,
        email,
    };
    const res = await request(app).post('/api/auth/inscription').send(body);
    if (res.status !== 201) throw new Error(`registerChauffeur a échoué (${res.status}): ${JSON.stringify(res.body)}`);
    return asUser(res.body, email);
}

// Insère un admin directement en base et renvoie un token admin (role='admin').
export async function createAdmin(role: string = 'super_admin'): Promise<{ id: string; token: string; auth: { Authorization: string } }> {
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(PASSWORD, 4);
    const email = uniqueEmail('admin');
    const ins = await query(
        `INSERT INTO admins(email, password_hash, nom, role, actif) VALUES ($1,$2,'Admin Test',$3,true) RETURNING id`,
        [email, hash, role]
    );
    const id = ins.rows[0].id;
    const token = jwt.sign({ sub: 'admin', role: 'admin', adminRole: role }, process.env.JWT_SECRET!, { expiresIn: '24h' });
    return { id, token, auth: { Authorization: `Bearer ${token}` } };
}

// Token admin (sans ligne en base) avec le rôle voulu — pour les tests de permissions.
export function adminToken(adminRole: string = 'super_admin'): { token: string; auth: { Authorization: string } } {
    const token = jwt.sign({ sub: 'admin', role: 'admin', adminRole }, process.env.JWT_SECRET!, { expiresIn: '24h' });
    return { token, auth: { Authorization: `Bearer ${token}` } };
}

// Accès direct à la base (pour préparer/asserter des données dans les tests).
export function db() {
    return pool;
}

// Modifie un paramètre système (upsert sur la clé).
export async function setParam(cle: string, valeur: string): Promise<void> {
    await query(
        `INSERT INTO parametres_systeme(cle, valeur) VALUES ($1,$2)
         ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
        [cle, valeur]
    );
}

// Insère un fournisseur signé + une offre en ligne, et renvoie leurs ids.
export async function seedOffre(opts: { pts_requis?: number; stock?: number | null; statut?: string } = {}): Promise<{ fournisseurId: string; offreId: string }> {
    const f = await query(
        `INSERT INTO fournisseurs(nom_societe, contrat_signe, statut) VALUES ('ACME', true, 'actif') RETURNING id`
    );
    const fournisseurId = f.rows[0].id;
    const o = await query(
        `INSERT INTO offres_boutique(fournisseur_id, nom, pts_requis, validite_bon_mois, stock, statut)
         VALUES ($1, 'Bon cadeau', $2, 6, $3, $4) RETURNING id`,
        [fournisseurId, opts.pts_requis ?? 5, opts.stock === undefined ? null : opts.stock, opts.statut ?? 'en_ligne']
    );
    return { fournisseurId, offreId: o.rows[0].id };
}

// Crédite directement des points à un ambassadeur (préparation de tests).
export async function crediterPoints(ambassadeurId: string, points: number): Promise<void> {
    await query('UPDATE ambassadeurs SET points_solde = $1 WHERE id = $2', [points, ambassadeurId]);
}

// Crée une course via la vraie route /creer pour l'ambassadeur fourni.
export async function createCourse(
    user: RegisteredUser,
    overrides: Record<string, any> = {}
): Promise<any> {
    const body = {
        ambassadeur_id: user.ambassadeur_id,
        adresse_depart: '1 rue de Paris, Paris',
        adresse_destination: '10 avenue de Lyon, Lyon',
        vehicule_type: 'berline',
        kilometrage: 10,
        type_course: 'immediate',
        ...overrides,
    };
    const res = await request(app).post('/api/courses/creer').set(user.auth).send(body);
    if (res.status !== 201) throw new Error(`createCourse a échoué (${res.status}): ${JSON.stringify(res.body)}`);
    return res.body;
}
