# 🚀 Guide de déploiement SÉSAME

Checklist à suivre avant et pendant la mise en production.
Domaine officiel (specs) : **`sesame-pro.com`** — page fournisseur : **`sesame-pro.com/valider`**.

---

## 1. Variables d'environnement — Backend

À définir dans le panneau de l'hébergeur (Railway / Render), **PAS** dans le code.

### 🔴 Critiques (sécurité — valeurs FORTES obligatoires)

| Variable | Rôle | Conseil |
|---|---|---|
| `JWT_SECRET` | Signe les tokens de connexion | **≥ 32 caractères aléatoires** (le serveur refuse de démarrer sinon). Générer : `openssl rand -base64 48` |
| `ADMIN_EMAIL` | Identifiant admin | — |
| `ADMIN_PASSWORD` | Mot de passe admin (stocké en clair dans l'env) | **long et aléatoire** |
| `NODE_ENV` | Mode production | `production` (masque les erreurs 500, coupe les logs PII) |

### 🟠 Connexions externes (obligatoires)

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion PostgreSQL |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Accès Supabase |
| `STRIPE_SECRET_KEY` | Stripe — clé **live** `sk_live_…` en prod |
| `STRIPE_WEBHOOK_SECRET` | Vérifie la signature des webhooks Stripe |
| `GMAIL_USER` + `GMAIL_APP_PASSWORD` | Envoi des emails (code de réinitialisation) |

### 🟡 Réglages

| Variable | Valeur en prod |
|---|---|
| `CORS_ORIGINS` | URL autorisées séparées par virgule, ex : `https://sesame-pro.com` |
| `EMAIL_DEV_MODE` | **`false`** (ou absente) — sinon les codes s'affichent dans les logs au lieu d'être envoyés |
| `BACKEND_URL` | URL publique du backend, ex : `https://sesame-pro.com` |
| `PORT` | Souvent défini automatiquement par l'hébergeur (le code fait `process.env.PORT || 4000`) |

---

## 2. Variables d'environnement — Mobile (build Expo)

| Variable | Valeur |
|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | **`https://sesame-pro.com`** (URL HTTPS de prod) |

### ⚠️ PIÈGE À NE PAS OUBLIER — QR codes fournisseur

Les QR codes des bons cadeaux sont générés **à la volée** à partir de `EXPO_PUBLIC_BACKEND_URL` :

```
QR encodé = {EXPO_PUBLIC_BACKEND_URL}/valider?token=XXX
```

➡️ **Le build mobile de production DOIT avoir `EXPO_PUBLIC_BACKEND_URL=https://sesame-pro.com`.**
Si on build avec `localhost` par erreur, **tous les QR pointeront vers localhost** → injouables pour les fournisseurs.

---

## 3. Domaine personnalisé (sesame-pro.com)

1. Acheter le domaine `sesame-pro.com` (OVH, Gandi, Cloudflare…).
2. Dans Railway → service backend → **Custom Domain** → ajouter `sesame-pro.com` (ou `api.sesame-pro.com`).
3. Chez le registrar (DNS), ajouter l'enregistrement **CNAME** fourni par Railway :
   `sesame-pro.com → xxx.up.railway.app`
4. HTTPS généré automatiquement par l'hébergeur.

> Hébergement (specs) : **Vercel** (frontend) + **Railway** ou **Supabase** (backend).

---

## 4. Circuit de validation d'un bon (fournisseur)

```
1. Ambassadeur ouvre son bon dans l'app
2. App génère le QR = https://sesame-pro.com/valider?token=XXX
3. Fournisseur scanne le QR → ouvre la page /valider
4. Page affiche le bon (GET /api/echanges/info?token=XXX)
5. Fournisseur saisit son code secret 4 chiffres → POST /api/fournisseurs/valider-bon
6. Backend vérifie (token crypto + code bcrypt + blocage 3 essais) → validé ✅
```

La page `/valider` sans `?token=` n'affiche rien (« Token manquant ») → pas de dashboard exposé.

---

## 5. État sécurité (audit du 11 juin 2026)

| Point | État |
|---|---|
| JWT_SECRET validé au démarrage (≥32 car.) | ✅ |
| Rate-limit : auth 20/15min, **admin 10/15min**, code course 15/10min | ✅ |
| `requireAuth` + ownership sur toutes les routes mobiles | ✅ |
| Admin protégé (`requireAdmin`, role=admin) | ✅ |
| WebSocket chat : token + appartenance course | ✅ |
| Mots de passe : bcrypt + **min. 8 caractères** (serveur + mobile) | ✅ |
| Codes/token sensibles en **crypto** (reset, code fournisseur, token QR) | ✅ |
| Code fournisseur : bcrypt + **blocage après 3 essais** | ✅ |
| Webhook Stripe : signature vérifiée (fail-closed) | ✅ |
| Pas d'injection SQL (requêtes paramétrées), pas de fuite de hash | ✅ |
| Logs PII désactivés en prod, erreurs 500 masquées en prod | ✅ |
| Vulns npm **hautes** | ✅ éliminées (bcrypt 6) |
| Vulns npm **modérées** (transitives FCM/Google Cloud Storage) | 🟡 acceptables, non bloquantes |

---

## 6. ⚠️ À NE JAMAIS FAIRE en production

- **Ne jamais** lancer `npm run seed` (crée des comptes démo `sesame123` / code `1234`).
- **Ne jamais** lancer `npm run clean` (vide toutes les tables → perte totale des données).
- **Ne jamais** lancer `npm audit fix --force` (rétrograderait `firebase-admin` v13 → v10 → casse les notifications push).
</content>
</invoke>
