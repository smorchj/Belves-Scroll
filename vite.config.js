import { defineConfig } from 'vite';

export default defineConfig({
  // Served from the GitHub Pages project subpath in production; '/' in dev.
  // Every runtime asset path is resolved against this via src/core/paths.js.
  base: process.env.DEPLOY_BASE || '/',
  server: { port: 5173, open: false },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  // GLBs live in public/assets and are fetched at runtime, so nothing to bundle.
});
