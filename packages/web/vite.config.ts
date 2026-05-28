import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const dashboardServerPort = process.env.DASHBOARD_PORT || process.env.PORT || '8787';
const dashboardServer = `http://127.0.0.1:${dashboardServerPort}`;
const dashboardWebSocketServer = `ws://127.0.0.1:${dashboardServerPort}`;
const dashboardHttpProxy = {
  target: dashboardServer,
  changeOrigin: true,
};
const eventPageRoutes = ['/debug/index.html', '/debug/wall', '/debug/inbox', '/debug/patron', '/debug/graveyard', '/debug/library', '/v1'];

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      client2: resolve(__dirname, '../game-client/src/runtime/upstream/src/client/Client.ts'),
      '#3rdparty': resolve(__dirname, '../game-client/src/runtime/upstream/src/3rdparty'),
      '#': resolve(__dirname, '../game-client/src/runtime/upstream/src'),
    },
  },
  define: {
    'process.env.RUNEJS_SERVER_PROT': JSON.stringify('true'),
    'process.env.RUNEJS_CUSTOM_COL': JSON.stringify('true'),
    'process.env.LOGIN_RSAE': JSON.stringify('65537'),
    'process.env.LOGIN_RSAN': JSON.stringify('119568088839203297999728368933573315070738693395974011872885408638642676871679245723887367232256427712869170521351089799352546294030059890127723509653145359924771433131004387212857375068629466435244653901851504845054452735390701003613803443469723435116497545687393297329052988014281948392136928774011011998343'),
    'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 5174,
    fs: {
      allow: [resolve(__dirname, '../../..')],
    },
    proxy: {
      '/api': {
        target: dashboardServer,
        changeOrigin: true,
      },
      ...Object.fromEntries(eventPageRoutes.map(route => [route, dashboardHttpProxy])),
      '/rs': {
        target: dashboardWebSocketServer,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        spectator: resolve(__dirname, 'spectator.html'),
      },
    },
  },
});
