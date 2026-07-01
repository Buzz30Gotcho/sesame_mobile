/// <reference types="vite/client" />

interface ImportMetaEnv {
  // URL de l'API backend. Non définie → défaut localhost (dev). En prod : la fixer
  // au build, ex. VITE_API_URL=https://api.tondomaine.com/api
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
