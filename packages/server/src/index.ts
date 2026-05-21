import path from 'node:path';
import type { ResidentAppearance } from '@nullcity-dashboard/shared';
import { config } from './config';
import { GatewayClient } from './gateway';
import { RuntimeRepository } from './runtime';
import { jsonResponse, notFound, pathExists, textResponse } from './util';

const gateway = new GatewayClient(config.gatewayUrl, config.gatewayToken);
const runtime = new RuntimeRepository(config.memoryRoot, config.logsRoot, config.agentLogsRoot, config.soulsRoot);

type WsMessage = string | ArrayBuffer | Uint8Array;

type RsProxyWebSocketData = {
  tcp?: Bun.Socket<RsProxyTcpData>;
  queue: WsMessage[];
  closing: boolean;
};

type RsProxyTcpData = {
  ws: Bun.ServerWebSocket<RsProxyWebSocketData>;
};

const server = Bun.serve<RsProxyWebSocketData>({
  hostname: config.host,
  port: config.port,
  async fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === '/rs' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      return server.upgrade(request, { data: { queue: [], closing: false } satisfies RsProxyWebSocketData })
        ? undefined
        : textResponse('WebSocket upgrade failed', { status: 400 });
    }
    try {
      if (url.pathname.startsWith('/api/')) {
        return await routeApi(request, url);
      }
      return await serveWeb(url);
    } catch (error) {
      return jsonResponse(
        {
          error: error instanceof Error ? error.message : 'Dashboard server error',
        },
        { status: 500 },
      );
    }
  },
  websocket: {
    open(ws) {
      void openRsProxyConnection(ws);
    },
    message(ws, message) {
      writeRsProxyMessage(ws, message);
    },
    close(ws) {
      ws.data.closing = true;
      closeRsProxyTcp(ws);
    },
  },
});

console.log(`NullCity dashboard server listening on http://${server.hostname}:${server.port}`);

async function openRsProxyConnection(ws: Bun.ServerWebSocket<RsProxyWebSocketData>): Promise<void> {
  try {
    const target = parseHostPort(config.rsClientHost);
    const tcp = await Bun.connect<RsProxyTcpData>({
      hostname: target.host,
      port: target.port,
      data: { ws },
      socket: {
        binaryType: 'buffer',
        data(socket, data) {
          if (socket.data.ws.readyState === WebSocket.OPEN) socket.data.ws.send(data);
        },
        close(socket) {
          socket.data.ws.data.tcp = undefined;
          closeRsProxyWebSocket(socket.data.ws);
        },
        end(socket) {
          socket.data.ws.data.tcp = undefined;
          closeRsProxyWebSocket(socket.data.ws);
        },
        error(socket) {
          socket.data.ws.data.tcp = undefined;
          closeRsProxyWebSocket(socket.data.ws);
        },
        connectError(socket) {
          closeRsProxyWebSocket(socket.data.ws, 1011, 'RuneScape gateway connection failed');
        },
      },
    });

    if (ws.data.closing || ws.readyState !== WebSocket.OPEN) {
      tcp.end();
      return;
    }

    ws.data.tcp = tcp;
    for (const queued of ws.data.queue.splice(0)) tcp.write(toTcpChunk(queued));
  } catch {
    closeRsProxyWebSocket(ws, 1011, 'RuneScape gateway connection failed');
  }
}

function writeRsProxyMessage(ws: Bun.ServerWebSocket<RsProxyWebSocketData>, message: WsMessage): void {
  const tcp = ws.data.tcp;
  if (!tcp) {
    ws.data.queue.push(message);
    return;
  }
  tcp.write(toTcpChunk(message));
}

function closeRsProxyWebSocket(ws: Bun.ServerWebSocket<RsProxyWebSocketData>, code = 1011, reason = 'RuneScape gateway closed'): void {
  if (ws.data.closing) return;
  ws.data.closing = true;
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(code, reason);
}

function closeRsProxyTcp(ws: Bun.ServerWebSocket<RsProxyWebSocketData>): void {
  const tcp = ws.data.tcp;
  ws.data.tcp = undefined;
  tcp?.end();
}

function toTcpChunk(message: WsMessage): Uint8Array | string {
  return message instanceof ArrayBuffer ? new Uint8Array(message) : message;
}

function parseHostPort(value: string): { host: string; port: number } {
  const [host, portValue] = value.split(':');
  const port = Number(portValue);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`NULLCITY_RS_HOST must be host:port, got ${value}`);
  }
  return { host, port };
}

async function routeApi(request: Request, url: URL): Promise<Response> {
  const method = request.method;
  const pathname = url.pathname;

  if (method === 'GET' && pathname === '/api/gateway/status') return jsonResponse(await gateway.probeStatus());
  if (method === 'GET' && pathname === '/api/controller/status') return jsonResponse(await runtime.status());
  if (method === 'GET' && pathname === '/api/controller/config') {
    return jsonResponse({
      gatewayUrl: config.gatewayUrl,
      rsClientHost: `${url.host}/rs`,
      rsClientSecure: url.protocol === 'https:',
      rsGatewayHost: config.rsClientHost,
      memoryRoot: config.memoryRoot,
      logsRoot: config.logsRoot,
      agentLogsRoot: config.agentLogsRoot,
      soulsRoot: config.soulsRoot,
    });
  }

  if (method === 'GET' && pathname === '/api/overview') {
    const residents = await safeResidents(url.searchParams.get('filter') || 'all');
    const rows = await runtime.enrichResidents(residents);
    const logs = await runtime.readAllLogs(60);
    return jsonResponse({
      gateway: await gateway.probeStatus(),
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
  if (method === 'POST' && pathname === '/api/residents') return jsonResponse(await gateway.createResident(normalizeCreateResident(await request.json())));

  const residentAction = pathname.match(/^\/api\/residents\/([^/]+)\/(connect|attach|detach|disconnect|pause|actions)$/);
  if (residentAction && method === 'POST') {
    const name = decodeURIComponent(residentAction[1] || '');
    const action = residentAction[2] || '';
    const body = await readBody(request);
    if (action === 'actions') return jsonResponse(await gateway.submitAction(name, body.action ?? body));
    if (action === 'disconnect') return jsonResponse(await gateway.command('disconnect_resident', { name, ...body }));
    if (action === 'pause') return jsonResponse(await gateway.command('pause_resident', { name, ...body }));
    if (action === 'connect') return jsonResponse(await gateway.command('connect_resident', { name, ...body }));
    if (action === 'attach' || action === 'detach') return jsonResponse(await gateway.command(action, { name, ...body }));
  }

  const residentDelete = pathname.match(/^\/api\/residents\/([^/]+)$/);
  if (residentDelete && method === 'DELETE') {
    const name = decodeURIComponent(residentDelete[1] || '');
    const status = await gateway.probeStatus();
    if (status.allowDelete === false) {
      return jsonResponse(
        {
          error: 'Resident delete is disabled by the game server. Set agentGateway.allowDelete to true and restart the server to enable it.',
        },
        { status: 403 },
      );
    }
    const gatewayResult = await gateway.command('delete_resident', { name });
    const files = await runtime.deleteResidentFiles(name);
    return jsonResponse({ gateway: gatewayResult, files });
  }

  const runtimeMatch = pathname.match(/^\/api\/runtime\/([^/]+)(?:\/(thinking|nervous-system|body|history|inference|memory\/index|memory\/files|memory\/file))?$/);
  if (runtimeMatch && method === 'GET') {
    const resident = decodeURIComponent(runtimeMatch[1] || '');
    const section = runtimeMatch[2];
    const summary = await safeResidentSummary(resident);
    const feed = summary?.online ? await gateway.subscribeResidentFeed(resident) : gateway.getResidentFeed(resident);
    const model = await runtime.residentRuntime(resident, summary, feed);
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

  if (method === 'GET' && pathname === '/api/observe/subjects') return jsonResponse(await safeObservableSubjects());
  if (method === 'GET' && pathname === '/api/observe/sessions') return jsonResponse(gateway.listSessions());
  if (method === 'POST' && pathname === '/api/observe/session') {
    const body = await request.json();
    return jsonResponse(await gateway.observe(body.subject, body.mode || 'follow'));
  }
  const observeStream = pathname.match(/^\/api\/observe\/session\/(.+)\/stream$/);
  if (observeStream && method === 'GET') {
    const sessionId = decodeURIComponent(observeStream[1] || '');
    if (!gateway.getSession(sessionId)) return notFound();
    return streamSession(sessionId);
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

async function safeObservableSubjects() {
  try {
    return await gateway.listObservableSubjects();
  } catch {
    return [];
  }
}

async function safeResidentSummary(name: string) {
  try {
    return (await gateway.listResidents('all')).find(resident => resident.name.toLowerCase() === name.toLowerCase());
  } catch {
    return undefined;
  }
}

function normalizeFilter(value: string | null): 'online' | 'offline' | 'all' {
  return value === 'online' || value === 'offline' ? value : 'all';
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) return {};
  return (await request.json()) as Record<string, unknown>;
}

function normalizeCreateResident(raw: unknown): {
  name: string;
  spawnPosition?: { x: number; y: number; level?: number };
  appearance?: ResidentAppearance;
  initialInventory?: unknown[];
  initialEquipment?: unknown[];
} {
  const body = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  const name = String(body.name || '').trim().toLowerCase();
  const spawnPosition = normalizePosition(body.spawnPosition);
  const appearance = normalizeAppearance(body.appearance);
  return {
    name,
    ...(spawnPosition ? { spawnPosition } : {}),
    ...(appearance ? { appearance } : {}),
    ...(Array.isArray(body.initialInventory) ? { initialInventory: body.initialInventory } : {}),
    ...(Array.isArray(body.initialEquipment) ? { initialEquipment: body.initialEquipment } : {}),
  };
}

function normalizePosition(value: unknown): { x: number; y: number; level?: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const level = Number(record.level ?? 0);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  return Number.isInteger(level) ? { x, y, level } : { x, y };
}

function normalizeAppearance(value: unknown): ResidentAppearance | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<keyof ResidentAppearance, unknown>;
  const appearance = {
    gender: Number(record.gender),
    head: Number(record.head),
    torso: Number(record.torso),
    arms: Number(record.arms),
    legs: Number(record.legs),
    hands: Number(record.hands),
    feet: Number(record.feet),
    facialHair: Number(record.facialHair),
    hairColor: Number(record.hairColor),
    torsoColor: Number(record.torsoColor),
    legColor: Number(record.legColor),
    feetColor: Number(record.feetColor),
    skinColor: Number(record.skinColor),
  };
  return Object.values(appearance).every(Number.isInteger) ? appearance : undefined;
}

function streamSession(sessionId: string): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      unsubscribe = gateway.subscribeSession(sessionId, session => send('session', session));
      heartbeat = setInterval(() => send('heartbeat', { at: new Date().toISOString() }), 15000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}

async function serveWeb(url: URL): Promise<Response> {
  if (config.webDevOrigin) {
    const target = new URL(`${url.pathname}${url.search}`, config.webDevOrigin);
    return Response.redirect(target, 307);
  }

  const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const filePath = path.join(config.webDist, requested);
  if (await pathExists(filePath)) return fileResponse(filePath);
  if (path.extname(requested)) {
    return textResponse(`${requested} not found in dashboard web build. Rebuild the web package so spectator.html and assets are present.`, {
      status: 404,
    });
  }
  const fallback = path.join(config.webDist, 'index.html');
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
