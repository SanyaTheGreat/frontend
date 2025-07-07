import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
        'process.env': '{}',
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
          process: true, // добавлено для process
        }),
      ],
    },
  },
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      process: 'process/browser',          // добавлено для process
      crypto: 'crypto-browserify',         // добавлено для crypto
      stream: 'stream-browserify',         // добавлено для stream
    },
  },
  server: {
    mimeTypes: {
      '.json': 'text/plain', // 👈 Lottie expects text/plain
    },
  },
});
