import path from 'node:path';
import { pathExists, textResponse } from './util';

export interface DashboardWebRoots {
  eventPublicRoot: string;
  webDist: string;
  webDevOrigin?: string;
}

const eventPageRoutes: Readonly<Record<string, string>> = {
  '/index.html': 'index.html',
  '/wall': 'wall/index.html',
  '/wall/': 'wall/index.html',
  '/inbox': 'inbox/index.html',
  '/inbox/': 'inbox/index.html',
  '/patron': 'patron/index.html',
  '/patron/': 'patron/index.html',
  '/graveyard': 'graveyard/index.html',
  '/graveyard/': 'graveyard/index.html',
  '/library': 'library/index.html',
  '/library/': 'library/index.html',
};

export function eventPublicPagePath(pathname: string, eventPublicRoot: string): string | undefined {
  const relative = eventPageRoutes[pathname];
  return relative ? path.join(eventPublicRoot, relative) : undefined;
}

export async function serveDashboardWeb(url: URL, roots: DashboardWebRoots): Promise<Response> {
  const eventPagePath = eventPublicPagePath(url.pathname, roots.eventPublicRoot);
  if (eventPagePath && await pathExists(eventPagePath)) return fileResponse(eventPagePath);

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
  if (ext === '.wasm') return 'application/wasm';
  if (ext === '.map') return 'application/json; charset=utf-8';
  return undefined;
}
