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
import { NullCityControlError, type NullCityControlClient, type NullCityEconomyStreamQuery, type NullCityNcriPrintQueueStatus } from './nullcity-control';
import { OnionDaoClientError, type OnionDaoClient, type OnionWallet } from './oniondao';
import { quoteSoulProposal } from './quote';
import { runAttentionGrant, initiateOnionAttentionGrant, settleOnionAttentionGrant } from './attention-grant';
import { verifyOnionCallbackSignature, type OnionApiClient } from './landing-onions';
import { CityStoreError, type AttentionGrantIntent, type CityStore } from './store';
import type { CityUser, InboxMessage, InboxThread, LandingSessionUser, PointResource } from './types';
import { jsonResponse, notFound } from '../util';

export interface CityApiContext {
  config: CityConfig;
  auth: LandingSessionAuthenticator;
  store: CityStore;
  landingCheckins?: LandingCheckinReader;
  nullcityControl?: NullCityControlClient;
  oniondao?: OnionDaoClient;
  onionApi?: OnionApiClient;
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

    if (method === 'POST' && pathname === '/api/onions/callback') {
      return jsonResponse({ ok: true, legacy: true });
    }

    if (
      isStateChanging(method) &&
      !isPrintBridgeEndpoint(pathname) &&
      pathname !== '/api/city/onion-callback' &&
      pathname !== '/api/onions/callback' &&
      !context.config.csrfDisabled
    ) {
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

    if (method === 'GET' && pathname === '/api/onions/wallet') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      if (!context.oniondao) return jsonResponse({ error: 'oniondao_not_configured' }, { status: 503 });
      return jsonResponse({ wallet: await context.oniondao.profile(onionUsername(auth.landingUser)) });
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

    if (method === 'GET' && pathname === '/api/admin/nullcity/proposals') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      if (!context.nullcityControl) return jsonResponse({ available: false, proposals: [], error: 'not_configured' });
      return jsonResponse({ available: true, proposals: await context.nullcityControl.listProposals() });
    }

    if (method === 'GET' && pathname === '/api/admin/nullcity/ncri') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      if (!context.nullcityControl) return jsonResponse({ available: false, records: [], error: 'not_configured' });
      return jsonResponse({ available: true, records: await context.nullcityControl.listNcri() });
    }

    if (method === 'GET' && pathname === '/api/admin/nullcity/ncri/print-queue') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      if (!context.nullcityControl?.ncriPrintQueue) {
        return jsonResponse({ available: false, items: [], error: 'not_configured' });
      }
      try {
        const response = await context.nullcityControl.ncriPrintQueue({
          status: ncriPrintQueueStatus(url.searchParams.get('status')),
        });
        return jsonResponse({ available: true, asOf: response.asOf, items: response.items });
      } catch (error) {
        if (error instanceof NullCityControlError) {
          return jsonResponse({ available: false, items: [], error: error.message });
        }
        throw error;
      }
    }

    if (method === 'GET' && pathname === '/api/admin/nullcity/economy/listings') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      if (!context.nullcityControl?.economyListings) {
        return jsonResponse({ available: false, listings: [], error: 'not_configured' });
      }
      try {
        const response = await context.nullcityControl.economyListings();
        return jsonResponse({ available: true, asOf: response.asOf, listings: response.listings });
      } catch (error) {
        if (error instanceof NullCityControlError) {
          return jsonResponse({ available: false, listings: [], error: error.message });
        }
        throw error;
      }
    }

    if (method === 'GET' && pathname === '/api/nullcity/economy/live') {
      if (!context.nullcityControl?.liveEconomy) return jsonResponse({ available: false, error: 'not_configured' });
      try {
        return jsonResponse({
          available: true,
          snapshot: await context.nullcityControl.liveEconomy({
            since: url.searchParams.get('since') || undefined,
            limit: positiveInteger(url.searchParams.get('limit')),
            residentLimit: positiveInteger(url.searchParams.get('residentLimit')),
          }),
        });
      } catch (error) {
        if (error instanceof NullCityControlError) return jsonResponse({ available: false, error: error.message });
        throw error;
      }
    }

    if (method === 'GET' && pathname === '/api/nullcity/economy/heartbeat') {
      if (!context.nullcityControl?.economyHeartbeat) return jsonResponse({ available: false, error: 'not_configured' });
      try {
        return jsonResponse({
          available: true,
          heartbeat: await context.nullcityControl.economyHeartbeat(),
        });
      } catch (error) {
        if (error instanceof NullCityControlError) return jsonResponse({ available: false, error: error.message });
        throw error;
      }
    }

    if (method === 'GET' && pathname === '/api/nullcity/economy/stream') {
      if (!context.nullcityControl?.economyStream) {
        return jsonResponse({ available: false, error: 'not_configured' }, { status: 404 });
      }
      try {
        const upstream = await context.nullcityControl.economyStream(economyStreamQuery(url));
        return new Response(upstream.body, {
          status: upstream.status,
          headers: economyStreamHeaders(upstream.headers),
        });
      } catch (error) {
        if (error instanceof NullCityControlError) {
          return jsonResponse({ available: false, error: error.message }, { status: error.status });
        }
        throw error;
      }
    }

    const nullcityExchangeAction = pathname.match(/^\/api\/admin\/nullcity\/residents\/([^/]+)\/ap-gp-exchanges$/);
    if (nullcityExchangeAction && method === 'POST') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      if (!context.nullcityControl?.exchangeApForGp) return jsonResponse({ error: 'not_configured' }, { status: 503 });
      const resident = decodeURIComponent(nullcityExchangeAction[1] || '');
      const body = await readJsonBody(request);
      return jsonResponse({
        available: true,
        exchange: await context.nullcityControl.exchangeApForGp(resident, {
          idempotencyKey: stringBody(body, 'idempotencyKey') || crypto.randomUUID(),
          apAmount: numberBody(body, 'apAmount'),
          gpAmount: numberBody(body, 'gpAmount'),
          ...(stringBody(body, 'cityUserId') ? { cityUserId: stringBody(body, 'cityUserId') } : {}),
          ...(stringBody(body, 'sourceType') ? { sourceType: stringBody(body, 'sourceType') } : {}),
          ...(stringBody(body, 'sourceId') ? { sourceId: stringBody(body, 'sourceId') } : {}),
        }),
      });
    }

    const nullcityProposalAction = pathname.match(/^\/api\/admin\/nullcity\/proposals\/([^/]+)\/(approve|reject|birth)$/);
    if (nullcityProposalAction && method === 'POST') {
      const auth = await requireAdmin(request, url, context);
      if (auth instanceof Response) return auth;
      if (!context.nullcityControl) return jsonResponse({ error: 'not_configured' }, { status: 503 });
      const proposalId = decodeURIComponent(nullcityProposalAction[1] || '');
      const action = nullcityProposalAction[2] || '';
      const body = await readJsonBody(request);
      if (action === 'approve') {
        return jsonResponse(await context.nullcityControl.approveProposal(proposalId, stringBody(body, 'adminNotes')));
      }
      if (action === 'reject') {
        return jsonResponse(await context.nullcityControl.rejectProposal(proposalId, stringBody(body, 'adminNotes')));
      }
      return jsonResponse(await context.nullcityControl.birthProposal(proposalId));
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
      const body = await readJsonBody(request);
      const bridgeId = stringBody(body, 'bridgeId');
      if (!bridgeId) return jsonResponse({ error: 'bridge_id_required' }, { status: 400 });
      const printerIds = stringArrayBody(body, 'printerIds');
      if (!printerIds.length) return jsonResponse({ error: 'printer_ids_required' }, { status: 400 });
      const job = await context.store.claimNextPrintQueueJob({
        bridgeId,
        printerIds,
      });
      return jsonResponse(job ? { job } : {});
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
      const residentId = decodeURIComponent(residentAttention[1] || '');

      // REAL consent-spend: create an onion burn request the attendee approves.
      if (context.config.onionSpendMode === 'real') {
        if (!context.onionApi) return jsonResponse({ error: 'onion_api_unconfigured' }, { status: 503 });
        const callbackUrl = new URL('/api/city/onion-callback', context.config.publicBaseUrl || context.config.landingAuthBaseUrl).toString();
        const result = await initiateOnionAttentionGrant(
          { store: context.store, onionApi: context.onionApi, callbackUrl, callbackSecret: context.config.onionCallbackSecret, requester: 'nullcity' },
          {
            cityUserId: auth.cityUser.id,
            username: auth.landingUser.handle || auth.landingUser.email,
            residentId,
            amount: numberBody(body, 'apAmount'),
            idempotencyKey: stringBody(body, 'idempotencyKey'),
            note: stringBody(body, 'memo'),
          },
        );
        // Same explicit-consent contract as the onion-attention-grants route:
        // the attendee confirms on landing; the UI links approvalUrl and polls
        // statusUrl until the callback (or poll) settles the grant.
        return jsonResponse({
          status: result.status,
          onionRequestId: result.onionRequestId,
          idempotencyKey: result.intent.idempotencyKey,
          approvalUrl: onionApprovalUrl(context.config),
          statusUrl: `/api/city/onion-attention-grants/${encodeURIComponent(result.intent.idempotencyKey)}/status`,
          intent: { id: result.intent.id, state: result.intent.state, residentId },
          message: 'Confirm the onion burn on OnionDAO (approvalUrl) to support this resident.',
        }, { status: 202 });
      }

      // STAND-IN (default, non-production): synchronous credit for dev/demo.
      const outcome = await runAttentionGrant(
        { store: context.store, control: context.nullcityControl },
        {
          cityUserId: auth.cityUser.id,
          residentId,
          apAmount: numberBody(body, 'apAmount'),
          idempotencyKey: stringBody(body, 'idempotencyKey'),
          memo: stringBody(body, 'memo'),
        },
      );
      return jsonResponse({
        intent: { id: outcome.intent.id, state: outcome.intent.state, residentId: outcome.intent.residentId },
        ledger: outcome.ledger,
        residentId: outcome.intent.residentId,
        city: outcome.cityResponse,
      }, { status: 202 });
    }

    const residentOnionAttention = pathname.match(/^\/api\/city\/residents\/([^/]+)\/onion-attention-grants$/);
    if (residentOnionAttention && method === 'POST') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      return runOnionAttentionGrant(
        request,
        context,
        auth,
        decodeURIComponent(residentOnionAttention[1] || ''),
        await readJsonBody(request),
      );
    }

    // Pollable status for a pending onion attention grant (explicit-consent UX).
    const onionGrantStatus = pathname.match(/^\/api\/city\/onion-attention-grants\/([^/]+)\/status$/);
    if (onionGrantStatus && method === 'GET') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      return onionAttentionGrantStatus(context, auth, decodeURIComponent(onionGrantStatus[1] || ''));
    }

    // Landing onion-spend callback (webhook): settle a previously-initiated grant.
    if (pathname === '/api/city/onion-callback' && method === 'POST') {
      const raw = await request.text();
      const secret = context.config.onionCallbackSecret;
      if (!secret) return jsonResponse({ error: 'callback_secret_unconfigured' }, { status: 503 });
      if (!verifyOnionCallbackSignature(raw, request.headers.get('x-onion-signature'), secret)) {
        return jsonResponse({ error: 'invalid_signature' }, { status: 401 });
      }
      let payload: Record<string, unknown> = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        return jsonResponse({ error: 'invalid_json' }, { status: 400 });
      }
      const onionRequestId = typeof payload.id === 'string' ? payload.id : '';
      if (!onionRequestId) return jsonResponse({ error: 'missing_id' }, { status: 400 });
      if (!context.nullcityControl) return jsonResponse({ error: 'control_unconfigured' }, { status: 503 });
      const result = await settleOnionAttentionGrant(
        { store: context.store, control: context.nullcityControl },
        { onionRequestId, status: String(payload.status ?? ''), success: payload.success === true },
      );
      return jsonResponse({ ok: true, settled: result.settled, state: result.state });
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
      const [threads, letterThreads] = await Promise.all([
        context.store.listInboxThreads(auth.cityUser.id),
        listNullCityLetterThreads(context, auth),
      ]);
      return jsonResponse({ threads: mergeInboxThreads(threads, letterThreads) });
    }

    const inboxDetail = pathname.match(/^\/api\/(?:city\/)?inbox\/([^/]+)$/);
    if (inboxDetail && method === 'GET') {
      const auth = await requireCityUser(request, url, context);
      if (auth instanceof Response) return auth;
      const threadId = decodeURIComponent(inboxDetail[1] || '');
      if (isNullCityLetterThreadId(threadId)) {
        const letterThread = await getNullCityLetterThread(context, auth, threadId);
        if (letterThread) return jsonResponse(letterThread);
      }
      const thread = await context.store.getInboxThread(auth.cityUser.id, threadId);
      return thread ? jsonResponse(thread) : notFound();
    }

    return undefined;
  } catch (error) {
    if (error instanceof CityStoreError) return jsonResponse({ error: error.message }, { status: error.status });
    if (error instanceof NullCityControlError) return jsonResponse({ error: error.message }, { status: error.status });
    if (error instanceof OnionDaoClientError) {
      return jsonResponse({ error: error.code, details: error.details }, { status: error.status });
    }
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
    landingSessionMode: context.config.landingSessionMode,
  };
  if (!result.user) return { authenticated: false, loginUrl, auth, store, csrfToken };
  const cityUser = await context.store.upsertUserFromLanding(result.user);
  const [points, onionWalletResult] = await Promise.all([
    context.store.getPointBalances(cityUser.id),
    onionWalletForUser(context, result.user),
  ]);
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
    ...(onionWalletResult.wallet ? { onionWallet: onionWalletResult.wallet } : {}),
    ...(onionWalletResult.error ? { onionWalletError: onionWalletResult.error } : {}),
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

/**
 * EXPLICIT spend consent (maintainer decision 2026-06-11): the dashboard NEVER
 * approves the burn itself. We create the burn request on landing, then SEND
 * THE USER TO LANDING (`approvalUrl`) to confirm the transaction. Settlement
 * happens only after landing reports the outcome — via the HMAC callback
 * (`POST /api/city/onion-callback`) or the polling endpoint
 * (`GET /api/city/onion-attention-grants/:idempotencyKey/status`).
 *
 * Response contract for the UI (pending-state UX is built against this):
 *   202 {
 *     status: 'pending_onion_settlement',
 *     residentId,
 *     idempotencyKey,                  // poll handle — stable across retries
 *     approvalUrl,                     // landing's approval surface (/portal/onions)
 *     statusUrl,                       // GET endpoint the UI can poll
 *     onionRequest: { id, status },
 *     intent: { id, state, residentId },
 *   }
 *   202 { status: 'settled', residentId, idempotencyKey, onionRequest, city, onionWallet? }   // replay of a settled key
 *   202 { status: 'onion_spend_denied' | 'onion_spend_failed', residentId, idempotencyKey }   // replay of a dead key
 *
 * Double-burn guard: a POST with a FRESH idempotencyKey while the same
 * user+resident still has an intent awaiting approval returns the EXISTING
 * pending intent (same approvalUrl/idempotencyKey) instead of creating a
 * second burn request on landing.
 */
async function runOnionAttentionGrant(
  request: Request,
  context: CityApiContext,
  auth: AuthenticatedCityRequest,
  residentId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  if (!context.oniondao) return jsonResponse({ error: 'oniondao_not_configured' }, { status: 503 });
  // Settlement needs the City control seam; fail before burning onions we
  // could never credit.
  if (!context.nullcityControl?.creditAttention) return jsonResponse({ error: 'nullcity_control_not_configured' }, { status: 503 });

  const onionAmount = numberBody(body, 'onionAmount', numberBody(body, 'amount'));
  const attentionAmount = numberBody(body, 'attentionAmount', onionAmount);
  if (onionAmount <= 0 || attentionAmount <= 0) return jsonResponse({ error: 'invalid_amount' }, { status: 400 });

  const username = onionUsername(auth.landingUser);
  if (!username) return jsonResponse({ error: 'onion_username_required' }, { status: 400 });

  // Retry double-burn guard: reuse the in-flight intent for this user+resident
  // (regardless of the idempotencyKey on this POST).
  const pending = await context.store.findPendingAttentionGrantIntent(auth.cityUser.id, residentId);
  if (pending?.onionRequestId) {
    return pendingOnionSettlementResponse(context, pending);
  }

  const idempotencyKey = stringBody(body, 'idempotencyKey') || crypto.randomUUID();
  const memo = stringBody(body, 'memo') || `Spend ${onionAmount} Onions to support ${residentId}`;
  let intent = await context.store.createAttentionGrantIntent({
    cityUserId: auth.cityUser.id,
    residentId,
    apAmount: attentionAmount,
    idempotencyKey,
  });
  if (intent.state === 'settled') {
    if (!intent.onionRequestId) return jsonResponse({ error: 'attention_grant_already_settled' }, { status: 409 });
    const onionRequest = await context.oniondao.requestStatus(intent.onionRequestId);
    const onionWalletResult = await onionWalletForUser(context, auth.landingUser);
    return jsonResponse({
      status: 'settled',
      residentId,
      idempotencyKey: intent.idempotencyKey,
      onionRequest,
      city: intent.cityResponse,
      ...(onionWalletResult.wallet ? { onionWallet: onionWalletResult.wallet } : {}),
      ...(onionWalletResult.error ? { onionWalletError: onionWalletResult.error } : {}),
    }, { status: 202 });
  }
  if (intent.state === 'denied' || intent.state === 'failed') {
    // Replay of a key whose burn was already denied/failed on landing.
    return jsonResponse({
      status: `onion_spend_${intent.state}`,
      residentId,
      idempotencyKey: intent.idempotencyKey,
    }, { status: 202 });
  }
  if (intent.state === 'settling' || (intent.state === 'awaiting_approval' && intent.onionRequestId)) {
    return pendingOnionSettlementResponse(context, intent);
  }

  // Fresh intent: create the burn request the attendee must approve on landing.
  // Idempotent on (requester, externalId) landing-side.
  const requestResult = await context.oniondao.createRequest({
    type: 'burn',
    username,
    amount: onionAmount,
    callbackUrl: onionCallbackUrl(context.config),
    callbackSecret: context.config.onionCallbackSecret,
    requester: context.config.onionExternalRequester,
    externalId: onionAttentionExternalId(auth.cityUser.id, residentId, idempotencyKey),
    note: memo,
    metadata: {
      app: 'nullcity-dashboard',
      cityUserId: auth.cityUser.id,
      landingUserId: auth.landingUser.id,
      residentId,
      idempotencyKey,
      attentionAmount,
    },
  });
  intent = await context.store.updateAttentionGrantIntent(intent.id, {
    state: 'awaiting_approval',
    onionRequestId: requestResult.id,
  });

  // NO auto-approve here — the attendee confirms on landing (approvalUrl).
  return pendingOnionSettlementResponse(context, intent);
}

/**
 * Poll endpoint backing the pending-state UX:
 * GET /api/city/onion-attention-grants/:idempotencyKey/status
 *
 * Checks the landing burn-request state and settles when the attendee has
 * approved (the callback may also have settled it already — both paths are
 * idempotent: settlement claims the intent only from `awaiting_approval`).
 * Responses (always 200 once the intent exists; 404 for an unknown key):
 *   { status: 'pending_onion_settlement', residentId, idempotencyKey, approvalUrl, statusUrl, onionRequest? }
 *   { status: 'settled', residentId, idempotencyKey, city, onionRequest?, onionWallet? }
 *   { status: 'onion_spend_denied' | 'onion_spend_failed', residentId, idempotencyKey, onionRequest? }
 */
async function onionAttentionGrantStatus(
  context: CityApiContext,
  auth: AuthenticatedCityRequest,
  idempotencyKey: string,
): Promise<Response> {
  const intent = await context.store.getAttentionGrantIntent(auth.cityUser.id, idempotencyKey);
  if (!intent) return notFound();

  if (intent.state === 'settled') {
    const onionWalletResult = await onionWalletForUser(context, auth.landingUser);
    return jsonResponse({
      status: 'settled',
      residentId: intent.residentId,
      idempotencyKey: intent.idempotencyKey,
      city: intent.cityResponse,
      ...(onionWalletResult.wallet ? { onionWallet: onionWalletResult.wallet } : {}),
      ...(onionWalletResult.error ? { onionWalletError: onionWalletResult.error } : {}),
    });
  }
  if (intent.state === 'denied' || intent.state === 'failed') {
    return jsonResponse({
      status: `onion_spend_${intent.state}`,
      residentId: intent.residentId,
      idempotencyKey: intent.idempotencyKey,
    });
  }
  if (!intent.onionRequestId || (!context.oniondao && !context.onionApi)) {
    // No burn request yet (or no client to poll with): report pending; the
    // callback can still settle it.
    return pendingOnionSettlementResponse(context, intent, 200);
  }

  const onionRequest = context.oniondao
    ? await context.oniondao.requestStatus(intent.onionRequestId)
    : await context.onionApi!.getRequestStatus(intent.onionRequestId);
  if (onionRequest.status === 'completed' || onionRequest.status === 'denied' || onionRequest.status === 'failed') {
    const control = (context.nullcityControl ?? {}) as Pick<NullCityControlClient, 'creditAttention'>;
    const settlement = await settleOnionAttentionGrant(
      { store: context.store, control },
      { onionRequestId: intent.onionRequestId, status: onionRequest.status, success: onionRequest.status === 'completed' },
    );
    if (settlement.settled) {
      const onionWalletResult = await onionWalletForUser(context, auth.landingUser);
      return jsonResponse({
        status: 'settled',
        residentId: intent.residentId,
        idempotencyKey: intent.idempotencyKey,
        onionRequest,
        city: settlement.intent?.cityResponse,
        ...(onionWalletResult.wallet ? { onionWallet: onionWalletResult.wallet } : {}),
        ...(onionWalletResult.error ? { onionWalletError: onionWalletResult.error } : {}),
      });
    }
    if (settlement.state === 'denied' || settlement.state === 'failed') {
      return jsonResponse({
        status: `onion_spend_${settlement.state}`,
        residentId: intent.residentId,
        idempotencyKey: intent.idempotencyKey,
        onionRequest,
      });
    }
    // Another caller holds the settlement claim ('settling') — report pending.
  }
  return pendingOnionSettlementResponse(context, intent, 200, onionRequest);
}

function pendingOnionSettlementResponse(
  context: CityApiContext,
  intent: AttentionGrantIntent,
  status = 202,
  onionRequest?: { id: string; status: string },
): Response {
  return jsonResponse({
    status: 'pending_onion_settlement',
    residentId: intent.residentId,
    idempotencyKey: intent.idempotencyKey,
    approvalUrl: onionApprovalUrl(context.config),
    statusUrl: `/api/city/onion-attention-grants/${encodeURIComponent(intent.idempotencyKey)}/status`,
    ...(intent.onionRequestId
      ? { onionRequest: onionRequest ?? { id: intent.onionRequestId, status: 'pending' } }
      : {}),
    intent: { id: intent.id, state: intent.state, residentId: intent.residentId },
    message: 'Confirm the onion burn on OnionDAO (approvalUrl) to support this resident.',
  }, { status });
}

/**
 * Landing's approval surface. Landing has no per-request deep link — its own
 * push notifications point at the /portal/onions list page, where the attendee
 * approves or denies pending requests.
 */
function onionApprovalUrl(config: CityConfig): string {
  return new URL('/portal/onions', config.onionApiBaseUrl || config.landingAuthBaseUrl).toString();
}

async function onionWalletForUser(
  context: CityApiContext,
  user: LandingSessionUser,
): Promise<{ wallet?: OnionWallet; error?: string }> {
  if (!context.oniondao) return {};
  try {
    return { wallet: await context.oniondao.profile(onionUsername(user)) };
  } catch (error) {
    return { error: error instanceof OnionDaoClientError ? error.code : 'onion_wallet_unavailable' };
  }
}

function onionUsername(user: LandingSessionUser): string {
  return (user.handle || user.email || user.name || user.id).replace(/^@/, '').trim();
}

function onionAttentionExternalId(cityUserId: string, residentId: string, idempotencyKey: string): string {
  return `attention:${cityUserId}:${residentId}:${idempotencyKey}`;
}

function onionCallbackUrl(config: CityConfig): string {
  if (config.onionCallbackUrl) return config.onionCallbackUrl;
  const url = new URL('/api/city/onion-callback', config.publicBaseUrl || 'http://localhost:8787');
  if (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === '[::1]')) url.hostname = 'localhost';
  return url.toString();
}

interface NullCityLetter {
  kind: string;
  recipient: string;
  senderResident: string;
  subject: string;
  body: string;
  dispatchedAt: string;
}

const NULLCITY_LETTER_THREAD_PREFIX = 'nullcity-letter:';

async function listNullCityLetterThreads(
  context: CityApiContext,
  auth: AuthenticatedCityRequest,
): Promise<InboxThread[]> {
  const letters = await fetchNullCityLetters(context, auth);
  return letters.map(letter => nullCityLetterThread(auth.cityUser.id, letter));
}

async function getNullCityLetterThread(
  context: CityApiContext,
  auth: AuthenticatedCityRequest,
  threadId: string,
): Promise<{ thread: InboxThread; messages: InboxMessage[] } | undefined> {
  const letters = await fetchNullCityLetters(context, auth);
  const letter = letters.find(item => nullCityLetterThreadId(item) === threadId);
  if (!letter) return undefined;
  const thread = nullCityLetterThread(auth.cityUser.id, letter);
  return { thread, messages: [nullCityLetterMessage(thread.id, letter, true)] };
}

async function fetchNullCityLetters(
  context: CityApiContext,
  auth: AuthenticatedCityRequest,
): Promise<NullCityLetter[]> {
  const baseUrl = context.config.nullcityLettersBaseUrl;
  if (!baseUrl) return [];
  const humans = uniqueStrings([
    auth.landingUser.handle,
    auth.landingUser.email,
    auth.landingUser.id,
    auth.cityUser.landingUserId,
    auth.cityUser.id,
  ]);
  const batches = await Promise.all(humans.map(human => fetchNullCityLettersForHuman(baseUrl, human)));
  const byId = new Map<string, NullCityLetter>();
  for (const letter of batches.flat()) {
    byId.set(nullCityLetterThreadId(letter), letter);
  }
  return [...byId.values()].sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt));
}

async function fetchNullCityLettersForHuman(baseUrl: string, human: string): Promise<NullCityLetter[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${baseUrl}/v1/inbox?human=${encodeURIComponent(human)}`, { signal: controller.signal });
    if (!response.ok) return [];
    const payload = await response.json();
    const record = recordValue(payload);
    const letters = Array.isArray(record?.letters) ? record.letters : [];
    return letters.flatMap(letter => {
      const normalized = normalizeNullCityLetter(letter);
      return normalized ? [normalized] : [];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeNullCityLetter(value: unknown): NullCityLetter | undefined {
  const record = recordValue(value);
  const kind = stringValue(record?.kind);
  const recipient = stringValue(record?.recipient);
  const senderResident = stringValue(record?.senderResident);
  const subject = stringValue(record?.subject);
  const body = stringValue(record?.body);
  const dispatchedAt = stringValue(record?.dispatchedAt);
  if (!kind || !recipient || !senderResident || !subject || !body || !dispatchedAt) return undefined;
  return { kind, recipient, senderResident, subject, body, dispatchedAt };
}

function nullCityLetterThread(cityUserId: string, letter: NullCityLetter): InboxThread {
  const id = nullCityLetterThreadId(letter);
  return {
    id,
    cityUserId,
    residentId: letter.senderResident,
    status: 'letter',
    createdAt: letter.dispatchedAt,
    updatedAt: letter.dispatchedAt,
    latestMessage: nullCityLetterMessage(id, letter, false),
  };
}

function nullCityLetterMessage(threadId: string, letter: NullCityLetter, includeBody: boolean): InboxMessage {
  return {
    id: `${threadId}:message`,
    threadId,
    senderType: 'resident',
    senderResidentId: letter.senderResident,
    body: includeBody ? letter.body : letter.subject,
    messageType: letter.kind,
    metadata: {
      source: 'nullcity_letters',
      recipient: letter.recipient,
      subject: letter.subject,
      dispatchedAt: letter.dispatchedAt,
    },
    createdAt: letter.dispatchedAt,
  };
}

function nullCityLetterThreadId(letter: NullCityLetter): string {
  return [
    NULLCITY_LETTER_THREAD_PREFIX,
    encodeURIComponent(letter.kind),
    encodeURIComponent(letter.recipient),
    encodeURIComponent(letter.senderResident),
    encodeURIComponent(letter.dispatchedAt),
    encodeURIComponent(letter.subject),
  ].join(':');
}

function isNullCityLetterThreadId(threadId: string): boolean {
  return threadId.startsWith(NULLCITY_LETTER_THREAD_PREFIX);
}

function mergeInboxThreads(primary: InboxThread[], synthetic: InboxThread[]): InboxThread[] {
  const byId = new Map<string, InboxThread>();
  for (const thread of [...primary, ...synthetic]) byId.set(thread.id, thread);
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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

function positiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function economyStreamQuery(url: URL): NullCityEconomyStreamQuery {
  return {
    ...(url.searchParams.get('since') ? { since: url.searchParams.get('since') || undefined } : {}),
    ...(positiveInteger(url.searchParams.get('limit')) ? { limit: positiveInteger(url.searchParams.get('limit')) } : {}),
    ...(positiveInteger(url.searchParams.get('residentLimit')) ? { residentLimit: positiveInteger(url.searchParams.get('residentLimit')) } : {}),
    ...(positiveInteger(url.searchParams.get('intervalMs')) ? { intervalMs: positiveInteger(url.searchParams.get('intervalMs')) } : {}),
    ...(url.searchParams.get('once') === '1' || url.searchParams.get('once') === 'true' ? { once: true } : {}),
  };
}

function economyStreamHeaders(upstream: Headers): Headers {
  const headers = new Headers({
    'content-type': upstream.get('content-type') || 'text/event-stream; charset=utf-8',
    'cache-control': upstream.get('cache-control') || 'no-cache',
    connection: 'keep-alive',
  });
  const buffering = upstream.get('x-accel-buffering');
  if (buffering) headers.set('x-accel-buffering', buffering);
  return headers;
}

function ncriPrintQueueStatus(value: string | null): NullCityNcriPrintQueueStatus | undefined {
  if (value === 'awaiting_redemption' || value === 'redeemed' || value === 'all') return value;
  return undefined;
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

function stringArrayBody(body: Record<string, unknown>, key: string): string[] {
  return (arrayBody(body, key) || [])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(value => value.trim());
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
