import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Phaser's isolated vendor chunk compresses to about 340 KB.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/phaser/')) return 'phaser';
          if (id.includes('/node_modules/socket.io-client/')) return 'multiplayer';
        },
      },
    },
  },
});
