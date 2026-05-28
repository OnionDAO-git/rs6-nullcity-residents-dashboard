import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5175,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
