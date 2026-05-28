import type { CitySessionResponse } from '@nullcity-dashboard/shared';
import { syncLandingCheckins, type LandingCheckinReader } from './checkins';
import type { CityConfig } from './config';
import { parseCookieHeader } from './cookies';
import {
  gameSessionTicketSecretFromEnv,
  gameSessionTicketTtlSecondsFromEnv,
  issueGameSessionTicket,
  validGameCsrfToken,
  verifyGameSessionTicket,
} from './game-session';
import type { LandingSessionAuthenticator } from './landing-session';
import { quoteSoulProposal } from './quote';
import { CityStoreError, type CityStore } from './store';
import type { CityUser, LandingSessionUser, PointResource } from './types';
import { jsonResponse, notFound } from '../util';

export interface CityApiContext {
  config: CityConfig;
  auth: LandingSessionAuthenticator;
  store: CityStore;
  landingCheckins?: LandingCheckinReader;
  gameTicketSecret?: string;
  gameTicketTtlSeconds?: number;
}

interface AuthenticatedCityRequest {
  landingUser: LandingSessionUser;
  cityUser: CityUser;
}

export async function routeCityApi(
  request: Request,
  url: URL,
  context: CityApiContext,
): Promise<Response | undefined> {
  const method = request.method;
  const pathname = url.pathname;

  try {
    if (method === 'GET' && pathname === '/api/session') {
      const csrfToken = csrfTokenForRequest(request);
      return jsonResponse(await sessionResponse(request, url, context, csrfToken), {
        headers: { 'set-cookie': csrfCookie(csrfToken, context.config) },
      });
    }

    if (isStateChanging(method) && !isPrintBridgeEndpoint(pathname) && !context.config.csrfDisabled) {
      const csrf = validateCsrf(request);
      if (csrf) return csrf;
    }

    if (method === 'GET' && pathname === '/api/profile') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const [profile, points, recentLedger] = await Promise.all([
        context.store.getProfile(auth.cityUser.id),
        context.store.getPointBalances(auth.cityUser.id),
        context.store.listPointLedger(auth.cityUser.id),
      ]);
      return jsonResponse({
        profile: {
          id: profile.cityUserId,
          landingUserId: auth.cityUser.landingUserId,
          displayName: profile.displayName,
          handle: profile.handle,
          avatarUrl: profile.avatarUrl,
          points,
          recentLedger: recentLedger.slice(0, 25),
        },
      });
    }

    if (method === 'PATCH' && pathname === '/api/profile') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      return jsonResponse(await context.store.updateProfile(auth.cityUser.id, await readJsonBody(request)));
    }

    if (method === 'GET' && pathname === '/api/profile/points') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      return jsonResponse({ balances: await context.store.getPointBalances(auth.cityUser.id) });
    }

    if (method === 'GET' && pathname === '/api/profile/ledger') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const resource = pointResource(url.searchParams.get('resource'));
      return jsonResponse({ entries: await context.store.listPointLedger(auth.cityUser.id, resource) });
    }

    if (method === 'POST' && pathname === '/api/points/sync-checkins') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      return jsonResponse(await syncLandingCheckins(context.store, auth.cityUser, context.landingCheckins));
    }

    if (method === 'POST' && pathname === '/api/game/session') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const csrfToken = gameCsrfToken(request);
      if (!csrfToken) return jsonResponse({ error: 'csrf_required' }, { status: 403 });
      return jsonResponse(issueGameSessionTicket({
        landingUser: auth.landingUser,
        cityUser: auth.cityUser,
        csrfToken,
        secret: gameTicketSecret(context),
        ttlSeconds: gameTicketTtlSeconds(context),
      }), { status: 201 });
    }

    if (method === 'POST' && pathname === '/api/game/logout') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const csrfToken = gameCsrfToken(request);
      if (!csrfToken) return jsonResponse({ error: 'csrf_required' }, { status: 403 });
      const body = await readJsonBody(request);
      const ticket = stringBody(body, 'ticket');
      if (!ticket) return jsonResponse({ error: 'ticket_required' }, { status: 400 });
      const verification = verifyGameSessionTicket(ticket, {
        secret: gameTicketSecret(context),
        csrfToken,
        expectedLandingUserId: auth.landingUser.id,
        expectedCityUserId: auth.cityUser.id,
      });
      if (!verification.ok) return jsonResponse({ error: verification.reason }, { status: 400 });
      return jsonResponse({ ok: true, invalidated: false, reason: 'stateless_ticket' });
    }

    if (method === 'POST' && (pathname === '/api/admin/points/grant' || pathname === '/api/admin/points/adjust')) {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      const body = await readJsonBody(request);
      const isGrant = pathname.endsWith('/grant');
      const amount = numberBody(body, 'amount');
      return jsonResponse(await context.store.appendPointLedger({
        cityUserId: stringBody(body, 'cityUserId') || auth.cityUser.id,
        resource: pointResource(String(body.resource)) || 'AP',
        delta: isGrant ? Math.abs(amount) : amount,
        sourceType: isGrant ? 'admin_grant' : 'admin_adjustment',
        sourceId: stringBody(body, 'sourceId') || stringBody(body, 'idempotencyKey') || crypto.randomUUID(),
        memo: stringBody(body, 'memo') || (isGrant ? 'Admin grant' : 'Admin adjustment'),
        metadata: { body },
        createdByCityUserId: auth.cityUser.id,
      }));
    }

    if (method === 'POST' && pathname === '/api/embassy/quote') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      return jsonResponse(quoteSoulProposal(await readJsonBody(request), context.config));
    }

    if (method === 'GET' && (pathname === '/api/embassy/proposals' || pathname === '/api/soul-proposals')) {
      return jsonResponse({ proposals: await context.store.listSoulProposals() });
    }

    if (method === 'POST' && (pathname === '/api/embassy/proposals' || pathname === '/api/soul-proposals')) {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const body = await readJsonBody(request);
      const quote = quoteSoulProposal(body, context.config);
      const proposal = await context.store.createSoulProposal({
        proposerCityUserId: auth.cityUser.id,
        residentName: stringBody(body, 'residentName'),
        displayName: stringBody(body, 'displayName') || 'Unnamed soul',
        goal: stringBody(body, 'goal') || 'Find a place in Null City.',
        personality: stringBody(body, 'personality') || '',
        vices: stringBody(body, 'vices'),
        virtues: stringBody(body, 'virtues'),
        fears: stringBody(body, 'fears'),
        voice: stringBody(body, 'voice'),
        firstMemory: stringBody(body, 'firstMemory'),
        secret: stringBody(body, 'secret'),
        appearance: recordBody(body, 'appearance'),
        startingLevels: numberRecordBody(body, 'startingLevels'),
        startingEquipment: arrayBody(body, 'startingEquipment'),
        startingInventory: arrayBody(body, 'startingInventory'),
        quote,
      });
      return jsonResponse({ proposal }, { status: 201 });
    }

    const proposalDetail = pathname.match(/^\/api\/(?:embassy\/proposals|soul-proposals)\/([^/]+)$/);
    if (proposalDetail && method === 'GET') {
      const proposal = await context.store.getSoulProposal(decodeURIComponent(proposalDetail[1] || ''));
      return proposal ? jsonResponse({ proposal }) : notFound();
    }

    const proposalContribution = pathname.match(/^\/api\/(?:embassy\/proposals|soul-proposals)\/([^/]+)\/contributions$/);
    if (proposalContribution && method === 'POST') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const body = await readJsonBody(request);
      return jsonResponse(await context.store.contributeToSoulProposal({
        proposalId: decodeURIComponent(proposalContribution[1] || ''),
        cityUserId: auth.cityUser.id,
        apAmount: numberBody(body, 'apAmount'),
        idempotencyKey: stringBody(body, 'idempotencyKey'),
      }), { status: 201 });
    }

    if (method === 'GET' && pathname === '/api/prints') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      return jsonResponse({ requests: await context.store.listPrintRequests(auth.cityUser.id) });
    }

    if (method === 'POST' && pathname === '/api/prints') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const body = await readJsonBody(request);
      const printRequest = await context.store.createPrintRequest({
        cityUserId: auth.cityUser.id,
        title: stringBody(body, 'title') || 'Untitled print',
        description: stringBody(body, 'description'),
        requestedMaterial: stringBody(body, 'requestedMaterial'),
        requestedColor: stringBody(body, 'requestedColor'),
        quantity: numberBody(body, 'quantity', 1),
        userNotes: stringBody(body, 'userNotes'),
      });
      return jsonResponse({ request: printRequest }, { status: 201 });
    }

    const printQuote = pathname.match(/^\/api\/admin\/prints\/([^/]+)\/quote$/);
    if (printQuote && method === 'POST') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      const body = await readJsonBody(request);
      return jsonResponse({
        request: await context.store.updatePrintQuote(
          decodeURIComponent(printQuote[1] || ''),
          numberBody(body, 'quoteGp'),
          stringBody(body, 'adminNotes'),
        ),
      });
    }

    const printConfirm = pathname.match(/^\/api\/prints\/([^/]+)\/confirm-gp$/);
    if (printConfirm && method === 'POST') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const body = await readJsonBody(request);
      return jsonResponse(await context.store.confirmPrintGp(
        decodeURIComponent(printConfirm[1] || ''),
        auth.cityUser.id,
        stringBody(body, 'idempotencyKey'),
      ));
    }

    const printFiles = pathname.match(/^\/api\/prints\/([^/]+)\/files$/);
    if (printFiles && method === 'POST') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const printRequestId = decodeURIComponent(printFiles[1] || '');
      const printRequest = await context.store.getPrintRequest(printRequestId);
      if (!printRequest) return notFound();
      if (printRequest.cityUserId !== auth.cityUser.id && !auth.landingUser.isAdmin) return jsonResponse({ error: 'forbidden' }, { status: 403 });
      const body = await readJsonBody(request);
      return jsonResponse({
        status: 'metadata_recorded',
        file: {
          printRequestId,
          fileName: stringBody(body, 'fileName') || 'upload',
          mime: stringBody(body, 'mime') || 'application/octet-stream',
          sizeBytes: numberBody(body, 'sizeBytes', 0),
        },
        message: 'object_storage_not_yet_configured',
      }, { status: 202 });
    }

    const printDetail = pathname.match(/^\/api\/prints\/([^/]+)$/);
    if (printDetail && method === 'GET') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const printRequest = await context.store.getPrintRequest(decodeURIComponent(printDetail[1] || ''));
      if (!printRequest) return notFound();
      if (printRequest.cityUserId !== auth.cityUser.id && !auth.landingUser.isAdmin) return jsonResponse({ error: 'forbidden' }, { status: 403 });
      return jsonResponse({ request: printRequest });
    }

    if (method === 'GET' && pathname === '/api/admin/printers') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      return jsonResponse({ printers: await context.store.listPrinters() });
    }

    if (method === 'POST' && pathname === '/api/admin/printers') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      const body = await readJsonBody(request);
      return jsonResponse({ printer: await context.store.upsertPrinter({
        id: stringBody(body, 'id'),
        name: stringBody(body, 'name') || 'Unnamed printer',
        kind: printerKind(String(body.kind)),
        adapter: printerAdapter(String(body.adapter)),
        bridgeId: stringBody(body, 'bridgeId'),
        enabled: booleanBody(body, 'enabled'),
        adminNotes: stringBody(body, 'adminNotes'),
        capabilities: recordBody(body, 'capabilities'),
      }) });
    }

    const adminPrinterDetail = pathname.match(/^\/api\/admin\/printers\/([^/]+)$/);
    if (adminPrinterDetail && method === 'PATCH') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      const body = await readJsonBody(request);
      return jsonResponse({ printer: await context.store.upsertPrinter({
        id: decodeURIComponent(adminPrinterDetail[1] || ''),
        name: stringBody(body, 'name') || 'Unnamed printer',
        kind: printerKind(String(body.kind)),
        adapter: printerAdapter(String(body.adapter)),
        bridgeId: stringBody(body, 'bridgeId'),
        enabled: booleanBody(body, 'enabled'),
        adminNotes: stringBody(body, 'adminNotes'),
        capabilities: recordBody(body, 'capabilities'),
      }) });
    }

    const adminPrinterTest = pathname.match(/^\/api\/admin\/printers\/([^/]+)\/test$/);
    if (adminPrinterTest && method === 'POST') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      return jsonResponse({
        printerId: decodeURIComponent(adminPrinterTest[1] || ''),
        ok: false,
        status: 'adapter_not_configured',
      });
    }

    if (method === 'GET' && pathname === '/api/admin/print-queue') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      return jsonResponse({ queue: await context.store.listPrintQueue() });
    }

    if (method === 'POST' && pathname === '/api/admin/print-queue/claim') {
      const bridge = requirePrintBridge(request, context);
      if (bridge) return bridge;
      return jsonResponse({ job: undefined });
    }

    if (method === 'POST' && pathname === '/api/admin/print-queue/status') {
      const bridge = requirePrintBridge(request, context);
      if (bridge) return bridge;
      const body = await readJsonBody(request);
      return jsonResponse({
        ok: true,
        status: stringBody(body, 'status') || 'unknown',
        jobId: stringBody(body, 'jobId'),
        bridgeId: stringBody(body, 'bridgeId'),
      }, { status: 202 });
    }

    if (method === 'POST' && pathname === '/api/admin/print-bridge/heartbeat') {
      const bridge = requirePrintBridge(request, context);
      if (bridge) return bridge;
      const body = await readJsonBody(request);
      return jsonResponse({
        ok: true,
        bridgeId: stringBody(body, 'bridgeId'),
        at: new Date().toISOString(),
      }, { status: 202 });
    }

    if (method === 'GET' && pathname === '/api/city/residents') {
      return jsonResponse({ residents: await context.store.listResidents() });
    }

    const residentPosts = pathname.match(/^\/api\/city\/residents\/([^/]+)\/posts$/);
    if (residentPosts && method === 'GET') {
      return jsonResponse({ posts: await context.store.listResidentPosts(decodeURIComponent(residentPosts[1] || '')) });
    }

    const residentAttention = pathname.match(/^\/api\/city\/residents\/([^/]+)\/attention-grants$/);
    if (residentAttention && method === 'POST') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const body = await readJsonBody(request);
      return jsonResponse(await context.store.grantResidentAttention({
        cityUserId: auth.cityUser.id,
        residentId: decodeURIComponent(residentAttention[1] || ''),
        apAmount: numberBody(body, 'apAmount'),
        idempotencyKey: stringBody(body, 'idempotencyKey'),
        memo: stringBody(body, 'memo'),
      }), { status: 202 });
    }

    if (method === 'GET' && pathname === '/api/city/trades') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      return jsonResponse({ trades: await context.store.listResidentTrades(auth.cityUser.id) });
    }

    if (method === 'POST' && pathname === '/api/city/trades') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const body = await readJsonBody(request);
      return jsonResponse(await context.store.createResidentTrade({
        cityUserId: auth.cityUser.id,
        residentId: stringBody(body, 'residentId') || '',
        offeredResource: pointResource(String(body.offeredResource)) || 'GP',
        offeredAmount: numberBody(body, 'offeredAmount'),
        requestedItem: stringBody(body, 'requestedItem'),
        idempotencyKey: stringBody(body, 'idempotencyKey'),
        metadata: recordBody(body, 'metadata'),
      }), { status: 202 });
    }

    const residentDetail = pathname.match(/^\/api\/city\/residents\/([^/]+)$/);
    if (residentDetail && method === 'GET') {
      const resident = await context.store.getResident(decodeURIComponent(residentDetail[1] || ''));
      return resident ? jsonResponse({ resident }) : notFound();
    }

    if (method === 'GET' && pathname === '/api/city/library') {
      return jsonResponse({ lives: await context.store.listLibrarySoulLives() });
    }

    if (method === 'GET' && (pathname === '/api/inbox' || pathname === '/api/city/inbox')) {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      return jsonResponse({ threads: await context.store.listInboxThreads(auth.cityUser.id) });
    }

    const inboxDetail = pathname.match(/^\/api\/(?:city\/)?inbox\/([^/]+)$/);
    if (inboxDetail && method === 'GET') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const thread = await context.store.getInboxThread(auth.cityUser.id, decodeURIComponent(inboxDetail[1] || ''));
      return thread ? jsonResponse(thread) : notFound();
    }

    return undefined;
  } catch (error) {
    if (error instanceof CityStoreError) return jsonResponse({ error: error.message }, { status: error.status });
    throw error;
  }
}

async function sessionResponse(
  request: Request,
  url: URL,
  context: CityApiContext,
  csrfToken: string,
): Promise<CitySessionResponse & { auth: Record<string, unknown>; store: Record<string, unknown>; csrfToken: string }> {
  const result = await context.auth.authenticate(request);
  const loginUrl = context.auth.loginUrl(url);
  const auth = { mode: result.mode, reason: result.reason, error: result.error };
  const store = {
    mode: context.store.mode,
    cityDatabaseConfigured: Boolean(context.config.cityDatabaseUrl),
    landingDatabaseConfigured: Boolean(context.config.landingDatabaseUrl),
  };
  if (!result.user) return { authenticated: false, loginUrl, auth, store, csrfToken };
  const cityUser = await context.store.upsertUserFromLanding(result.user);
  const points = await context.store.getPointBalances(cityUser.id);
  const roles: Array<'attendee' | 'admin'> = result.user.isAdmin ? ['attendee', 'admin'] : ['attendee'];
  return {
    authenticated: true,
    loginUrl,
    logoutUrl: new URL('/logout', context.config.landingAuthBaseUrl).toString(),
    user: {
      id: cityUser.id,
      landingUserId: cityUser.landingUserId,
      email: result.user.email,
      name: result.user.name || result.user.handle || result.user.email,
      handle: result.user.handle || undefined,
      avatarUrl: result.user.avatarUrl || undefined,
      isAdmin: result.user.isAdmin,
      roles,
      profileClaimed: result.user.profileClaimed,
    },
    points,
    auth,
    store,
    csrfToken,
  };
}

async function requireCityUser(
  request: Request,
  url: URL,
  context: CityApiContext,
): Promise<AuthenticatedCityRequest | Response> {
  const result = await context.auth.authenticate(request);
  if (!result.user) return jsonResponse({ error: 'unauthenticated', loginUrl: context.auth.loginUrl(url) }, { status: 401 });
  const cityUser = await context.store.upsertUserFromLanding(result.user);
  return { landingUser: result.user, cityUser };
}

async function requireAdmin(
  request: Request,
  url: URL,
  context: CityApiContext,
): Promise<AuthenticatedCityRequest | Response> {
  const auth = await requireCityUser(request, url, context);
  if (auth instanceof Response) return auth;
  if (!auth.landingUser.isAdmin) return jsonResponse({ error: 'forbidden' }, { status: 403 });
  return auth;
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) return {};
  const body = await request.json();
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

function pointResource(value: string | null): PointResource | undefined {
  return value === 'AP' || value === 'GP' ? value : undefined;
}

function stringBody(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberBody(body: Record<string, unknown>, key: string, fallback = 0): number {
  const value = Number(body[key]);
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function booleanBody(body: Record<string, unknown>, key: string): boolean | undefined {
  return typeof body[key] === 'boolean' ? Boolean(body[key]) : undefined;
}

function recordBody(body: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = body[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberRecordBody(body: Record<string, unknown>, key: string): Record<string, number> | undefined {
  const value = recordBody(body, key);
  if (!value) return undefined;
  return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, Number(entryValue) || 0]));
}

function arrayBody(body: Record<string, unknown>, key: string): unknown[] | undefined {
  return Array.isArray(body[key]) ? body[key] : undefined;
}

function isStateChanging(method: string): boolean {
  return method === 'POST' || method === 'PATCH' || method === 'DELETE';
}

function isPrintBridgeEndpoint(pathname: string): boolean {
  return pathname === '/api/admin/print-queue/claim' ||
    pathname === '/api/admin/print-queue/status' ||
    pathname === '/api/admin/print-bridge/heartbeat';
}

function csrfTokenForRequest(request: Request): string {
  return parseCookieHeader(request.headers.get('cookie')).get('city_csrf') || crypto.randomUUID();
}

function validateCsrf(request: Request): Response | undefined {
  const cookieToken = parseCookieHeader(request.headers.get('cookie')).get('city_csrf');
  const headerToken = request.headers.get('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return jsonResponse({ error: 'csrf_required' }, { status: 403 });
  }
  return undefined;
}

function requirePrintBridge(request: Request, context: CityApiContext): Response | undefined {
  const configured = context.config.printBridgeToken;
  if (!configured) return jsonResponse({ error: 'print_bridge_token_not_configured' }, { status: 503 });
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
  if (token !== configured) return jsonResponse({ error: 'unauthorized_print_bridge' }, { status: 401 });
  return undefined;
}

function csrfCookie(token: string, config: CityConfig): string {
  const parts = [
    `city_csrf=${encodeURIComponent(token)}`,
    'Path=/',
    'SameSite=Lax',
  ];
  if (config.sessionCookieSecure) parts.push('Secure');
  return parts.join('; ');
}

function gameCsrfToken(request: Request): string | undefined {
  const token = request.headers.get('x-csrf-token') || request.headers.get('x-nullcity-csrf');
  return validGameCsrfToken(token) ? token.trim() : undefined;
}

function gameTicketSecret(context: CityApiContext): string {
  return context.gameTicketSecret ?? gameSessionTicketSecretFromEnv();
}

function gameTicketTtlSeconds(context: CityApiContext): number {
  return context.gameTicketTtlSeconds ?? gameSessionTicketTtlSecondsFromEnv();
}

function printerKind(value: string): 'bambu-p2s' | 'snapmaker-u1' | 'generic' {
  return value === 'bambu-p2s' || value === 'snapmaker-u1' ? value : 'generic';
}

function printerAdapter(value: string): 'fdm-monster' | 'bambu-lan' | 'moonraker' | 'snapmaker-u1' | 'manual' {
  if (value === 'fdm-monster' || value === 'bambu-lan' || value === 'moonraker' || value === 'snapmaker-u1') return value;
  return 'manual';
}
