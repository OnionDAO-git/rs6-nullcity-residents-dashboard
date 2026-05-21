<script lang="ts">
  import { onMount } from 'svelte';
  import type { DashboardOverview, GatewayStatus, ObservableSubjectSummary, Position, ResidentAppearance, ResidentDashboardRow, RuntimeReadModel, SoulSummary, SpectatorMode, SpectatorSession, SpectatorSubject } from '@nullcity-dashboard/shared';
  import { NullCitySpectatorBridge, type SpectatorDisplayFilters } from '@nullcity-dashboard/observer';
  import { api, routeTo } from './lib/api';
  import { buildActivitySnapshot } from './lib/activity';
  import { compactJson, timeAgo } from './lib/format';

  let route = window.location.pathname;
  let loading = false;
  let actionBusy = false;
  let error = '';
  let actionError = '';
  let overview: DashboardOverview | undefined;
  let gatewayStatus: GatewayStatus | undefined;
  let residents: ResidentDashboardRow[] = [];
  let selectedRuntime: RuntimeReadModel | undefined;
  let subjects: ObservableSubjectSummary[] = [];
  let sessions: SpectatorSession[] = [];
  let souls: SoulSummary[] = [];
  let logs: { actions: unknown[]; inference: unknown[] } = { actions: [], inference: [] };
  let visibleResidents: ResidentDashboardRow[] = [];
  let activeSession: SpectatorSession | undefined;
  let activeObserveSession: SpectatorSession | undefined;
  let activeResidentSession: SpectatorSession | undefined;
  let liveSelectedRuntime: RuntimeReadModel | undefined;
  let sessionStream: EventSource | undefined;
  let sessionStreamId = '';
  let showSpectatorPlayers = true;
  let showSpectatorNpcs = true;
  let showSpectatorObjects = false;
  let showSpectatorItems = true;
  let spectatorZoom = 1;
  let spectatorModalOpen = false;
  let perceptionFeedLoadingResident = '';

  const defaultSpawnX = '3225';
  const defaultSpawnY = '3217';
  const defaultSpawnLevel = '0';
  const spectatorZoomMin = 0.5;
  const spectatorZoomMax = 3;
  const spectatorZoomStep = 0.25;
  const namePrefixes = ['ash', 'brim', 'cove', 'dusk', 'fern', 'glen', 'mire', 'rune', 'vale', 'west'];
  const nameRoles = ['adept', 'baker', 'mason', 'miner', 'scribe', 'smith', 'weaver', 'walker'];
  const appearanceParts = {
    head: [0, 1, 2, 3, 4, 5, 6, 7],
    facialHair: [10, 11, 12, 13, 14, 15, 16, 17],
    torso: [18, 19, 20, 21, 22, 23, 24, 25],
    arms: [26, 27, 28, 29, 30, 31],
    hands: [33, 34, 35],
    legs: [36, 37, 38, 39, 40],
    feet: [42, 43, 44],
  };

  let filter = 'all';
  let newName = randomResidentName();
  let newAppearance: ResidentAppearance = randomAppearance();
  let spawnX = defaultSpawnX;
  let spawnY = defaultSpawnY;
  let spawnLevel = defaultSpawnLevel;
  let spawnDraftRoute = '';
  let disconnectPolicy = 'idle';
  let jsonAction = '{\n  "kind": "noop",\n  "cause": "dashboard"\n}';

  $: parts = route.split('/').filter(Boolean);
  $: residentName = parts[0] === 'residents' && parts[1] && parts[1] !== 'new' ? decodeURIComponent(parts[1]) : '';
  $: observeKind = parts[0] === 'observe' ? parts[1] || '' : '';
  $: observeId = parts[0] === 'observe' ? parts[2] || '' : '';
  $: visibleResidents = route === '/' ? overview?.residents || [] : residents;
  $: canDeleteResidents = Boolean(gatewayStatus?.allowDelete);
  $: activeObserveSession = findObserveRouteSession(activeSession, sessions);
  $: activeResidentSession = findResidentSession(activeSession, sessions, residentName);
  $: {
    if (
      perceptionFeedLoadingResident &&
      (!residentName ||
        perceptionFeedLoadingResident.toLowerCase() !== residentName.toLowerCase() ||
        activeResidentSession?.latestPerception)
    ) {
      perceptionFeedLoadingResident = '';
    }
  }
  $: perceptionFeedLoading = Boolean(
    perceptionFeedLoadingResident &&
      residentName &&
      perceptionFeedLoadingResident.toLowerCase() === residentName.toLowerCase() &&
      !activeResidentSession?.latestPerception,
  );
  $: liveSelectedRuntime = withLiveResidentBody(selectedRuntime, activeResidentSession);
  $: spectatorFilters = {
    players: showSpectatorPlayers,
    npcs: showSpectatorNpcs,
    objects: showSpectatorObjects,
    items: showSpectatorItems,
    zoom: spectatorZoom,
  };
  $: {
    if (route === '/residents/new' && spawnDraftRoute !== route) {
      seedSpawnDraft();
      spawnDraftRoute = route;
    } else if (route !== '/residents/new') {
      spawnDraftRoute = '';
    }
  }

  onMount(() => {
    const listener = () => {
      route = window.location.pathname;
      void loadRoute();
    };
    window.addEventListener('popstate', listener);
    void loadRoute();
    const timer = setInterval(() => void refreshQuietly(), 5000);
    return () => {
      window.removeEventListener('popstate', listener);
      clearInterval(timer);
    };
  });

  async function refreshQuietly() {
    try {
      await loadRoute(false);
    } catch {
      // Keep stale data visible during reconnects.
    }
  }

  async function loadRoute(showSpinner = true) {
    if (showSpinner) loading = true;
    error = '';
    try {
      if (route === '/') {
        overview = await api.overview();
        gatewayStatus = overview.gateway;
      }
      else if (route === '/residents') {
        [residents, gatewayStatus] = await Promise.all([api.residents(filter), api.gatewayStatus()]);
      }
      else if (route === '/residents/new') {
        seedSpawnDefaults();
        souls = await api.souls();
      }
      else if (residentName) {
        [selectedRuntime, sessions, gatewayStatus] = await Promise.all([api.runtime(residentName), api.sessions(), api.gatewayStatus()]);
        syncResidentStream();
      }
      else if (route === '/observe' || route.startsWith('/observe/')) {
        const observedResident = observeKind === 'resident' && observeId ? decodeURIComponent(observeId) : '';
        const observedRuntime = observedResident ? api.runtime(observedResident).catch(() => undefined) : Promise.resolve(undefined);
        [subjects, sessions, selectedRuntime, gatewayStatus] = await Promise.all([api.subjects(), api.sessions(), observedRuntime, api.gatewayStatus()]);
        await ensureObserveRouteSession();
        syncObserveStream();
      }
      else if (route === '/souls') souls = await api.souls();
      else if (route === '/logs') logs = await api.logs();
      if (!residentName && !route.startsWith('/observe/')) closeSessionStream();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Request failed';
    } finally {
      loading = false;
    }
  }

  function nav(path: string) {
    routeTo(path);
  }

  function seedSpawnDefaults() {
    if (!spawnX.trim()) spawnX = defaultSpawnX;
    if (!spawnY.trim()) spawnY = defaultSpawnY;
    if (!spawnLevel.trim()) spawnLevel = defaultSpawnLevel;
  }

  function seedSpawnDraft() {
    seedSpawnDefaults();
    randomizeSpawnName();
    randomizeSpawnModel();
  }

  function randomizeSpawnName() {
    newName = randomResidentName();
  }

  function randomizeSpawnModel() {
    newAppearance = randomAppearance();
  }

  function randomResidentName(): string {
    const prefix = pick(namePrefixes);
    const role = pick(nameRoles);
    const suffix = Math.floor(Math.random() * 90) + 10;
    return `${prefix}${role}${suffix}`;
  }

  function residentSlug(name: string): string {
    const normalized = name.trim().toLowerCase();
    return normalized.startsWith('res:') ? normalized.slice(4) : normalized;
  }

  function residentDisplayName(name: string): string {
    return residentSlug(name);
  }

  function residentIdFromInput(input: string): string {
    const slug = residentSlug(input);
    if (!/^[a-z0-9_]{1,20}$/.test(slug)) throw new Error('Resident names must use 1-20 lowercase letters, numbers, or underscores');
    return `res:${slug}`;
  }

  function randomAppearance(): ResidentAppearance {
    return {
      gender: 0,
      head: pick(appearanceParts.head),
      torso: pick(appearanceParts.torso),
      arms: pick(appearanceParts.arms),
      legs: pick(appearanceParts.legs),
      hands: pick(appearanceParts.hands),
      feet: pick(appearanceParts.feet),
      facialHair: pick(appearanceParts.facialHair),
      hairColor: rand(0, 11),
      torsoColor: rand(0, 15),
      legColor: rand(0, 15),
      feetColor: rand(0, 5),
      skinColor: rand(0, 4),
    };
  }

  function pick<T>(values: T[]): T {
    return values[Math.floor(Math.random() * values.length)] as T;
  }

  function rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async function createResident() {
    await runAction(async () => {
      const name = residentIdFromInput(newName);
      const body: Record<string, unknown> = { name, appearance: newAppearance };
      const x = Number(spawnX);
      const y = Number(spawnY);
      const level = Number(spawnLevel);
      if (Number.isInteger(x) && Number.isInteger(y)) body.spawnPosition = { x, y, level: Number.isInteger(level) ? level : 0 };
      await api.createResident(body);
      await api.residentCommand(name, 'connect', { observe: true, control: false, onDisconnect: disconnectPolicy });
      nav(`/residents/${encodeURIComponent(name)}`);
    });
  }

  async function commandResident(command: 'connect' | 'attach' | 'detach' | 'disconnect') {
    if (!residentName) return;
    await runAction(async () => {
      await api.residentCommand(residentName, command, command === 'connect' ? { observe: true, control: true, onDisconnect: disconnectPolicy } : {});
      await loadRoute();
    });
  }

  async function logoutResident() {
    if (!residentName) return;
    await runAction(async () => {
      await api.residentCommand(residentName, 'disconnect', { cause: 'dashboard_logout' });
      await loadRoute();
    });
  }

  async function pauseResident() {
    if (!residentName) return;
    await runAction(async () => {
      await api.residentCommand(residentName, 'pause', { cause: 'dashboard_pause' });
      await loadRoute();
    });
  }

  async function deleteResident() {
    if (!residentName) return;
    await deleteResidentByName(residentName);
  }

  async function deleteResidentByName(name: string) {
    if (!canDeleteResidents) {
      actionError = 'Resident delete is disabled by the game server. Set agentGateway.allowDelete to true and restart the server to enable it.';
      return;
    }
    if (!confirmDeleteResident(name)) return;
    await runAction(async () => {
      const deletingCurrentResident = residentName.toLowerCase() === name.toLowerCase();
      await api.deleteResident(name);
      if (deletingCurrentResident) {
        nav('/residents');
      }
      await loadRoute(false);
    });
  }

  function confirmDeleteResident(name: string): boolean {
    const typed = window.prompt(`Delete ${residentDisplayName(name)}? Type the resident name to confirm.`);
    return typed?.trim().toLowerCase() === name.toLowerCase();
  }

  async function loginResident() {
    if (!residentName) return;
    await connectResidentSpectator();
  }

  async function sendJsonAction() {
    if (!residentName) return;
    await runAction(async () => {
      await api.submitAction(residentName, JSON.parse(jsonAction));
      await loadRoute();
    });
  }

  async function observeResident() {
    if (!residentName) return;
    await connectResidentSpectator();
  }

  async function startObserve(subject: ObservableSubjectSummary, mode: SpectatorMode = 'follow') {
    await observeSubject(subject.subject, mode);
  }

  async function observeSubject(subject: SpectatorSubject, mode: SpectatorMode = 'follow') {
    await runAction(async () => openObserveSubject(subject, mode));
  }

  async function openObserveSubject(subject: SpectatorSubject, mode: SpectatorMode = 'follow') {
    const session = await api.observe(subject, mode);
    upsertSession(session);
    activeSession = session;
    nav(`/observe/${subjectPath(subject)}`);
    openSessionStream(session);
  }

  async function connectResidentSpectator() {
    perceptionFeedLoadingResident = residentName;
    let openedSession: SpectatorSession | undefined;
    await runAction(async () => {
      await api.residentCommand(residentName, 'connect', { observe: false, control: false, onDisconnect: disconnectPolicy });
      openedSession = await openResidentSpectator();
    });
    if (actionError || !openedSession) perceptionFeedLoadingResident = '';
  }

  async function openResidentSpectator(): Promise<SpectatorSession | undefined> {
    if (!residentName) return undefined;
    const subject: SpectatorSubject = { kind: 'resident', name: residentName };
    const session = await api.observe(subject, 'follow');
    upsertSession(session);
    activeSession = session;
    openSessionStream(session);
    return session;
  }

  function residentIsOnline(): boolean {
    return selectedRuntime?.online === true;
  }

  async function ensureObserveRouteSession() {
    if (!route.startsWith('/observe/') || findObserveRouteSession(activeSession, sessions)) return;
    const subject = subjectFromObserveRoute();
    if (!subject) return;
    if (!subjectIsKnownOnline(subject)) return;
    const session = await api.observe(subject, 'follow');
    upsertSession(session);
    activeSession = session;
    openSessionStream(session);
  }

  function subjectFromObserveRoute(): SpectatorSubject | undefined {
    if (!observeKind || !observeId) return undefined;
    const id = decodeURIComponent(observeId);
    if (observeKind === 'resident') return { kind: 'resident', name: id };
    if (observeKind === 'player') return { kind: 'player', username: id };
    return undefined;
  }

  function findObserveRouteSession(active: SpectatorSession | undefined, available: SpectatorSession[]): SpectatorSession | undefined {
    const subject = subjectFromObserveRoute();
    if (!subject || !subjectIsKnownOnline(subject)) return undefined;
    return [active, ...available].find(session => session?.connected && subjectMatches(session.subject, subject.kind, subjectId(subject)));
  }

  function findResidentSession(active: SpectatorSession | undefined, available: SpectatorSession[], name: string): SpectatorSession | undefined {
    if (!name) return undefined;
    return [active, ...available].find(session => session?.subject.kind === 'resident' && session.subject.name.toLowerCase() === name.toLowerCase());
  }

  function subjectIsKnownOnline(subject: SpectatorSubject): boolean {
    return subjects.some(candidate => candidate.online && subjectMatches(candidate.subject, subject.kind, subjectId(subject)));
  }

  function subjectId(subject: SpectatorSubject): string {
    return subject.kind === 'resident' ? subject.name : subject.username;
  }

  function subjectMatches(subject: SpectatorSubject, kind: string, id: string): boolean {
    return subject.kind === kind && (subject.kind === 'resident' ? subject.name.toLowerCase() === id.toLowerCase() : subject.username.toLowerCase() === id.toLowerCase());
  }

  function subjectLabel(subject: SpectatorSubject): string {
    return subject.kind === 'resident' ? subject.name : subject.username;
  }

  function subjectPath(subject: SpectatorSubject): string {
    return subject.kind === 'resident' ? `resident/${encodeURIComponent(subject.name)}` : `player/${encodeURIComponent(subject.username)}`;
  }

  function withLiveResidentBody(runtime: RuntimeReadModel | undefined, session: SpectatorSession | undefined): RuntimeReadModel | undefined {
    if (!runtime || !session?.latestPerception) return runtime;
    const lastFeedAt = session.lastEventAt || runtime.body.lastFeedAt;
    const perceptionTick = numberField(session.latestPerception, 'tick') ?? runtime.body.perceptionTick;
    const position = session.position || livePositionFromPerception(session.latestPerception) || runtime.body.position;
    const perceptionAgeMs = ageMsFromTimestamp(lastFeedAt) ?? runtime.body.perceptionAgeMs;
    const body: RuntimeReadModel['body'] = {
      ...runtime.body,
      latestPerception: session.latestPerception,
      gatewayHealthy: runtime.body.gatewayHealthy ?? session.connected,
    };
    if (position) body.position = position;
    if (perceptionTick !== undefined) body.perceptionTick = perceptionTick;
    if (lastFeedAt) body.lastFeedAt = lastFeedAt;
    if (perceptionAgeMs !== undefined) body.perceptionAgeMs = perceptionAgeMs;
    return {
      ...runtime,
      body,
    };
  }

  function livePositionFromPerception(perception: unknown): Position | undefined {
    const root = asRecord(perception);
    return positionFromRecord(asRecord(root.resident).position) || positionFromRecord(root.position);
  }

  function positionFromRecord(value: unknown): Position | undefined {
    const record = asRecord(value);
    const x = numberField(record, 'x');
    const y = numberField(record, 'y');
    if (x === undefined || y === undefined) return undefined;
    return { x, y, level: numberField(record, 'level') ?? 0 };
  }

  function upsertSession(session: SpectatorSession) {
    sessions = [session, ...sessions.filter(candidate => candidate.id !== session.id)];
  }

  function syncObserveStream() {
    const session = findObserveRouteSession(activeSession, sessions);
    if (session) openSessionStream(session);
    else closeSessionStream();
  }

  function syncResidentStream() {
    const session = findResidentSession(activeSession, sessions, residentName);
    if (session) openSessionStream(session);
    else closeSessionStream();
  }

  function openSessionStream(session: SpectatorSession) {
    if (sessionStreamId === session.id && sessionStream) return;
    closeSessionStream();
    activeSession = session;
    sessionStreamId = session.id;
    sessionStream = api.streamSession(session.id);
    sessionStream.addEventListener('session', event => {
      const session = JSON.parse((event as MessageEvent).data) as SpectatorSession;
      activeSession = session;
      upsertSession(session);
    });
    sessionStream.onerror = () => {
      actionError = 'Spectator stream disconnected; polling will keep the last session visible.';
      closeSessionStream();
    };
  }

  function closeSessionStream() {
    sessionStream?.close();
    sessionStream = undefined;
    sessionStreamId = '';
  }

  function clampSpectatorZoom(value: number): number {
    if (!Number.isFinite(value)) return 1;
    const clamped = Math.min(spectatorZoomMax, Math.max(spectatorZoomMin, value));
    return Math.round(clamped * 100) / 100;
  }

  function openSpectatorModal() {
    spectatorModalOpen = true;
  }

  function closeSpectatorModal() {
    spectatorModalOpen = false;
  }

  async function runAction(fn: () => Promise<void>) {
    actionBusy = true;
    actionError = '';
    try {
      await fn();
    } catch (err) {
      actionError = err instanceof Error ? err.message : 'Action failed';
    } finally {
      actionBusy = false;
    }
  }

  function spectatorFrame(node: HTMLElement, params: { session: SpectatorSession | undefined; filters: SpectatorDisplayFilters }) {
    const bridge = new NullCitySpectatorBridge(node);
    bridge.setFilters(params.filters);
    bridge.setSession(params.session);
    return {
      update(next: { session: SpectatorSession | undefined; filters: SpectatorDisplayFilters }) {
        bridge.setFilters(next.filters);
        bridge.setSession(next.session);
      },
      destroy() {
        bridge.destroy();
      },
    };
  }

  type BodyModel = RuntimeReadModel['body'];
  type BodyRow = { key: string; label: string; value: unknown };

  const bodyFieldOrder = [
    'gatewayHealthy',
    'controlHeld',
    'controllerId',
    'position',
    'perceptionTick',
    'perceptionAgeMs',
    'lastFeedAt',
    'lastAction',
    'lastActionSource',
    'latestEvent',
    'latestPerception',
  ];

  function bodyRows(body: BodyModel | undefined): BodyRow[] {
    const record = asRecord(body);
    const known = bodyFieldOrder.filter(key => key in record);
    const extra = Object.keys(record).filter(key => !bodyFieldOrder.includes(key)).sort((a, b) => a.localeCompare(b));
    return [...known, ...extra].map(key => ({ key, label: labelize(key), value: record[key] }));
  }

  function labelize(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());
  }

  function bodyValue(key: string, value: unknown): string {
    if (value === undefined || value === null || value === '') return '-';
    if (key === 'gatewayHealthy') return value === true ? 'healthy' : 'offline';
    if (key === 'controlHeld') return value === true ? 'held' : 'free';
    if (key === 'position') return formatPosition(value);
    if (key === 'perceptionAgeMs') return formatDuration(Number(value));
    if (key === 'lastFeedAt') return `${timeAgo(String(value))} ago`;
    if (key === 'lastAction') return actionSummary(value);
    if (key === 'latestEvent') return eventSummary(value);
    if (key === 'latestPerception') return perceptionSummary(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number' || typeof value === 'string') return String(value);
    return inlineObject(value);
  }

  function formatPosition(value: unknown): string {
    const position = asRecord(value);
    const x = numberField(position, 'x');
    const y = numberField(position, 'y');
    const level = numberField(position, 'level') ?? 0;
    return x === undefined || y === undefined ? '-' : `${x}, ${y}, ${level}`;
  }

  function actionSummary(value: unknown): string {
    const action = asRecord(value);
    const parts = [
      stringField(action, 'kind'),
      stringField(action, 'source') ? `source ${stringField(action, 'source')}` : '',
      stringField(action, 'result') ? `result ${stringField(action, 'result')}` : '',
      numberField(action, 'tick') !== undefined ? `tick ${numberField(action, 'tick')}` : '',
      stringField(action, 'cause'),
    ].filter(Boolean);
    return parts.join(' | ') || inlineObject(value);
  }

  function eventSummary(value: unknown): string {
    const event = asRecord(value);
    const kind = stringField(event, 'kind') || 'event';
    const text = stringField(event, 'text') || stringField(event, 'message');
    return text ? `${kind}: ${text}` : inlineObject(value);
  }

  function perceptionSummary(value: unknown): string {
    const perception = asRecord(value);
    const nearby = asRecord(perception.nearby);
    const resident = asRecord(perception.resident);
    const parts = [
      numberField(perception, 'tick') !== undefined ? `tick ${numberField(perception, 'tick')}` : '',
      formatPosition(resident.position || perception.position) !== '-' ? `pos ${formatPosition(resident.position || perception.position)}` : '',
      `players ${arrayCount(nearby.players)}`,
      `npcs ${arrayCount(nearby.npcs)}`,
      `objects ${arrayCount(nearby.objects)}`,
      `items ${arrayCount(nearby.worldItems)}`,
      `actions ${arrayCount(perception.availableActions)}`,
      `events ${arrayCount(perception.events)}`,
    ].filter(Boolean);
    return parts.join(' | ') || inlineObject(value);
  }

  function formatDuration(value: number): string {
    if (!Number.isFinite(value)) return '-';
    const seconds = Math.max(0, Math.round(value / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.round(minutes / 60)}h`;
  }

  function ageMsFromTimestamp(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? Math.max(0, Date.now() - time) : undefined;
  }

  function inlineObject(value: unknown): string {
    if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
    const record = asRecord(value);
    const entries = Object.entries(record);
    if (!entries.length) return '-';
    return entries.map(([key, entry]) => `${labelize(key)} ${inlinePrimitive(entry)}`).join(' | ');
  }

  function inlinePrimitive(value: unknown): string {
    if (value === undefined || value === null || value === '') return '-';
    if (Array.isArray(value)) return `${value.length}`;
    if (typeof value === 'object') return '{...}';
    return String(value);
  }

  function arrayCount(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
  }

  function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  function stringField(value: unknown, key: string): string | undefined {
    const field = asRecord(value)[key];
    return typeof field === 'string' ? field : undefined;
  }

  function numberField(value: unknown, key: string): number | undefined {
    const field = asRecord(value)[key];
    const number = Number(field);
    return Number.isFinite(number) ? number : undefined;
  }

  function soulTitle(soul: SoulSummary): string {
    return soul.title || soul.id;
  }
</script>

<svelte:head>
  <title>Null City Resident Operations</title>
</svelte:head>

<nav class="topbar">
  <button class="brand" onclick={() => nav('/')}>Null City Ops</button>
  <div class="navlinks">
    <button class:active={route === '/'} onclick={() => nav('/')}>Overview</button>
    <button class:active={route.startsWith('/residents')} onclick={() => nav('/residents')}>Residents</button>
    <button class:active={route.startsWith('/observe')} onclick={() => nav('/observe')}>Observe</button>
    <button class:active={route === '/souls'} onclick={() => nav('/souls')}>Souls</button>
    <button class:active={route === '/logs'} onclick={() => nav('/logs')}>Logs</button>
  </div>
</nav>

<main>
  <div class="shard-line" aria-hidden="true">
    <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
  </div>

  {#if error || actionError}
    <div class="notice rose">{error || actionError}</div>
  {/if}
  {#if loading}
    <div class="notice">Loading dashboard state</div>
  {/if}

  {#if route === '/'}
    <section class="page-head">
      <p class="kicker">Resident Operations</p>
      <h1>Dashboard</h1>
    </section>
    <section class="metrics">
      <div class="metric"><span>Gateway</span><strong class:ok={overview?.gateway.connected}>{overview?.gateway.connected ? 'connected' : 'offline'}</strong></div>
      <div class="metric"><span>Controller</span><strong class:ok={overview?.controller.available}>{overview?.controller.available ? 'available' : 'quiet'}</strong></div>
      <div class="metric"><span>Online</span><strong>{overview?.residents.filter(r => r.online).length || 0}</strong></div>
      <div class="metric"><span>Runtime</span><strong>{overview?.controller.residentsWithRuntime || 0}</strong></div>
    </section>
    {@render ResidentTable({ rows: visibleResidents, canDelete: canDeleteResidents, onselect: nav, ondelete: deleteResidentByName })}
    <section class="panel">
      <div class="panel-title">Recent Events</div>
      {@render EventList({ events: overview?.recentEvents || [] })}
    </section>
  {:else if route === '/residents'}
    <section class="toolbar">
      <div>
        <p class="kicker">Resident Roster</p>
        <h1>Residents</h1>
      </div>
      <div class="actions">
        <select bind:value={filter} onchange={() => loadRoute()}>
          <option value="all">all</option>
          <option value="online">online</option>
          <option value="offline">offline</option>
        </select>
        <button class="primary" onclick={() => nav('/residents/new')}>Spawn Resident</button>
      </div>
    </section>
    {@render ResidentTable({ rows: visibleResidents, canDelete: canDeleteResidents, onselect: nav, ondelete: deleteResidentByName })}
  {:else if route === '/residents/new'}
    <section class="page-head compact">
      <p class="kicker">Lifecycle</p>
      <h1>Spawn Resident</h1>
    </section>
    <section class="form-grid spawn-form">
      <div class="spawn-name-field">
        <label>Resident name <input bind:value={newName} placeholder="resident_name" /></label>
        <button class="icon-button" disabled={actionBusy} aria-label="Randomize name" title="Randomize name" onclick={randomizeSpawnName}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
        </button>
      </div>
      <div class="spawn-model-card" aria-live="polite">
        <span>M:</span>
        <div class="model-code-fields">
          <label>H<input type="number" min="0" step="1" bind:value={newAppearance.head} /></label>
          <label>T<input type="number" min="0" step="1" bind:value={newAppearance.torso} /></label>
          <label>L<input type="number" min="0" step="1" bind:value={newAppearance.legs} /></label>
          <label>F<input type="number" min="0" step="1" bind:value={newAppearance.feet} /></label>
        </div>
      </div>
      <button class="icon-button" disabled={actionBusy} aria-label="Randomize model" title="Randomize model" onclick={randomizeSpawnModel}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
      </button>
      <label>X <input bind:value={spawnX} inputmode="numeric" placeholder={defaultSpawnX} /></label>
      <label>Y <input bind:value={spawnY} inputmode="numeric" placeholder={defaultSpawnY} /></label>
      <label>Level <input bind:value={spawnLevel} inputmode="numeric" placeholder={defaultSpawnLevel} /></label>
      <label>Disconnect policy <select bind:value={disconnectPolicy}><option value="idle">idle</option><option value="logout">logout</option></select></label>
      <button class="primary" disabled={actionBusy} onclick={createResident}>Create</button>
    </section>
    {@render SoulGrid({ souls })}
  {:else if residentName}
    <section class="toolbar">
      <div>
        <p class="kicker">Resident Detail</p>
        <h1>{residentDisplayName(residentName)}</h1>
      </div>
      <div class="actions">
        {#if residentIsOnline()}
          <button disabled={actionBusy} onclick={observeResident}>Spectate</button>
          <button disabled={actionBusy} onclick={() => commandResident('connect')}>Control</button>
          <button disabled={actionBusy} onclick={() => commandResident('detach')}>Detach</button>
          <button disabled={actionBusy} class="danger" onclick={pauseResident}>Pause + Logout</button>
          <button disabled={actionBusy} class="danger" onclick={logoutResident}>Logout</button>
        {:else}
          <button disabled={actionBusy} class="primary" onclick={loginResident}>Login</button>
          {#if canDeleteResidents}
            <button disabled={actionBusy} class="danger" onclick={deleteResident}>Delete</button>
          {/if}
        {/if}
      </div>
    </section>
    {@render ActivityPanel({ activity: buildActivitySnapshot(liveSelectedRuntime, activeResidentSession) })}
    <section class="split">
      <div class="panel observer-pane">
        <div class="panel-title">Spectator</div>
        {@render SpectatorSurface({ large: false })}
        {@render SpectatorControls()}
      </div>
      <div class="panel">
        <div class="panel-title">Body</div>
        {@render BodyTable({ body: liveSelectedRuntime?.body })}
      </div>
    </section>
    <section class="modules">
      {@render ModulePanel({ title: 'Thinking', data: selectedRuntime?.thinking })}
      {@render ModulePanel({ title: 'Nervous System', data: selectedRuntime?.nervous })}
      {@render ModulePanel({ title: 'Shared State', data: selectedRuntime?.state })}
    </section>
    <section class="panel">
      <div class="panel-title">Manual Action</div>
      <textarea bind:value={jsonAction}></textarea>
      <button class="primary" disabled={actionBusy || !residentIsOnline()} onclick={sendJsonAction}>Submit Action</button>
    </section>
    <section class="modules">
      {@render LogPanel({ title: 'Actions', rows: selectedRuntime?.logs.actions || [] })}
      {@render LogPanel({ title: 'Thinking Inference', rows: selectedRuntime?.logs.inference || [] })}
    </section>
  {:else if route === '/observe'}
    <section class="page-head compact">
      <p class="kicker">Read Only</p>
      <h1>Observe</h1>
    </section>
    <section class="subject-grid">
      {#each subjects as subject}
        <article class="card">
          <div class="row">
            <strong>{subjectLabel(subject.subject)}</strong>
            <span class:ok={subject.online} class="tag">{subject.online ? 'online' : 'offline'}</span>
          </div>
          <p>{subject.position ? formatPosition(subject.position) : 'position unknown'}</p>
          <div class="actions">
            <button disabled={actionBusy || !subject.online} onclick={() => startObserve(subject, 'follow')}>Follow</button>
            <button disabled={actionBusy || !subject.online} onclick={() => startObserve(subject, 'free-camera')}>Free Camera</button>
          </div>
        </article>
      {:else}
        <div class="empty">No observable subjects reported</div>
      {/each}
    </section>
  {:else if route.startsWith('/observe/')}
    {@const session = activeObserveSession}
    <section class="toolbar">
      <div>
        <p class="kicker">Spectator Session</p>
        <h1>{session ? subjectLabel(session.subject) : 'Subject unavailable'}</h1>
      </div>
      <button onclick={() => nav('/observe')}>Subjects</button>
    </section>
    {#if session?.subject.kind === 'resident'}
      {@render ActivityPanel({ activity: buildActivitySnapshot(withLiveResidentBody(selectedRuntime, session), session) })}
    {/if}
    <section class="split wide">
      <div class="panel observer-pane large">
        <div class="panel-title">Spectator</div>
        <div class="observer-surface large">
          <div class="spectator-frame" use:spectatorFrame={{ session, filters: spectatorFilters }} aria-label="spectator"></div>
        </div>
        {@render SpectatorControls()}
      </div>
      <div class="panel">
        <div class="panel-title">Perception</div>
        <div class="mini-grid observer-summary">
          <span>{perceptionSummary(session?.latestPerception)}</span>
        </div>
        <pre>{compactJson(session?.latestPerception)}</pre>
      </div>
    </section>
  {:else if route === '/souls'}
    <section class="page-head compact">
      <p class="kicker">Read Only</p>
      <h1>Souls</h1>
    </section>
    {@render SoulGrid({ souls })}
  {:else if route === '/logs'}
    <section class="page-head compact">
      <p class="kicker">Timeline</p>
      <h1>Logs</h1>
    </section>
    <section class="modules">
      {@render LogPanel({ title: 'Actions', rows: logs.actions })}
      {@render LogPanel({ title: 'Thinking Inference', rows: logs.inference })}
    </section>
  {/if}
</main>

{#if spectatorModalOpen}
  <div class="modal-backdrop">
    <div class="spectator-modal" role="dialog" aria-modal="true" aria-label="Expanded spectator">
      <div class="spectator-modal-head">
        <div class="panel-title">Spectator</div>
        <button class="icon-button" aria-label="Close expanded spectator" title="Close expanded spectator" onclick={closeSpectatorModal}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      {@render SpectatorSurface({ large: true })}
      {@render SpectatorControls()}
    </div>
  </div>
{/if}

{#snippet SpectatorSurface({ large }: { large: boolean })}
  <div class="observer-surface" class:large>
    <div class="spectator-frame" use:spectatorFrame={{ session: activeResidentSession, filters: spectatorFilters }} aria-label="resident spectator"></div>
    <div class="spectator-tools" aria-label="spectator view tools">
      {#if !large}
        <button class="icon-button" aria-label="Open larger spectator" title="Open larger spectator" onclick={openSpectatorModal}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
        </button>
      {/if}
      <button class="icon-button" aria-label="Zoom out spectator" title="Zoom out" disabled={spectatorZoom <= spectatorZoomMin} onclick={() => (spectatorZoom = clampSpectatorZoom(spectatorZoom - spectatorZoomStep))}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>
      </button>
      <span class="zoom-readout">{Math.round(spectatorZoom * 100)}%</span>
      <button class="icon-button" aria-label="Zoom in spectator" title="Zoom in" disabled={spectatorZoom >= spectatorZoomMax} onclick={() => (spectatorZoom = clampSpectatorZoom(spectatorZoom + spectatorZoomStep))}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
      </button>
      {#if perceptionFeedLoading}
        <span class="feed-loading" aria-label="Loading perception feed">
          <span></span><span></span><span></span>
        </span>
      {:else if !residentIsOnline()}
        <button disabled={actionBusy} class="tool-action" onclick={loginResident}>Login Resident</button>
      {:else if !activeResidentSession}
        <button disabled={actionBusy} class="tool-action" onclick={observeResident}>Start Spectator</button>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet SpectatorControls()}
  <div class="spectator-controls" aria-label="spectator display toggles">
    <label><input type="checkbox" bind:checked={showSpectatorPlayers} /> Players</label>
    <label><input type="checkbox" bind:checked={showSpectatorNpcs} /> NPCs</label>
    <label><input type="checkbox" bind:checked={showSpectatorObjects} /> Objects</label>
    <label><input type="checkbox" bind:checked={showSpectatorItems} /> Items</label>
  </div>
{/snippet}

{#snippet ResidentTable({ rows, canDelete, onselect, ondelete }: { rows: ResidentDashboardRow[]; canDelete: boolean; onselect: (path: string) => void; ondelete: (name: string) => Promise<void> })}
  <section class="table-wrap">
    <table>
      <thead><tr><th>Resident</th><th>Status</th><th>Thinking</th><th>Attention</th><th>Body</th><th>Last Action</th><th>Actions</th></tr></thead>
      <tbody>
        {#each rows as row}
          <tr onclick={() => onselect(`/residents/${encodeURIComponent(row.name)}`)}>
            <td><strong>{residentDisplayName(row.name)}</strong><small>{row.controllerId || 'uncontrolled'}</small></td>
            <td><span class:ok={row.online} class="dot"></span>{row.online ? 'online' : 'offline'}</td>
            <td>{row.thinking?.mode || 'unknown'}</td>
            <td class="num">{row.attention ?? '-'}</td>
            <td>{row.body?.controlHeld ? 'control held' : 'free'}</td>
            <td>{row.body?.lastAction?.kind || row.lastEvent?.kind || '-'}</td>
            <td>
              {#if canDelete}
                <button
                  class="danger table-action"
                  disabled={actionBusy}
                  onclick={(event) => {
                    event.stopPropagation();
                    void ondelete(row.name);
                  }}
                >
                  Delete
                </button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr><td colspan="7" class="empty">No residents reported</td></tr>
        {/each}
      </tbody>
    </table>
  </section>
{/snippet}

{#snippet KeyValue({ data }: { data: unknown })}
  <pre>{compactJson(data)}</pre>
{/snippet}

{#snippet BodyTable({ body }: { body: BodyModel | undefined })}
  <table class="dense-table body-table">
    <tbody>
      {#each bodyRows(body) as row}
        <tr>
          <th>{row.label}</th>
          <td>{bodyValue(row.key, row.value)}</td>
        </tr>
      {:else}
        <tr><td class="empty" colspan="2">No body state reported</td></tr>
      {/each}
    </tbody>
  </table>
{/snippet}

{#snippet ModulePanel({ title, data }: { title: string; data: unknown })}
  <section class="panel">
    <div class="panel-title">{title}</div>
    <pre>{compactJson(data)}</pre>
  </section>
{/snippet}

{#snippet LogPanel({ title, rows }: { title: string; rows: unknown[] })}
  <section class="panel">
    <div class="panel-title">{title}</div>
    <div class="log-list">
      {#each rows.slice(-30).reverse() as row}
        <pre>{compactJson(row)}</pre>
      {:else}
        <div class="empty">No log entries</div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet EventList({ events }: { events: Array<{ kind?: string; at?: string; text?: string }> })}
  <div class="event-list">
    {#each events.slice(-12).reverse() as event}
      <div class="event-row"><span class="tag">{event.kind || 'event'}</span><span>{event.text || timeAgo(event.at)}</span></div>
    {:else}
      <div class="empty">No recent events</div>
    {/each}
  </div>
{/snippet}

{#snippet SoulGrid({ souls }: { souls: SoulSummary[] })}
  <section class="subject-grid">
    {#each souls as soul}
      <article class="card">
        <div class="row"><strong>{soulTitle(soul)}</strong><span class="tag">{soul.id}</span></div>
        <p>{soul.file}</p>
        <div class="mini-grid">
          <span>hooks {soul.hooks?.length || 0}</span>
          <span>rules {soul.nervousRules?.length || 0}</span>
          <span>{soul.legacyKind || 'legacy unset'}</span>
        </div>
      </article>
    {:else}
      <div class="empty">No soul files found</div>
    {/each}
  </section>
{/snippet}

{#snippet ActivityPanel({ activity }: { activity: ReturnType<typeof buildActivitySnapshot> })}
  <section class:stale={activity.stale} class="panel activity-panel">
    <div class="row activity-head">
      <div>
        <div class="panel-title">Resident Activity</div>
        <strong>{activity.statusText}</strong>
      </div>
      <span class:ok={activity.onlineLabel === 'online'} class="tag">{activity.onlineLabel}</span>
    </div>
    <div class="activity-grid">
      <div><span>Position</span><strong>{activity.positionLabel}</strong></div>
      <div><span>Last Action</span><strong>{activity.actionLabel}</strong><small>{activity.actionAgeLabel}</small></div>
      <div><span>Last Thought</span><strong>{activity.inferenceLabel}</strong><small>{activity.inferenceAgeLabel}</small></div>
      <div><span>Current Move</span><strong>{activity.moveLabel}</strong><small>{activity.moveDetail}</small></div>
      <div><span>Goal</span><strong>{activity.goalLabel}</strong></div>
      <div><span>SPARK Module</span><strong>{activity.moduleLabel}</strong><small>{activity.moduleDetail}</small></div>
    </div>
    <div class="activity-detail">{activity.actionDetail}</div>
  </section>
{/snippet}
