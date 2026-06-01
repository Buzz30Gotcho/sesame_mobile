# Bilan du projet SESAME

## Contexte général
Ce dépôt contient une application mobile Expo et un backend Node.js/TypeScript.
L'objectif est de construire plusieurs parties :
- app Ambassadeur
- app Chauffeur
- Dashboard Admin
- page web Fournisseur

Actuellement, l'app mobile est la partie la plus avancée dans le code.

## Etat actuel du projet
### Mobile
- Le projet mobile est sous `mobile/`.
- `mobile/package.json` est installé et compatible avec Expo SDK 54.
- `mobile/App.tsx` contient un navigateur de base avec deux écrans : `Login` et `Home`.
- `mobile/src/screens/HomeScreen.tsx` a été modifié pour récupérer des données Supabase depuis la table `courses`.
- `mobile/src/lib/supabase.ts` crée un client Supabase.
- `mobile/.env` contient déjà :
  - `SUPABASE_URL`
  - `SUPABASE_KEY` (publishable)
- `mobile/app.json` a été mis à jour pour ajouter `expo.extra` avec les mêmes clés Supabase.

### Backend
- Le backend est sous `backend/`.
- Il existe une structure Node.js/TypeScript avec `backend/src/` et `backend/src/schema.sql`.
- `backend/.env` est présent mais la connexion à la base n'a pas encore été testée.
- Les tâches backend restantes sont : configurer `DATABASE_URL`, `JWT_SECRET`, démarrer et tester `npm run dev`.

### Supabase / Base de données
- La connexion mobile vers Supabase est en cours de configuration.
- Le mobile utilise une clé publishable, ce qui est correct pour les lectures publiques si les règles le permettent.
- Le problème actuel est un message runtime : `missing supabase_url or supabase_key`.
- Le code a été ajusté pour lire les clés depuis `process.env` ou `Constants.expoConfig.extra`.

## Problèmes en cours
- L'application mobile affiche encore une erreur runtime sur les variables Supabase.
- La page `Home` reste visible et l'app ne passe pas encore à un flux plus complet.
- Il manque une vérification finale : redémarrage de Expo avec cache vidé et test du chargement des clés.

## Ce qui est déjà fait
- Bilan et organisation des fichiers créés / modifiés.
- Installation des dépendances mobiles.
- Mise en place d'un client Supabase dans le mobile.
- Ajout des clés Supabase dans `mobile/app.json`.
- Mise en place d'un écran `Home` qui pourrait afficher les courses.

## Ce qu'il faut faire maintenant
1. Choisir le flux principal à implémenter en premier :
   - app Chauffeur si tu veux démarrer mobile
   - app Ambassadeur si c'est le plus important
   - Admin ou Fournisseur si tu préfères la partie web
2. Faire l'UX / les écrans de ce flux pour montrer un résultat visuel.
3. Définir les tables nécessaires dans la base de données pour ce flux.
4. Connecter l'écran à Supabase pour rendre les données réelles.
5. Tester le backend si nécessaire pour ajouter des règles ou des routes serveur.

## Recommandation immédiate
- Si tu veux un résultat visible maintenant : continues sur l'app Chauffeur et rends l'écran `Home` fonctionnel.
- Si tu veux une base solide : fais d'abord l'UX du flux choisi, puis crée la DB et la connexion.

## Commandes utiles
```bash
cd mobile
npx expo start -c
```

```bash
cd backend
npm install
npm run dev
```

---

> Ce fichier est un résumé de l'avancement actuel et de la feuille de route. Tu peux le copier ou l'utiliser comme guide pour continuer.
