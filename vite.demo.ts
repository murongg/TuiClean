import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'entrypoints/demo',
  publicDir: '../../public',
  plugins: [react()],
  server: { port: 5173, strictPort: true, fs: { allow: ['../..'] } },
});
