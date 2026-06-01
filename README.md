# sesame_mobile

Application SESAME 1 JUIN 2026

Ce dépôt contient une structure initiale pour :
- un backend Node.js + Express + PostgreSQL
- une application mobile React Native Expo

Le backend implémente les routes principales selon la spécification SESAME : authentification, courses, boutique, échanges QR, validation fournisseurs, chat, admin.

## Structure

- `backend/` : API Express + TypeScript
- `mobile/` : application Expo React Native

## Démarrage

### Backend

1. `cd backend`
2. `npm install`
3. `cp .env.example .env` et ajuster `DATABASE_URL` et `JWT_SECRET`
4. `npm run dev`

### Mobile

1. `cd mobile`
2. `npm install`
3. `npm run start`

## Notes

- La base de données contient le schéma SQL complet dans `backend/src/schema.sql`.
- Les règles métier critiques sont encapsulées dans `backend/src/lib/rules.ts`.
- Les interfaces mobiles sont implémentées avec la charte de couleurs SESAME.
