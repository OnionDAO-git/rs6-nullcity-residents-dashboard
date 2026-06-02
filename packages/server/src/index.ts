import type { CreateResidentSoulOptions, ResidentAppearance } from '@nullcity-dashboard/shared';
import { routeCityApi } from './city/routes';
import { createCityServicesFromEnv, initializeCityServices } from './city/services';
import { config, dashboardRequestIdleTimeoutSeconds, parseRsClientHost } from './config';
import { readResidentEconomy } from './economy';
import { routePublicEventApi } from './event-public';
import { GatewayClient } from './gateway';
import { toPublicOverviewResident } from './public-overview';
import { buildEventReadinessSummary } from './readiness';
import { RuntimeRepository } from './runtime';
import { readStorytellerDigestFeed } from './storyteller';
import { routeRs6Api } from './rs6/routes';
import { serveDashboardWeb } from './static';
import { jsonResponse, notFound, textResponse } from './util';

const gateway = new GatewayClient(config.gatewayUrl, config.gatewayToken);
const city = createCityServicesFromEnv();
await initializeCityServices(city);
const runtime = new RuntimeRepository(
  config.memoryRoot,
  config.logsRoot,
  config.agentLogsRoot,
  config.soulsRoot,
  config.residentSaveRoot,
  config.benchmarkRoot,
);

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
  idleTimeout: dashboardRequestIdleTimeoutSeconds,
  async fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === '/rs' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const protocol = acceptedWebSocketProtocol(request);
      return server.upgrade(request, {
        data: { queue: [], closing: false } satisfies RsProxyWebSocketData,
        headers: protocol ? { 'Sec-WebSocket-Protocol': protocol } : undefined,
      })
        ? undefined
        : textResponse('WebSocket upgrade failed', { status: 400 });
    }
    try {
      if (url.pathname.startsWith('/api/')) {
        return await routeApi(request, url);
      }
      if (url.pathname.startsWith('/v1/')) {
        const publicResponse = await routePublicEventApi(request, url, { config, runtime });
        if (publicResponse) return publicResponse;
      }
      return await serveDashboardWeb(url, config);
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
    const target = parseRsClientHost(config.rsClientHost);
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
        error(socket, error) {
          console.error(`RuneScape gateway proxy error (${config.rsClientHost}): ${errorMessage(error)}`);
          socket.data.ws.data.tcp = undefined;
          closeRsProxyWebSocket(socket.data.ws);
        },
        connectError(socket, error) {
          console.error(`RuneScape gateway connection failed (${config.rsClientHost}): ${errorMessage(error)}`);
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
  } catch (error) {
    console.error(`RuneScape gateway proxy failed (${config.rsClientHost}): ${errorMessage(error)}`);
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

function acceptedWebSocketProtocol(request: Request): string | undefined {
  const header = request.headers.get('sec-websocket-protocol');
  if (!header) return undefined;
  return header.split(',').map(protocol => protocol.trim()).find(protocol => protocol === 'binary');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function publicRequestProtocol(request: Request, url: URL): 'http:' | 'https:' {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (forwardedProto === 'https') return 'https:';
  if (forwardedProto === 'http') return 'http:';
  if (request.headers.get('x-forwarded-ssl')?.toLowerCase() === 'on') return 'https:';
  return url.protocol === 'https:' ? 'https:' : 'http:';
}

async function routeApi(request: Request, url: URL): Promise<Response> {
  const method = request.method;
  const pathname = url.pathname;
  if (method === 'GET' && pathname === '/api/health') {
    return jsonResponse({
      ok: true,
      service: 'nullcity-residents-dashboard',
      store: city.store.mode,
      at: new Date().toISOString(),
    });
  }
  const rs6Response = await routeRs6Api(request, pathname);
  if (rs6Response) return rs6Response;
  const cityResponse = await routeCityApi(request, url, city);
  if (cityResponse) return cityResponse;

  if (method === 'GET' && pathname === '/api/gateway/status') return jsonResponse(await gateway.probeStatus());
  if (method === 'GET' && pathname === '/api/controller/status') return jsonResponse(await runtime.status());
  if (method === 'GET' && pathname === '/api/storyteller/digests') {
    const rawLimit = Number(url.searchParams.get('limit') || '12');
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.round(rawLimit))) : 12;
    return jsonResponse(await readStorytellerDigestFeed(config.memoryRoot, limit));
  }
  if (method === 'GET' && pathname === '/api/controller/config') {
    const protocol = publicRequestProtocol(request, url);
    return jsonResponse({
      gatewayUrl: config.gatewayUrl,
      rsClientHost: `${url.host}/rs`,
      rsClientSecure: protocol === 'https:',
      rsGatewayHost: config.rsClientHost,
      memoryRoot: config.memoryRoot,
      logsRoot: config.logsRoot,
      agentLogsRoot: config.agentLogsRoot,
      soulsRoot: config.soulsRoot,
      residentSaveRoot: config.residentSaveRoot,
      benchmarkRoot: config.benchmarkRoot,
    });
  }

  if (method === 'GET' && pathname === '/api/overview') {
    const residents = await safeResidents(url.searchParams.get('filter') || 'all');
    const rows = await enrichResidentRows(residents);
    const livingResidents = rows.filter(row => row.online).map(row => row.name);
    const [logs, recentLetters, patrons, relationships, gatewayStatus, controllerStatus, souls] = await Promise.all([
      runtime.readAllLogs(60),
      runtime.recentLetters(12, { dedupeBroadcasts: true, livingResidents }),
      runtime.patronSummary(12),
      runtime.relationshipSummary(12, rows.map(row => row.name)),
      gateway.probeStatus(),
      runtime.status(),
      runtime.listSouls(),
    ]);
    const readiness = buildEventReadinessSummary({
      gateway: gatewayStatus,
      controller: controllerStatus,
      residents: rows,
      souls,
      recentLetters,
      patrons,
    });
    return jsonResponse({
      gateway: gatewayStatus,
      controller: controllerStatus,
      residents: rows,
      recentEvents: logs.actions.slice(-20).map(entry => ({
        kind: typeof entry.source === 'string' ? entry.source : 'action',
        tick: typeof entry.tick === 'number' ? entry.tick : undefined,
        at: entry.t,
        text: typeof entry.cause === 'string' ? entry.cause : undefined,
      })),
      recentLetters,
      patrons,
      relationships,
      readiness,
    });
  }

  if (method === 'GET' && pathname === '/api/public/overview') {
    const residents = await safeResidents('all');
    const rows = await enrichResidentRows(residents);
    const patrons = await runtime.patronSummary(12).catch(() => undefined);
    return jsonResponse({
      generatedAt: new Date().toISOString(),
      residents: rows.map(toPublicOverviewResident),
      patronAp: patrons?.totalShardBalance,
    });
  }

  if (method === 'GET' && pathname === '/api/residents') {
    const filter = normalizeFilter(url.searchParams.get('filter'));
    const residents = await safeResidents(filter);
    return jsonResponse(await enrichResidentRows(residents));
  }
  if (method === 'POST' && pathname === '/api/residents') {
    const { soul, ...resident } = normalizeCreateResident(await request.json());
    if (!isResidentId(resident.name)) {
      return jsonResponse({ error: 'Resident names must match res:[a-z0-9_]{1,20}' }, { status: 400 });
    }
    if (soul?.autonomous !== false) await runtime.writeResidentSoul(resident.name, soul, resident.spawnPosition);
    return jsonResponse(await gateway.createResident(resident));
  }

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

  const residentEconomy = pathname.match(/^\/api\/resident\/([^/]+)\/economy$/);
  if (residentEconomy && method === 'GET') {
    const name = decodeURIComponent(residentEconomy[1] || '');
    try {
      return jsonResponse(await readResidentEconomy(config.memoryRoot, name));
    } catch (error) {
      // Even on unexpected reader failure, return an empty-state payload so the
      // panel stays renderable rather than 500-ing the resident detail page.
      return jsonResponse(
        {
          ap: 0,
          recentEvents: [],
          activeGoals: [],
          error: error instanceof Error ? error.message : 'Economy read failed',
        },
        { status: 200 },
      );
    }
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

  const runtimeStream = pathname.match(/^\/api\/runtime\/([^/]+)\/stream$/);
  if (runtimeStream && method === 'GET') {
    return streamRuntime(decodeURIComponent(runtimeStream[1] || ''));
  }

  const runtimeMatch = pathname.match(/^\/api\/runtime\/([^/]+)(?:\/(thinking|nervous-system|body|history|inference|memory\/index|memory\/files|memory\/file))?$/);
  if (runtimeMatch && method === 'GET') {
    const resident = decodeURIComponent(runtimeMatch[1] || '');
    const section = runtimeMatch[2];
    const model = await readResidentRuntime(resident);
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
  if (method === 'GET' && pathname === '/api/letters/recent') {
    return jsonResponse(await runtime.recentLetters(numberParam(url.searchParams.get('limit'), 20)));
  }
  if (method === 'GET' && pathname === '/api/patrons/summary') {
    return jsonResponse(await runtime.patronSummary(numberParam(url.searchParams.get('limit'), 20)));
  }
  if (method === 'GET' && pathname === '/api/relationships/summary') {
    const souls = await runtime.listSouls();
    return jsonResponse(await runtime.relationshipSummary(numberParam(url.searchParams.get('limit'), 20), souls.map(soul => soul.id)));
  }
  if (method === 'GET' && pathname === '/api/benchmarks') {
    return jsonResponse(await runtime.listBenchmarkArtifacts(numberParam(url.searchParams.get('limit'), 200)));
  }
  if (method === 'GET' && pathname === '/api/benchmarks/leaderboard') {
    return jsonResponse(await runtime.benchmarkLeaderboard(numberParam(url.searchParams.get('limit'), 50)));
  }

  const benchmarkDetail = pathname.match(/^\/api\/benchmarks\/([^/]+)$/);
  if (benchmarkDetail && method === 'GET') {
    const artifact = await runtime.readBenchmarkArtifact(decodeURIComponent(benchmarkDetail[1] || ''));
    return artifact ? jsonResponse(artifact) : notFound();
  }

  return notFound();
}

async function safeResidents(filter: string) {
  const normalized = normalizeFilter(filter);
  try {
    const residents = await gateway.listResidents(normalized);
    if (residents.length > 0) return residents;
  } catch {
    // Runtime fallback below keeps the operator dashboard truthful when the
    // gateway roster is temporarily empty but controller memory is hot.
  }
  return runtime.listRuntimeResidentSummaries({ filter: normalized }).catch(() => []);
}

async function enrichResidentRows(residents: Awaited<ReturnType<typeof safeResidents>>) {
  const feedEntries = await Promise.all(
    residents.map(async resident => {
      const feed = resident.online ? await gateway.subscribeResidentFeed(resident.name) : gateway.getResidentFeed(resident.name);
      return [residentKey(resident.name), feed] as const;
    }),
  );
  return runtime.enrichResidents(residents, new Map(feedEntries));
}

async function readResidentRuntime(resident: string) {
  const summary = await safeResidentSummary(resident);
  const feed = summary?.online ? await gateway.subscribeResidentFeed(resident) : gateway.getResidentFeed(resident);
  return runtime.residentRuntime(resident, summary, feed);
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
    const key = residentKey(name);
    return (await gateway.listResidents('all')).find(resident => resident.name.toLowerCase() === name.toLowerCase() || residentKey(resident.name) === key);
  } catch {
    return undefined;
  }
}

function residentKey(value: string): string {
  return value.trim().toLowerCase().replace(/^res:/, '');
}

function normalizeFilter(value: string | null): 'online' | 'offline' | 'all' {
  return value === 'online' || value === 'offline' ? value : 'all';
}

function numberParam(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : fallback;
}

function isResidentId(value: string): boolean {
  return /^res:[a-z0-9_]{1,20}$/.test(value);
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
  soul?: CreateResidentSoulOptions;
} {
  const body = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  const name = String(body.name || '').trim().toLowerCase();
  const spawnPosition = normalizePosition(body.spawnPosition);
  const appearance = normalizeAppearance(body.appearance);
  const soul = normalizeSoulOptions(body.soul);
  return {
    name,
    ...(spawnPosition ? { spawnPosition } : {}),
    ...(appearance ? { appearance } : {}),
    ...(Array.isArray(body.initialInventory) ? { initialInventory: body.initialInventory } : {}),
    ...(Array.isArray(body.initialEquipment) ? { initialEquipment: body.initialEquipment } : {}),
    ...(soul ? { soul } : {}),
  };
}

function normalizeSoulOptions(value: unknown): CreateResidentSoulOptions | undefined {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const sourceSoulFile = cleanString(record.sourceSoulFile);
  const endpoint = cleanString(record.endpoint);
  const model = cleanString(record.model);
  const temperature = Number(record.temperature);
  const autonomous = typeof record.autonomous === 'boolean' ? record.autonomous : true;
  const options: CreateResidentSoulOptions = {
    autonomous,
    ...(sourceSoulFile?.endsWith('.md') ? { sourceSoulFile } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(model ? { model } : {}),
    ...(Number.isFinite(temperature) ? { temperature: Math.max(0, Math.min(2, Math.round(temperature * 100) / 100)) } : {}),
  };
  return Object.keys(options).length ? options : undefined;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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

function streamRuntime(resident: string): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let sending = false;
  let dirty = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const sendRuntime = async () => {
        if (closed) return;
        if (sending) {
          dirty = true;
          return;
        }
        sending = true;
        try {
          send('runtime', await readResidentRuntime(resident));
        } catch (error) {
          send('error', { message: error instanceof Error ? error.message : 'Runtime stream update failed' });
        } finally {
          sending = false;
          if (dirty) {
            dirty = false;
            void sendRuntime();
          }
        }
      };
      unsubscribe = gateway.subscribeResidentFeedUpdates(resident, () => void sendRuntime());
      poll = setInterval(() => void sendRuntime(), 5000);
      void sendRuntime();
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      if (poll) clearInterval(poll);
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
