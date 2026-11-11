import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Dev server: serve /upload (no trailing slash) like Firebase Hosting does. */
const uploadRoute: Plugin = {
  name: 'babu-upload-route',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/upload' || req.url?.startsWith('/upload?')) req.url = req.url.replace('/upload', '/upload/');
      next();
    });
  },
};

export default defineConfig({
  plugins: [uploadRoute],
  build: {
    target: 'es2022',
    // hls.js (~580 kB) is lazy-loaded only when an HLS stream plays on non-Safari browsers.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        upload: resolve(import.meta.dirname, 'upload/index.html'),
      },
    },
  },
});
