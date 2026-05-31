import { describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eventPublicPagePath, serveDashboardWeb } from './static';

async function withStaticRoots<T>(run: (roots: { eventPublicRoot: string; webDist: string }) => Promise<T>): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-static-'));
  try {
    const eventPublicRoot = path.join(root, 'public');
    const webDist = path.join(root, 'dist');
    await fs.mkdir(path.join(eventPublicRoot, 'wall'), { recursive: true });
    await fs.mkdir(webDist, { recursive: true });
    await fs.writeFile(path.join(eventPublicRoot, 'index.html'), '<main>public event index</main>');
    await fs.writeFile(path.join(eventPublicRoot, 'wall', 'index.html'), '<main>public wall</main>');
    await fs.writeFile(path.join(webDist, 'index.html'), '<main>svelte app shell</main>');
    return await run({ eventPublicRoot, webDist });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

describe('serveDashboardWeb', () => {
  test('maps the migrated public event page routes explicitly', async () => {
    await withStaticRoots(async roots => {
      expect(eventPublicPagePath('/debug/wall', roots.eventPublicRoot)).toBe(path.join(roots.eventPublicRoot, 'wall/index.html'));
      expect(eventPublicPagePath('/debug/wall/', roots.eventPublicRoot)).toBe(path.join(roots.eventPublicRoot, 'wall/index.html'));
      expect(eventPublicPagePath('/debug/inbox', roots.eventPublicRoot)).toBe(path.join(roots.eventPublicRoot, 'inbox/index.html'));
      expect(eventPublicPagePath('/debug/patron', roots.eventPublicRoot)).toBe(path.join(roots.eventPublicRoot, 'patron/index.html'));
      expect(eventPublicPagePath('/debug/graveyard', roots.eventPublicRoot)).toBe(path.join(roots.eventPublicRoot, 'graveyard/index.html'));
      expect(eventPublicPagePath('/debug/library', roots.eventPublicRoot)).toBe(path.join(roots.eventPublicRoot, 'library/index.html'));
      expect(eventPublicPagePath('/wall', roots.eventPublicRoot)).toBeUndefined();
      expect(eventPublicPagePath('/residents/res-agent', roots.eventPublicRoot)).toBeUndefined();
    });
  });

  test('serves public event pages before redirecting to the Vite dev app', async () => {
    await withStaticRoots(async roots => {
      const response = await serveDashboardWeb(new URL('http://dashboard.local/debug/wall'), {
        ...roots,
        webDevOrigin: 'http://127.0.0.1:5174',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await response.text()).toContain('public wall');
    });
  });

  test('keeps the Svelte app shell on / while serving the public event index under /debug', async () => {
    await withStaticRoots(async roots => {
      const rootResponse = await serveDashboardWeb(new URL('http://dashboard.local/'), roots);
      const indexResponse = await serveDashboardWeb(new URL('http://dashboard.local/debug/index.html'), roots);

      expect(await rootResponse.text()).toContain('svelte app shell');
      expect(await indexResponse.text()).toContain('public event index');
    });
  });

  test('falls back to the Svelte app shell for non-public app routes', async () => {
    await withStaticRoots(async roots => {
      const response = await serveDashboardWeb(new URL('http://dashboard.local/residents/res-agent'), roots);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('svelte app shell');
    });
  });

  test('returns 404 for retired operations routes that are not new city routes', async () => {
    await withStaticRoots(async roots => {
      const response = await serveDashboardWeb(new URL('http://dashboard.local/observe'), roots);

      expect(response.status).toBe(404);
      expect(await response.text()).toContain('/debug');
    });
  });

  test('public event pages link to dashboard-served debug routes', async () => {
    const publicRoot = path.resolve(import.meta.dir, '../public');
    const [indexHtml, patronHtml] = await Promise.all([
      fs.readFile(path.join(publicRoot, 'index.html'), 'utf8'),
      fs.readFile(path.join(publicRoot, 'patron/index.html'), 'utf8'),
    ]);

    expect(indexHtml).toContain('href="/debug/wall/"');
    expect(indexHtml).toContain('href="/debug/inbox/"');
    expect(indexHtml).toContain('href="/debug/patron/"');
    expect(indexHtml).toContain('href="/debug/library/"');
    expect(indexHtml).toContain('href="/debug/graveyard/"');
    expect(patronHtml).toContain("'/debug/inbox/?human='");
    expect(patronHtml).toContain("'/debug/library/'");
  });

  test('public event pages use AP vocabulary in visitor-facing copy', async () => {
    const publicRoot = path.resolve(import.meta.dir, '../public');
    const [indexHtml, patronHtml] = await Promise.all([
      fs.readFile(path.join(publicRoot, 'index.html'), 'utf8'),
      fs.readFile(path.join(publicRoot, 'patron/index.html'), 'utf8'),
    ]);

    expect(indexHtml).toContain('Attention Points');
    expect(indexHtml).not.toContain('shards of attention');
    expect(indexHtml).not.toContain('Shards balance');
    expect(patronHtml).toContain("addStatRow(card, 'AP'");
    expect(patronHtml).toContain("Daily Check-In (+1 AP)");
    expect(patronHtml).toContain("AP earned! Balance:");
    expect(patronHtml).not.toContain("addStatRow(card, 'Shards'");
    expect(patronHtml).not.toContain("Daily Check-In (+1 Shard)");
    expect(patronHtml).not.toContain("Shard earned! Balance:");
  });

  test('public event pages offer a link back to the main dashboard', async () => {
    const publicRoot = path.resolve(import.meta.dir, '../public');
    const pages = [
      'index.html',
      'wall/index.html',
      'inbox/index.html',
      'patron/index.html',
      'library/index.html',
      'graveyard/index.html',
    ];

    for (const page of pages) {
      const html = await fs.readFile(path.join(publicRoot, page), 'utf8');
      expect(html).toContain('href="/"');
      expect(html).toContain('Main Dashboard');
      expect(html).toContain('.dashboard-link {\n            position: absolute;');
    }
  });
});
