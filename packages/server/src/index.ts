import path from 'node:path';
import { config } from './config';
import { GatewayClient } from './gateway';
import { RuntimeRepository } from './runtime';
import { jsonResponse, notFound, pathExists, textResponse } from './util';

const gateway = new GatewayClient(config.gatewayUrl, config.gatewayToken);
const runtime = new RuntimeRepository(config.memoryRoot, config.logsRoot, config.soulsRoot);

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) {
        return await routeApi(request, url);
      }
      return await serveWeb(url.pathname);
    } catch (error) {
      return jsonResponse(
        {
          error: error instanceof Error ? error.message : 'Dashboard server error',
        },
        { status: 500 },
      );
    }
  },
});

console.log(`NullCity dashboard server listening on http://${server.hostname}:${server.port}`);

async function routeApi(request: Request, url: URL): Promise<Response> {
  const method = request.method;
  const pathname = url.pathname;

  if (method === 'GET' && pathname === '/api/gateway/status') return jsonResponse(gateway.status());
  if (method === 'GET' && pathname === '/api/controller/status') return jsonResponse(await runtime.status());
  if (method === 'GET' && pathname === '/api/controller/config') {
    return jsonResponse({
      gatewayUrl: config.gatewayUrl,
      memoryRoot: config.memoryRoot,
      logsRoot: config.logsRoot,
      soulsRoot: config.soulsRoot,
    });
  }

  if (method === 'GET' && pathname === '/api/overview') {
    const residents = await safeResidents(url.searchParams.get('filter') || 'all');
    const rows = await runtime.enrichResidents(residents);
    const logs = await runtime.readAllLogs(60);
    return jsonResponse({
      gateway: gateway.status(),
      controller: await runtime.status(),
      residents: rows,
      recentEvents: logs.actions.slice(-20).map(entry => ({
        kind: typeof entry.source === 'string' ? entry.source : 'action',
        tick: typeof entry.tick === 'number' ? entry.tick : undefined,
        at: entry.t,
        text: typeof entry.cause === 'string' ? entry.cause : undefined,
      })),
    });
  }

  if (method === 'GET' && pathname === '/api/residents') {
    const filter = normalizeFilter(url.searchParams.get('filter'));
    const residents = await safeResidents(filter);
    return jsonResponse(await runtime.enrichResidents(residents));
  }
  if (method === 'POST' && pathname === '/api/residents') return jsonResponse(await gateway.createResident(await request.json()));

  const residentAction = pathname.match(/^\/api\/residents\/([^/]+)\/(connect|attach|detach|disconnect|actions)$/);
  if (residentAction && method === 'POST') {
    const name = decodeURIComponent(residentAction[1] || '');
    const action = residentAction[2] || '';
    const body = await readBody(request);
    if (action === 'actions') return jsonResponse(await gateway.submitAction(name, body.action ?? body));
    if (action === 'disconnect') return jsonResponse(await gateway.command('disconnect_resident', { name, ...body }));
    if (action === 'connect') return jsonResponse(await gateway.command('connect_resident', { name, ...body }));
    if (action === 'attach' || action === 'detach') return jsonResponse(await gateway.command(action, { name, ...body }));
  }

  const residentDelete = pathname.match(/^\/api\/residents\/([^/]+)$/);
  if (residentDelete && method === 'DELETE') {
    return jsonResponse(await gateway.command('delete_resident', { name: decodeURIComponent(residentDelete[1] || '') }));
  }

  const runtimeMatch = pathname.match(/^\/api\/runtime\/([^/]+)(?:\/(thinking|nervous-system|body|history|inference|memory\/index|memory\/files|memory\/file))?$/);
  if (runtimeMatch && method === 'GET') {
    const resident = decodeURIComponent(runtimeMatch[1] || '');
    const section = runtimeMatch[2];
    const model = await runtime.residentRuntime(resident);
    if (!section) return jsonResponse(model);
    if (section === 'thinking') return jsonResponse(model.thinking);
    if (section === 'nervous-system') return jsonResponse(model.nervous);
    if (section === 'body') return jsonResponse(model.body);
    if (section === 'history') return jsonResponse(model.logs.actions);
    if (section === 'inference') return jsonResponse(model.logs.inference);
    if (section === 'memory/index') return textResponse(model.memory.indexMarkdown || '');
    if (section === 'memory/files') return jsonResponse(model.memory.files);
    if (section === 'memory/file') return textResponse((await runtime.readMemoryFile(resident, url.searchParams.get('path') || '')) || '');
  }

  if (method === 'GET' && pathname === '/api/observe/subjects') return jsonResponse(await gateway.listObservableSubjects());
  if (method === 'GET' && pathname === '/api/observe/sessions') return jsonResponse(gateway.listSessions());
  if (method === 'POST' && pathname === '/api/observe/session') {
    const body = await request.json();
    return jsonResponse(await gateway.observe(body.subject, body.mode || 'follow'));
  }
  const observeDelete = pathname.match(/^\/api\/observe\/session\/(.+)$/);
  if (observeDelete && method === 'DELETE') {
    await gateway.unobserve(decodeURIComponent(observeDelete[1] || ''));
    return jsonResponse({ ok: true });
  }
  const observeGet = pathname.match(/^\/api\/observe\/session\/(.+)$/);
  if (observeGet && method === 'GET') {
    const session = gateway.getSession(decodeURIComponent(observeGet[1] || ''));
    return session ? jsonResponse(session) : notFound();
  }

  if (method === 'GET' && pathname === '/api/souls') return jsonResponse(await runtime.listSouls());
  if (method === 'GET' && pathname === '/api/logs') return jsonResponse(await runtime.readAllLogs());

  return notFound();
}

async function safeResidents(filter: string) {
  try {
    return await gateway.listResidents(normalizeFilter(filter));
  } catch {
    return [];
  }
}

function normalizeFilter(value: string | null): 'online' | 'offline' | 'all' {
  return value === 'online' || value === 'offline' ? value : 'all';
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) return {};
  return (await request.json()) as Record<string, unknown>;
}

async function serveWeb(pathname: string): Promise<Response> {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.join(config.webDist, requested);
  if (await pathExists(filePath)) return new Response(Bun.file(filePath));
  const fallback = path.join(config.webDist, 'index.html');
  if (await pathExists(fallback)) return new Response(Bun.file(fallback));
  return textResponse('Dashboard web build not found. Run `bun run dev:web` during development.', { status: 404 });
}
