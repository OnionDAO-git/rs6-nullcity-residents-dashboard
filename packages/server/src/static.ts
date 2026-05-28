import path from 'node:path';
import { pathExists, textResponse } from './util';

export interface DashboardWebRoots {
  eventPublicRoot: string;
  webDist: string;
  webDevOrigin?: string;
}

const eventPageRoutes: Readonly<Record<string, string>> = {
  '/debug/index.html': 'index.html',
  '/debug/wall': 'wall/index.html',
  '/debug/wall/': 'wall/index.html',
  '/debug/inbox': 'inbox/index.html',
  '/debug/inbox/': 'inbox/index.html',
  '/debug/patron': 'patron/index.html',
  '/debug/patron/': 'patron/index.html',
  '/debug/graveyard': 'graveyard/index.html',
  '/debug/graveyard/': 'graveyard/index.html',
  '/debug/library': 'library/index.html',
  '/debug/library/': 'library/index.html',
};

export function eventPublicPagePath(pathname: string, eventPublicRoot: string): string | undefined {
  const relative = eventPageRoutes[pathname];
  return relative ? path.join(eventPublicRoot, relative) : undefined;
}

export async function serveDashboardWeb(url: URL, roots: DashboardWebRoots): Promise<Response> {
  const eventPagePath = eventPublicPagePath(url.pathname, roots.eventPublicRoot);
  if (eventPagePath && await pathExists(eventPagePath)) return fileResponse(eventPagePath);
  if (isRetiredOperationsRoute(url.pathname)) {
    return textResponse('Legacy dashboard route moved under /debug.', { status: 404 });
  }

  if (roots.webDevOrigin) {
    const target = new URL(`${url.pathname}${url.search}`, roots.webDevOrigin);
    return Response.redirect(target, 307);
  }

  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const filePath = path.join(roots.webDist, requested);
  if (await pathExists(filePath)) return fileResponse(filePath);
  if (path.extname(requested)) {
    return textResponse(`${requested} not found in dashboard web build. Rebuild the web package so spectator.html and assets are present.`, {
      status: 404,
    });
  }
  const fallback = path.join(roots.webDist, 'index.html');
  if (await pathExists(fallback)) return fileResponse(fallback);
  return textResponse('Dashboard web build not found. Run `bun run dev:web` during development.', { status: 404 });
}

function isRetiredOperationsRoute(pathname: string): boolean {
  return (
    pathname === '/observe' ||
    pathname.startsWith('/observe/') ||
    pathname === '/benchmarks' ||
    pathname.startsWith('/benchmarks/') ||
    pathname === '/souls' ||
    pathname === '/logs' ||
    pathname === '/residents/new' ||
    pathname === '/wall' ||
    pathname === '/wall/' ||
    pathname === '/patron' ||
    pathname === '/patron/' ||
    pathname === '/graveyard' ||
    pathname === '/graveyard/'
  );
}

function fileResponse(filePath: string): Response {
  const type = contentType(filePath);
  return new Response(Bun.file(filePath), type ? { headers: { 'content-type': type } } : undefined);
}

function contentType(filePath: string): string | undefined {
  const ext = path.extname(filePath);
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.webmanifest') return 'application/manifest+json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml; charset=utf-8';
  if (ext === '.wasm') return 'application/wasm';
  if (ext === '.map') return 'application/json; charset=utf-8';
  return undefined;
}
