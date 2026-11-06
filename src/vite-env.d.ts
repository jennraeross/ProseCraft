/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Desktop app OAuth client secret, supplied through a local .env file. */
  readonly VITE_GOOGLE_CLIENT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
