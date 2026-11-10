/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** TMDB "API Read Access Token" (v4). Optional: enables posters, backdrops, cast photos and ratings. */
  readonly VITE_TMDB_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
