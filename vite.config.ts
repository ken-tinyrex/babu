import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    // hls.js (~580 kB) is lazy-loaded only when an HLS stream plays on non-Safari browsers.
    chunkSizeWarningLimit: 700,
  },
});
