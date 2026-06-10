import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  cacheDir: '../../node_modules/.vite-ui',
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3001' }
  }
});
