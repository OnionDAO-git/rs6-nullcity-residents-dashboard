<script lang="ts">
  import { onMount } from 'svelte';
  import type { BenchmarkArtifact, BenchmarkArtifactSummary, BenchmarkLeaderboardRow, DashboardOverview, EventReadinessSummary, GatewayStatus, ObservableSubjectSummary, PatronActivitySummary, PatronDashboardSummary, PatronStandingSummary, Position, ReadinessCheckSummary, ReadinessLevel, RecentLetterSummary, RelationshipActivitySummary, ResidentAppearance, ResidentDashboardRow, ResidentRelationshipSummary, RuntimeReadModel, SoulSummary, SpectatorMode, SpectatorSession, SpectatorSubject } from '@nullcity-dashboard/shared';
  import { NullCitySpectatorBridge, type SpectatorDisplayFilters } from '@nullcity-dashboard/observer';
  import { api, routeTo } from './lib/api';
  import { buildActivitySnapshot } from './lib/activity';
  import { benchmarkActionRows } from './lib/benchmarks';
  import { compactJson, timeAgo } from './lib/format';
  import ModelViewer from './lib/rs6/ModelViewer.svelte';

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
  let benchmarkRuns: BenchmarkArtifactSummary[] = [];
  let selectedBenchmark: BenchmarkArtifact | undefined;
  let benchmarkLeaderboard: BenchmarkLeaderboardRow[] = [];
  let visibleResidents: ResidentDashboardRow[] = [];
  let activeSession: SpectatorSession | undefined;
  let activeObserveSession: SpectatorSession | undefined;
  let activeResidentSession: SpectatorSession | undefined;
  let liveSelectedRuntime: RuntimeReadModel | undefined;
  let sessionStream: EventSource | undefined;
  let sessionStreamId = '';
  let runtimeStream: EventSource | undefined;
  let runtimeStreamResident = '';
  let showSpectatorPlayers = true;
  let showSpectatorNpcs = true;
  let showSpectatorObjects = false;
  let showSpectatorItems = true;
  let spectatorZoom = 1;
  let spectatorModalOpen = false;
  let perceptionFeedLoadingResident = '';
  let sparkActivityTab: 'activity' | 'stats' = 'activity';
  let statsModelBytes: ArrayBuffer | null = null;
  let statsModelStatus = '';
  let statsModelKey = '';

  const defaultSpawnX = '3225';
  const defaultSpawnY = '3217';
  const defaultSpawnLevel = '0';
  const defaultInferenceEndpoint = 'default';
  const defaultInferenceTemperature = '0.6';
  const spawnInferenceStorageKey = 'nullcity.spawnInference';
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
  let selectedSoulFile = '';
  let inferenceEndpoint = defaultInferenceEndpoint;
  let inferenceModel = '';
  let inferenceTemperature = defaultInferenceTemperature;
  let autonomousSpawn = true;
  let spawnInferenceDefaultsLoaded = false;
  let spawnDraftRoute = '';
  let disconnectPolicy = 'idle';

  const basePartMap = [8, 11, 4, 6, 9, 7, 10] as const;
  const defaultIdkIdsByGender = {
    M: [0, 10, 18, 26, 33, 36, 42],
    F: [45, -1, 56, 61, 67, 70, 79],
  } as const;
  const skillOrder = ['attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving', 'slayer', 'farming', 'runecrafting', 'construction'];

  $: parts = route.split('/').filter(Boolean);
  $: residentName = parts[0] === 'residents' && parts[1] && parts[1] !== 'new' ? decodeURIComponent(parts[1]) : '';
  $: benchmarkRunId = parts[0] === 'benchmarks' && parts[1] ? decodeURIComponent(parts[1]) : '';
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
  $: statsAppearance = buildResidentAppearance(liveSelectedRuntime);
  $: currentStatsModelKey = statsAppearance ? JSON.stringify(statsAppearance) : '';
  $: if (sparkActivityTab === 'stats' && currentStatsModelKey && currentStatsModelKey !== statsModelKey) {
    void loadStatsModel(statsAppearance, currentStatsModelKey);
  }
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
      closeRuntimeStream();
      closeSessionStream();
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
        openRuntimeStream(residentName);
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
      else if (route === '/benchmarks') [benchmarkRuns, benchmarkLeaderboard] = await Promise.all([api.benchmarks(), api.benchmarkLeaderboard()]);
      else if (benchmarkRunId) [selectedBenchmark, benchmarkRuns, benchmarkLeaderboard] = await Promise.all([api.benchmark(benchmarkRunId), api.benchmarks(), api.benchmarkLeaderboard()]);
      if (!residentName) {
        closeRuntimeStream();
      }
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
    if (spawnInferenceDefaultsLoaded) return;
    const saved = loadSpawnInferenceDefaults();
    if (!inferenceEndpoint.trim()) inferenceEndpoint = saved.endpoint || defaultInferenceEndpoint;
    if (!inferenceModel.trim()) inferenceModel = saved.model || '';
    if (!inferenceTemperature.trim()) inferenceTemperature = saved.temperature || defaultInferenceTemperature;
    autonomousSpawn = saved.autonomous ?? true;
    spawnInferenceDefaultsLoaded = true;
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
      const temperature = Number(inferenceTemperature);
      body.soul = {
        autonomous: autonomousSpawn,
        ...(selectedSoulFile ? { sourceSoulFile: selectedSoulFile } : {}),
        ...(inferenceEndpoint.trim() ? { endpoint: inferenceEndpoint.trim() } : {}),
        ...(inferenceModel.trim() ? { model: inferenceModel.trim() } : {}),
        ...(Number.isFinite(temperature) ? { temperature } : {}),
      };
      saveSpawnInferenceDefaults();
      await api.createResident(body);
      await api.residentCommand(name, 'connect', { observe: true, control: false, onDisconnect: disconnectPolicy });
      nav(`/residents/${encodeURIComponent(name)}`);
    });
  }

  function loadSpawnInferenceDefaults(): { endpoint?: string; model?: string; temperature?: string; autonomous?: boolean } {
    try {
      return JSON.parse(window.localStorage.getItem(spawnInferenceStorageKey) || '{}');
    } catch {
      return {};
    }
  }

  function saveSpawnInferenceDefaults() {
    window.localStorage.setItem(
      spawnInferenceStorageKey,
      JSON.stringify({
        endpoint: inferenceEndpoint.trim() || defaultInferenceEndpoint,
        model: inferenceModel.trim(),
        temperature: inferenceTemperature.trim() || defaultInferenceTemperature,
        autonomous: autonomousSpawn,
      }),
    );
  }

  async function logoutResident() {
    if (!residentName) return;
    await runAction(async () => {
      await api.residentCommand(residentName, 'pause', { cause: 'dashboard_logout' });
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
    const displayName = residentDisplayName(name);
    const residentId = name.trim().toLowerCase();
    const typed = window.prompt(`Delete ${displayName}? Type "${displayName}" to confirm.`);
    if (typed === null) return false;
    const normalized = typed.trim().toLowerCase();
    const confirmed = normalized === displayName || normalized === residentId;
    if (!confirmed) actionError = `Delete cancelled: typed "${typed.trim()}", expected "${displayName}".`;
    return confirmed;
  }

  async function loginResident() {
    if (!residentName) return;
    await connectResidentSpectator();
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
    const sessionTime = timestampMs(session.lastEventAt);
    const runtimeTime = timestampMs(runtime.body.lastFeedAt);
    if (runtime.body.latestPerception && sessionTime !== undefined && runtimeTime !== undefined && sessionTime < runtimeTime) return runtime;
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

  function openRuntimeStream(name: string) {
    if (runtimeStreamResident.toLowerCase() === name.toLowerCase() && runtimeStream) return;
    closeRuntimeStream();
    runtimeStreamResident = name;
    runtimeStream = api.streamRuntime(name);
    runtimeStream.addEventListener('runtime', event => {
      if (runtimeStreamResident.toLowerCase() !== residentName.toLowerCase()) return;
      selectedRuntime = JSON.parse((event as MessageEvent).data) as RuntimeReadModel;
    });
    runtimeStream.onerror = () => {
      closeRuntimeStream();
    };
  }

  function closeRuntimeStream() {
    runtimeStream?.close();
    runtimeStream = undefined;
    runtimeStreamResident = '';
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
  type SparkActivityItem = { label: string; value: string; detail: string | undefined };

  const bodyFieldOrder = [
    'feed',
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
    if (key === 'feed') return feedSummary(value);
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

  function feedSummary(value: unknown): string {
    const feed = asRecord(value);
    const nearby = asRecord(feed.nearby);
    const parts = [
      numberField(feed, 'tick') !== undefined ? `tick ${numberField(feed, 'tick')}` : '',
      numberField(feed, 'ageMs') !== undefined ? `${formatDuration(Number(feed.ageMs))} ago` : '',
      formatPosition(feed.position) !== '-' ? `pos ${formatPosition(feed.position)}` : '',
      asRecord(feed.hp).current !== undefined ? `hp ${asRecord(feed.hp).current}/${asRecord(feed.hp).max}` : '',
      `players ${numberField(nearby, 'players') ?? 0}`,
      `npcs ${numberField(nearby, 'npcs') ?? 0}`,
      `objects ${numberField(nearby, 'objects') ?? 0}`,
      `items ${numberField(nearby, 'worldItems') ?? 0}`,
      `actions ${numberField(feed, 'availableActions') ?? 0}`,
      `events ${numberField(feed, 'events') ?? 0}`,
    ].filter(Boolean);
    return parts.join(' | ') || '-';
  }

  function residentFeedLabel(row: ResidentDashboardRow): string {
    if (!row.feed) return row.online ? 'awaiting feed' : '-';
    const parts = [
      row.feed.tick !== undefined ? `tick ${row.feed.tick}` : '',
      row.feed.ageMs !== undefined ? `${formatDuration(row.feed.ageMs)} ago` : '',
      row.feed.attached ? 'attached' : '',
    ].filter(Boolean);
    return parts.join(' | ') || '-';
  }

  function residentStoryArcLabel(row: ResidentDashboardRow): string {
    return row.storyArc ? `arc: ${row.storyArc.phase}` : '-';
  }

  function residentStoryArcDetail(row: ResidentDashboardRow): string {
    const arc = row.storyArc;
    if (!arc) return '';
    const evidence = arc.evidence;
    const latest =
      arc.latestEventKind && arc.latestEventTick !== undefined
        ? `${arc.latestEventKind} @ ${arc.latestEventTick}`
        : arc.latestEventKind || '';
    const counts = evidence
      ? [
          evidence.fundingEvents > 0 ? `${evidence.fundingEvents} funded` : '',
          evidence.progressEvents > 0 ? `${evidence.progressEvents} progress` : '',
          evidence.resolutionEvents > 0 ? `${evidence.resolutionEvents} resolved` : '',
          evidence.letterEvents > 0 ? `${evidence.letterEvents} letters` : '',
        ].filter(Boolean).join(' | ')
      : '';
    return [latest, counts].filter(Boolean).join(' | ') || arc.summary || '';
  }

  function residentSurroundingsLabel(row: ResidentDashboardRow): string {
    const nearby = row.feed?.nearby;
    if (!nearby) return '-';
    return `p ${nearby.players} | n ${nearby.npcs} | o ${nearby.objects} | i ${nearby.worldItems}`;
  }

  function residentVitalsLabel(row: ResidentDashboardRow): string {
    const hp = row.hp;
    const flags = [row.inCombat ? 'combat' : '', row.busy ? 'busy' : ''].filter(Boolean);
    const hpLabel = hp ? `hp ${hp.current}/${hp.max}` : '';
    return [hpLabel, ...flags].filter(Boolean).join(' | ') || '-';
  }

  function thinkingActivity(runtime: RuntimeReadModel | undefined, activity: ReturnType<typeof buildActivitySnapshot>): SparkActivityItem[] {
    const state = asRecord(runtime?.state);
    const cognition = asRecord(state.cognition);
    const goal = asRecord(cognition.activeGoal);
    const inference = runtime?.thinking.latestInference;
    return [
      { label: 'Controller', value: runtime?.state ? 'runtime active' : runtime?.online ? 'waiting for runtime' : 'offline', detail: runtime?.state ? undefined : 'controller has not written runtime-state yet' },
      { label: 'Mode', value: runtime?.thinking.mode || 'unknown', detail: runtime?.thinking.lastInferenceCause || undefined },
      { label: 'Thought', value: activity.inferenceLabel, detail: activity.inferenceAgeLabel },
      { label: 'Goal', value: stringField(goal, 'description') || activity.goalLabel, detail: goalDetail(goal) },
      { label: 'Move Intent', value: activity.moveLabel, detail: activity.moveDetail },
      { label: 'Resources', value: activity.attentionLabel, detail: budgetLabel(runtime) },
      { label: 'SPARK Module', value: activity.moduleLabel, detail: activity.moduleDetail },
      { label: 'Inference', value: inferenceStatus(inference), detail: inferenceProvider(inference) },
      { label: 'Previous Intent', value: previousIntentLabel(runtime), detail: previousIntentDetail(runtime) },
    ];
  }

  function nervousActivity(runtime: RuntimeReadModel | undefined): SparkActivityItem[] {
    const nervous = runtime?.nervous;
    return [
      { label: 'Rules', value: nervous?.activeRules === undefined ? '-' : `${nervous.activeRules} active`, detail: cooldownLabel(nervous?.cooldowns) },
      { label: 'Last Reaction', value: nervous?.lastReaction || 'none', detail: nervous?.lastRuleId ? `rule ${nervous.lastRuleId}` : undefined },
      { label: 'Thinking Gate', value: nervous?.lastSuppressedThinking ? 'suppressed' : 'open', detail: nervous?.lastInterruptedThinking ? 'interrupted thinking' : undefined },
      { label: 'Low-Level State', value: hookStateLabel(runtime), detail: shadowedHooksLabel(runtime) },
    ];
  }

  function bodyActivity(runtime: RuntimeReadModel | undefined, activity: ReturnType<typeof buildActivitySnapshot>): SparkActivityItem[] {
    const perception = asRecord(runtime?.body.latestPerception);
    const resident = asRecord(perception.resident);
    const activeTrade = asRecord(resident.activeTrade);
    return [
      { label: 'Feed', value: activity.feedLabel, detail: runtime?.body.gatewayHealthy ? 'gateway healthy' : undefined },
      { label: 'Position', value: activity.positionLabel, detail: residentBusyLabel(runtime) },
      { label: 'Vitals', value: vitalsFromRuntime(runtime), detail: activeTrade.partner ? 'trade active' : undefined },
      { label: 'Last Action', value: activity.actionLabel, detail: activity.actionDetail },
      { label: 'Last Result', value: activity.actionResultLabel, detail: activity.actionResultDetail },
      { label: 'Progress', value: activity.progressLabel, detail: activity.progressDetail },
      { label: 'Nearby', value: activity.surroundingsLabel, detail: actionCountLabel(runtime) },
      { label: 'Inventory', value: inventoryLabel(runtime), detail: equipmentLabel(runtime) },
      { label: 'Event', value: activity.eventLabel, detail: runtime?.body.lastFeedAt ? `feed ${timeAgo(runtime.body.lastFeedAt)} ago` : undefined },
    ];
  }

  function goalDetail(goal: Record<string, unknown>): string {
    const steps = Array.isArray(goal.steps) ? goal.steps.length : 0;
    const success = stringField(goal, 'success');
    const ttl = numberField(goal, 'ttlTicks');
    return [steps ? `${steps} steps` : '', success, ttl !== undefined ? `ttl ${ttl}` : ''].filter(Boolean).join(' | ') || '-';
  }

  function budgetLabel(runtime: RuntimeReadModel | undefined): string {
    const budgets = runtime?.state?.budgets;
    if (!budgets) return '-';
    const parts = [
      `${budgets.requestsThisMinute}/m`,
      `${budgets.requestsToday}/d`,
      budgets.requestsThisTick !== undefined ? `${budgets.requestsThisTick}/tick` : '',
      budgets.noInferenceUntil ? `blocked until ${timeAgo(budgets.noInferenceUntil)}` : '',
    ].filter(Boolean);
    return parts.join(' | ');
  }

  function inferenceStatus(inference: unknown): string {
    const record = asRecord(inference);
    return stringField(record, 'status') || stringField(record, 'cause') || '-';
  }

  function inferenceProvider(inference: unknown): string {
    const record = asRecord(inference);
    const parts = [
      stringField(record, 'provider'),
      stringField(record, 'model'),
      stringField(record, 'endpoint'),
      numberField(record, 'latencyMs') !== undefined ? `${numberField(record, 'latencyMs')}ms` : '',
    ].filter(Boolean);
    return parts.join(' | ') || '-';
  }

  function previousIntentLabel(runtime: RuntimeReadModel | undefined): string {
    const intent = asRecord(runtime?.thinking.previousIntent || runtime?.state?.previousIntent);
    return stringField(intent, 'goal') || stringField(intent, 'description') || stringField(intent, 'kind') || (Object.keys(intent).length ? 'recorded' : '-');
  }

  function previousIntentDetail(runtime: RuntimeReadModel | undefined): string {
    const intent = asRecord(runtime?.thinking.previousIntent || runtime?.state?.previousIntent);
    return Object.keys(intent).length ? inlineObject(intent) : '-';
  }

  function cooldownLabel(cooldowns: Record<string, number> | undefined): string {
    const entries = Object.entries(cooldowns || {});
    if (!entries.length) return 'no cooldowns';
    return entries.slice(0, 3).map(([key, value]) => `${key.replace(/^nervous:/, '')} ${value}`).join(' | ');
  }

  function hookStateLabel(runtime: RuntimeReadModel | undefined): string {
    const state = runtime?.state;
    const variables = Object.keys(state?.variables || {}).length;
    const cooldowns = Object.keys(state?.hookCooldowns || {}).length;
    return `${variables} vars | ${cooldowns} cooldowns`;
  }

  function shadowedHooksLabel(runtime: RuntimeReadModel | undefined): string {
    const count = runtime?.state?.shadowedHooks?.length || 0;
    return count ? `${count} shadowed hooks` : '-';
  }

  function residentBusyLabel(runtime: RuntimeReadModel | undefined): string {
    const perception = asRecord(runtime?.body.latestPerception);
    const resident = asRecord(perception.resident);
    return [
      booleanField(resident, 'busy') ? 'busy' : '',
      booleanField(resident, 'inCombat') ? 'in combat' : '',
    ].filter(Boolean).join(' | ') || '-';
  }

  function vitalsFromRuntime(runtime: RuntimeReadModel | undefined): string {
    const feed = runtime?.body.feed;
    if (!feed?.hp) return '-';
    return `hp ${feed.hp.current}/${feed.hp.max}`;
  }

  function actionCountLabel(runtime: RuntimeReadModel | undefined): string {
    const feed = runtime?.body.feed;
    return feed ? `${feed.availableActions} available actions` : '-';
  }

  function inventoryLabel(runtime: RuntimeReadModel | undefined): string {
    const resident = asRecord(asRecord(runtime?.body.latestPerception).resident);
    const inventory = Array.isArray(resident.inventory) ? resident.inventory : [];
    const occupied = inventory.filter(Boolean).length;
    return inventory.length ? `${occupied}/${inventory.length} slots` : '-';
  }

  function equipmentLabel(runtime: RuntimeReadModel | undefined): string {
    const resident = asRecord(asRecord(runtime?.body.latestPerception).resident);
    const equipment = Array.isArray(resident.equipment) ? resident.equipment : [];
    const occupied = equipment.filter(Boolean).length;
    return equipment.length ? `${occupied} equipped` : '-';
  }

  type ItemRef = { itemId: number; key?: string; amount?: number; noted?: boolean };
  type SkillRow = { key: string; label: string; level: number; xp: number };
  type ItemSlot = { slot: number; item: ItemRef | null };
  type ResidentModelAppearance = { gender: 'M' | 'F'; parts: number[]; colors: number[] };

  function residentRecord(runtime: RuntimeReadModel | undefined): Record<string, unknown> {
    return asRecord(asRecord(runtime?.body.latestPerception).resident);
  }

  function savedRecord(runtime: RuntimeReadModel | undefined): Record<string, unknown> {
    return asRecord(runtime?.body.saved);
  }

  function residentArray(runtime: RuntimeReadModel | undefined, key: 'inventory' | 'equipment'): unknown[] {
    const live = residentRecord(runtime)[key];
    if (Array.isArray(live)) return live;
    const saved = savedRecord(runtime)[key];
    return Array.isArray(saved) ? saved : [];
  }

  function skillRows(runtime: RuntimeReadModel | undefined): SkillRow[] {
    const liveSkills = asRecord(residentRecord(runtime).skills);
    const savedSkills = asRecord(savedRecord(runtime).skills);
    const skills = Object.keys(liveSkills).length ? liveSkills : savedSkills;
    const rows = Object.entries(skills).map(([key, value]) => {
      const record = asRecord(value);
      return {
        key,
        label: labelize(key),
        level: numberField(record, 'level') ?? 0,
        xp: numberField(record, 'xp') ?? numberField(record, 'exp') ?? 0,
      };
    });
    return rows.sort((a, b) => {
      const ai = skillOrder.indexOf(a.key);
      const bi = skillOrder.indexOf(b.key);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.label.localeCompare(b.label);
    });
  }

  function inventorySlots(runtime: RuntimeReadModel | undefined): ItemSlot[] {
    return itemSlots(residentArray(runtime, 'inventory'), 28);
  }

  function equipmentSlots(runtime: RuntimeReadModel | undefined): ItemSlot[] {
    return itemSlots(residentArray(runtime, 'equipment'), 14);
  }

  function equipmentSlot(runtime: RuntimeReadModel | undefined, slot: number): ItemSlot {
    return equipmentSlots(runtime).find(entry => entry.slot === slot) || { slot, item: null };
  }

  function itemSlots(value: unknown, size: number): ItemSlot[] {
    const source = Array.isArray(value) ? value : [];
    return Array.from({ length: Math.max(size, source.length) }, (_, slot) => ({
      slot,
      item: normalizeItem(source[slot]),
    }));
  }

  function normalizeItem(value: unknown): ItemRef | null {
    const record = asRecord(value);
    const itemId = numberField(record, 'itemId');
    if (itemId === undefined) return null;
    const item: ItemRef = { itemId };
    const key = stringField(record, 'key');
    const amount = numberField(record, 'amount');
    const noted = booleanField(record, 'noted');
    if (key) item.key = key;
    if (amount !== undefined) item.amount = amount;
    if (noted !== undefined) item.noted = noted;
    return item;
  }

  function itemLabel(item: ItemRef | null): string {
    if (!item) return '';
    return item.key ? item.key.replace(/^rs:/, '').replace(/_/g, ' ') : `item ${item.itemId}`;
  }

  function itemShortLabel(item: ItemRef | null): string {
    if (!item) return '';
    const label = itemLabel(item);
    const words = label.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
    return label.slice(0, 2).toUpperCase();
  }

  function itemSlotTitle(slot: ItemSlot): string {
    if (!slot.item) return `Slot ${slot.slot + 1}: empty`;
    const amount = slot.item.amount && slot.item.amount > 1 ? ` x${slot.item.amount}` : '';
    return `Slot ${slot.slot + 1}: ${itemLabel(slot.item)}${amount}`;
  }

  function itemIconStyle(item: ItemRef | null): string {
    if (!item) return '';
    const hue = (item.itemId * 47) % 360;
    return `--item-hue: ${hue}`;
  }

  function buildResidentAppearance(runtime: RuntimeReadModel | undefined): ResidentModelAppearance | undefined {
    const equipment = equipmentSlots(runtime);
    const equippedItemId = (slot: number): number | undefined => equipment.find(entry => entry.slot === slot)?.item?.itemId;
    const savedAppearance = asRecord(savedRecord(runtime).appearance);
    const gender: 'M' | 'F' = numberField(savedAppearance, 'gender') === 1 ? 'F' : 'M';
    const parts = new Array<number>(12).fill(0);
    const basePartIds = [
      numberField(savedAppearance, 'head'),
      numberField(savedAppearance, 'facialHair'),
      numberField(savedAppearance, 'torso'),
      numberField(savedAppearance, 'arms'),
      numberField(savedAppearance, 'hands'),
      numberField(savedAppearance, 'legs'),
      numberField(savedAppearance, 'feet'),
    ];
    for (let designerPart = 0; designerPart < basePartMap.length; designerPart++) {
      const savedId = basePartIds[designerPart];
      const fallbackId = defaultIdkIdsByGender[gender][designerPart];
      const idkId = savedId ?? fallbackId;
      const slot = basePartMap[designerPart];
      if (idkId !== undefined && slot !== undefined && idkId >= 0 && !(gender === 'F' && slot === 11)) {
        parts[slot] = idkId + 256;
      }
    }

    const head = equippedItemId(0);
    const cape = equippedItemId(1);
    const neck = equippedItemId(2);
    const weapon = equippedItemId(3);
    const torsoItem = equippedItemId(4);
    const offHand = equippedItemId(5);
    const legsItem = equippedItemId(7);
    const handsItem = equippedItemId(9);
    const feetItem = equippedItemId(10);

    if (head !== undefined) parts[0] = head + 512;
    if (cape !== undefined) parts[1] = cape + 512;
    if (neck !== undefined) parts[2] = neck + 512;
    if (weapon !== undefined) parts[3] = weapon + 512;
    if (torsoItem !== undefined) parts[4] = torsoItem + 512;
    if (offHand !== undefined) parts[5] = offHand + 512;
    if (legsItem !== undefined) parts[7] = legsItem + 512;
    if (handsItem !== undefined) parts[9] = handsItem + 512;
    if (feetItem !== undefined) parts[10] = feetItem + 512;

    return {
      gender,
      parts,
      colors: [
        numberField(savedAppearance, 'hairColor') ?? 0,
        numberField(savedAppearance, 'torsoColor') ?? 0,
        numberField(savedAppearance, 'legColor') ?? 0,
        numberField(savedAppearance, 'feetColor') ?? 0,
        numberField(savedAppearance, 'skinColor') ?? 0,
      ],
    };
  }

  async function loadStatsModel(appearance: ResidentModelAppearance | undefined, key: string): Promise<void> {
    if (!appearance) {
      statsModelBytes = null;
      statsModelStatus = '';
      statsModelKey = '';
      return;
    }
    statsModelKey = key;
    statsModelStatus = 'loading';
    try {
      statsModelBytes = await api.composeResidentModel(appearance);
      statsModelStatus = '';
    } catch (err) {
      statsModelBytes = null;
      statsModelStatus = err instanceof Error ? err.message : 'model compose failed';
    }
  }

  function booleanField(value: unknown, key: string): boolean | undefined {
    const field = asRecord(value)[key];
    return typeof field === 'boolean' ? field : undefined;
  }

  function formatDuration(value: number | undefined): string {
    if (!Number.isFinite(value)) return '-';
    const seconds = Math.max(0, Math.round((value || 0) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds) return `${minutes}m ${remainingSeconds}s`;
    if (minutes < 60) return `${minutes}m`;
    return `${Math.round(minutes / 60)}h`;
  }

  function ageMsFromTimestamp(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? Math.max(0, Date.now() - time) : undefined;
  }

  function timestampMs(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : undefined;
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

  function formatScore(score: number | undefined): string {
    return Number.isFinite(score) ? `${Math.round((score || 0) * 100)}%` : '-';
  }

  function formatRate(rate: number | undefined): string {
    return Number.isFinite(rate) ? `${Math.round((rate || 0) * 100)}%` : '-';
  }

  function benchmarkStatusLabel(status: string | undefined): string {
    return status || 'unknown';
  }

  function metricRows(metrics: Record<string, number> | undefined): Array<{ key: string; value: number }> {
    return Object.entries(metrics || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key, value }));
  }

  function compactMetricValue(value: number): string {
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }

  function benchmarkStartedLabel(run: BenchmarkArtifactSummary | BenchmarkArtifact | undefined): string {
    return run?.startedAt ? timeAgo(run.startedAt) : '-';
  }

  function benchmarkLatestLabel(run: BenchmarkLeaderboardRow | undefined): string {
    return run?.latestRunAt ? timeAgo(run.latestRunAt) : '-';
  }

  function letterTimeLabel(letter: RecentLetterSummary): string {
    return letter.dispatchedAt ? timeAgo(letter.dispatchedAt) : 'undated';
  }

  function letterResidentLabel(letter: RecentLetterSummary): string {
    return letter.senderResident ? residentDisplayName(letter.senderResident) : 'city';
  }

  function letterDeliveryLabel(letter: RecentLetterSummary): string {
    return letter.deliveryChannels.length ? letter.deliveryChannels.join(', ') : 'delivery unknown';
  }

  function patronBestStanding(patron: PatronDashboardSummary): PatronStandingSummary | undefined {
    return [...patron.standing].sort((a, b) => patronStandingRank(b.tier) - patronStandingRank(a.tier) || b.points - a.points)[0];
  }

  function patronStandingRank(tier: string | undefined): number {
    if (tier === 'officer') return 3;
    if (tier === 'ally') return 2;
    if (tier === 'acquaintance') return 1;
    return 0;
  }

  function patronStandingLabel(patron: PatronDashboardSummary): string {
    const standing = patronBestStanding(patron);
    if (!standing) return 'no standing yet';
    const next = standing.pointsToNext !== undefined && standing.nextTier ? ` · ${standing.pointsToNext} to ${standing.nextTier}` : '';
    return `${standing.points.toLocaleString()} pts @ ${standing.faction}${next}`;
  }

  function patronLastActivityLabel(patron: PatronDashboardSummary): string {
    return patron.lastActivityAt ? timeAgo(patron.lastActivityAt) : 'no activity';
  }

  function patronTierCount(summary: PatronActivitySummary | undefined, tier: 'ally' | 'officer'): number {
    return summary?.tierCounts[tier] || 0;
  }

  function relationshipActivityLabel(row: ResidentRelationshipSummary): string {
    const patronLabel = `${row.patrons.toLocaleString()} patron${row.patrons === 1 ? '' : 's'}`;
    const patronEventLabel = `${row.patronEvents.toLocaleString()} patron event${row.patronEvents === 1 ? '' : 's'}`;
    const peerLabel = `${row.peerRelationships.toLocaleString()} peer tie${row.peerRelationships === 1 ? '' : 's'}`;
    const interactionLabel = `${row.peerInteractions.toLocaleString()} interaction${row.peerInteractions === 1 ? '' : 's'}`;
    return `${patronLabel} · ${patronEventLabel} · ${peerLabel} · ${interactionLabel} · ${relationshipLatestLabel(row)}`;
  }

  function relationshipLatestLabel(row: ResidentRelationshipSummary): string {
    const kind = relationshipKindLabel(row.latestEventKind);
    if (row.latestEventAt) return `${kind} ${timeAgo(row.latestEventAt)}`;
    if (row.latestEventTick !== undefined) return `${kind} at tick ${row.latestEventTick}`;
    return 'no recent relationship moment';
  }

  function relationshipKindLabel(kind: string | undefined): string {
    return labelize((kind || 'relationship').replace(/[_-]+/g, ' '));
  }

  function relationshipTag(row: ResidentRelationshipSummary): string {
    if (row.patronEvents > 0 && row.peerEvents > 0) return 'mixed';
    if (row.patronEvents > 0) return 'patron';
    return 'peer';
  }

  function readinessLabel(level: ReadinessLevel | undefined): string {
    if (level === 'ok') return 'ready';
    if (level === 'fail') return 'blocked';
    return 'needs attention';
  }

  function readinessClass(level: ReadinessLevel | undefined): string {
    if (level === 'ok') return 'ok';
    if (level === 'fail') return 'fail';
    return 'warn';
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
    <button class:active={route.startsWith('/benchmarks')} onclick={() => nav('/benchmarks')}>Benchmarks</button>
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
    {@render EventReadinessPanel({ readiness: overview?.readiness })}
    {@render PatronSummaryPanel({ summary: overview?.patrons })}
    {@render RelationshipSummaryPanel({ summary: overview?.relationships })}
    {@render ResidentTable({ rows: visibleResidents, canDelete: canDeleteResidents, onselect: nav, ondelete: deleteResidentByName })}
    <section class="panel">
      <div class="panel-title">Recent Events</div>
      {@render EventList({ events: overview?.recentEvents || [] })}
    </section>
    <section class="panel">
      <div class="panel-title">Patron Letters</div>
      {@render LetterList({ letters: overview?.recentLetters || [] })}
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
      <label>Soul file
        <select bind:value={selectedSoulFile}>
          <option value="">Generated living soul</option>
          {#each souls as soul}
            <option value={soul.file}>{soulTitle(soul)}</option>
          {/each}
        </select>
      </label>
      <label>Inference endpoint <input bind:value={inferenceEndpoint} placeholder={defaultInferenceEndpoint} /></label>
      <label>Inference model <input bind:value={inferenceModel} placeholder="endpoint default" /></label>
      <label>Temperature <input type="number" min="0" max="2" step="0.05" bind:value={inferenceTemperature} /></label>
      <label>Disconnect policy <select bind:value={disconnectPolicy}><option value="idle">idle</option><option value="logout">logout</option></select></label>
      <label class="checkbox-field"><input type="checkbox" bind:checked={autonomousSpawn} /> Autonomy</label>
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
          <button disabled={actionBusy} class="danger" onclick={logoutResident}>Logout</button>
        {:else}
          <button disabled={actionBusy} class="primary" onclick={loginResident}>Login</button>
          {#if canDeleteResidents}
            <button disabled={actionBusy} class="danger" onclick={deleteResident}>Delete</button>
          {/if}
        {/if}
      </div>
    </section>
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
    {@render ActivityPanel({ activity: buildActivitySnapshot(liveSelectedRuntime, activeResidentSession), runtime: liveSelectedRuntime })}
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
      {@render ActivityPanel({ activity: buildActivitySnapshot(withLiveResidentBody(selectedRuntime, session), session), runtime: selectedRuntime })}
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
  {:else if route === '/benchmarks'}
    <section class="page-head compact">
      <p class="kicker">Module Proof</p>
      <h1>Benchmarks</h1>
    </section>
    {@render BenchmarkLeaderboard({ rows: benchmarkLeaderboard })}
    {@render BenchmarkTable({ runs: benchmarkRuns })}
  {:else if benchmarkRunId}
    <section class="toolbar">
      <div>
        <p class="kicker">Benchmark Detail</p>
        <h1>{selectedBenchmark?.task.id || benchmarkRunId}</h1>
      </div>
      <button onclick={() => nav('/benchmarks')}>Runs</button>
    </section>
    {@render BenchmarkLeaderboard({ rows: benchmarkLeaderboard })}
    {@render BenchmarkDetail({ artifact: selectedBenchmark })}
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
      <thead><tr><th>Resident</th><th>Status</th><th>Story</th><th>Thinking</th><th>Attention</th><th>Feed</th><th>Nearby</th><th>Vitals</th><th>Last Action</th><th>Actions</th></tr></thead>
      <tbody>
        {#each rows as row}
          <tr onclick={() => onselect(`/residents/${encodeURIComponent(row.name)}`)}>
            <td><strong>{residentDisplayName(row.name)}</strong><small>{row.controllerId || 'uncontrolled'}</small></td>
            <td><span class:ok={row.online} class="dot"></span>{row.online ? 'online' : 'offline'}</td>
            <td>
              <strong>{residentStoryArcLabel(row)}</strong>
              {#if residentStoryArcDetail(row)}
                <small>{residentStoryArcDetail(row)}</small>
              {/if}
            </td>
            <td>{row.thinking?.mode || 'unknown'}</td>
            <td class="num">{row.attention ?? '-'}</td>
            <td>{residentFeedLabel(row)}</td>
            <td>{residentSurroundingsLabel(row)}</td>
            <td>{residentVitalsLabel(row)}</td>
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
          <tr><td colspan="10" class="empty">No residents reported</td></tr>
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

{#snippet EventReadinessPanel({ readiness }: { readiness: EventReadinessSummary | undefined })}
  <section class="panel readiness-panel">
    <div class="row">
      <div class="panel-title">Event Readiness</div>
      <span class={`tag ${readinessClass(readiness?.level)}`}>{readinessLabel(readiness?.level)}</span>
    </div>
    <div class="event-list readiness-list">
      {#each readiness?.checks || [] as check}
        {@render ReadinessCheckRow({ check })}
      {:else}
        <div class="empty">No readiness checks reported</div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet ReadinessCheckRow({ check }: { check: ReadinessCheckSummary })}
  <div class="event-row">
    <span class={`tag ${readinessClass(check.level)}`}>{check.level}</span>
    <span>
      <strong>{check.label}</strong>
      <small>{check.detail}</small>
    </span>
  </div>
{/snippet}

{#snippet PatronSummaryPanel({ summary }: { summary: PatronActivitySummary | undefined })}
  <section class="panel">
    <div class="panel-title">Patron Standing</div>
    <div class="mini-grid">
      <span><strong>Patrons</strong>{summary?.totalPatrons || 0}</span>
      <span><strong>Shards held</strong>{(summary?.totalShardBalance || 0).toLocaleString()}</span>
      <span><strong>Standing pts</strong>{(summary?.totalStandingPoints || 0).toLocaleString()}</span>
      <span><strong>Allies / Officers</strong>{patronTierCount(summary, 'ally')} / {patronTierCount(summary, 'officer')}</span>
    </div>
    <div class="event-list">
      {#each summary?.patrons || [] as patron}
        {@const standing = patronBestStanding(patron)}
        <div class="event-row">
          <span class="tag">{standing?.tier || 'stranger'}</span>
          <span>
            <strong>{patron.handle}</strong>
            <small>{patron.balance.toLocaleString()} Shards · {patronStandingLabel(patron)} · {patronLastActivityLabel(patron)}</small>
          </span>
        </div>
      {:else}
        <div class="empty">No patron ledger entries</div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet RelationshipSummaryPanel({ summary }: { summary: RelationshipActivitySummary | undefined })}
  <section class="panel">
    <div class="panel-title">Resident Relationships</div>
    <div class="mini-grid">
      <span><strong>Residents</strong>{summary?.residentsWithRelationships || 0}</span>
      <span><strong>Patron events</strong>{(summary?.totalPatronEvents || 0).toLocaleString()}</span>
      <span><strong>Peer ties</strong>{(summary?.totalPeerRelationships || 0).toLocaleString()}</span>
      <span><strong>Interactions</strong>{(summary?.totalPeerInteractions || 0).toLocaleString()}</span>
    </div>
    <div class="event-list">
      {#each summary?.residents || [] as row}
        <div class="event-row">
          <span class="tag">{relationshipTag(row)}</span>
          <span>
            <strong>{residentDisplayName(row.resident)}</strong>
            <small>{relationshipActivityLabel(row)}</small>
          </span>
        </div>
      {:else}
        <div class="empty">No Library relationship moments yet</div>
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

{#snippet LetterList({ letters }: { letters: RecentLetterSummary[] })}
  <div class="event-list">
    {#each letters as letter}
      <div class="event-row">
        <span class="tag">{letter.kind}</span>
        <span>
          <strong>{letter.subject}</strong>
          <small>{letterResidentLabel(letter)} to {letter.recipient} · {letterDeliveryLabel(letter)} · {letter.dispatchedAt || 'undated'} ({letterTimeLabel(letter)})</small>
        </span>
      </div>
    {:else}
      <div class="empty">No recent patron letters</div>
    {/each}
  </div>
{/snippet}

{#snippet BenchmarkTable({ runs }: { runs: BenchmarkArtifactSummary[] })}
  <section class="table-wrap">
    <table>
      <thead><tr><th>Task</th><th>Status</th><th>Score</th><th>Mode</th><th>Module</th><th>Resident</th><th>Duration</th><th>Started</th></tr></thead>
      <tbody>
        {#each runs as run}
          <tr onclick={() => nav(`/benchmarks/${encodeURIComponent(run.runId)}`)}>
            <td><strong>{run.task.id}</strong><small>{run.runId}</small></td>
            <td><span class:ok={run.status === 'passed'} class:warn={run.status !== 'passed'} class="tag">{benchmarkStatusLabel(run.status)}</span></td>
            <td class="num">{formatScore(run.score)}</td>
            <td>{run.mode}</td>
            <td><strong>{run.module.id}</strong><small>{run.module.version || 'version unknown'}</small></td>
            <td>{residentDisplayName(run.resident)}</td>
            <td>{formatDuration(run.durationMs)}</td>
            <td>{benchmarkStartedLabel(run)}</td>
          </tr>
        {:else}
          <tr><td colspan="8" class="empty">No benchmark artifacts found</td></tr>
        {/each}
      </tbody>
    </table>
  </section>
{/snippet}

{#snippet BenchmarkLeaderboard({ rows }: { rows: BenchmarkLeaderboardRow[] })}
  <section class="panel leaderboard-panel">
    <div class="panel-title">Module Leaderboard</div>
    <div class="leaderboard-grid">
      {#each rows as row, index}
        <article class="leaderboard-card">
          <div class="row">
            <strong>{index + 1}. {row.module.id}</strong>
            <span class="tag">{row.module.version || 'version unknown'}</span>
          </div>
          <div class="leaderboard-score">
            <span>Pass Rate</span>
            <strong class:ok={row.passRate >= 0.8}>{formatRate(row.passRate)}</strong>
          </div>
          <div class="mini-grid leaderboard-stats">
            <span><strong>Progress</strong>{formatScore(row.averageScore)}</span>
            <span><strong>Runs</strong>{row.runs}</span>
            <span><strong>Tasks</strong>{row.taskCount}</span>
            <span><strong>Auto</strong>{row.autonomousRuns}</span>
            <span><strong>Avg Time</strong>{formatDuration(row.averageDurationMs)}</span>
            <span><strong>Safety</strong>{row.safetyIncidents}</span>
            <span><strong>Cleanup</strong>{row.cleanupFailures}</span>
            <span><strong>Inference</strong>{row.inferenceRequests}</span>
          </div>
          <div class="leaderboard-tasks">
            {#each row.tasks.slice(0, 4) as task}
              <span>{task.taskId}: {task.passed}/{task.runs} · {formatScore(task.averageScore)}</span>
            {/each}
          </div>
          <small>latest {benchmarkLatestLabel(row)}</small>
        </article>
      {:else}
        <div class="empty">No benchmark leaderboard data yet</div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet BenchmarkDetail({ artifact }: { artifact: BenchmarkArtifact | undefined })}
  {#if artifact}
    <section class="metrics benchmark-metrics">
      <div class="metric"><span>Status</span><strong class:ok={artifact.status === 'passed'}>{artifact.status}</strong></div>
      <div class="metric"><span>Score</span><strong>{formatScore(artifact.score)}</strong></div>
      <div class="metric"><span>Mode</span><strong>{artifact.mode}</strong></div>
      <div class="metric"><span>Duration</span><strong>{formatDuration(artifact.durationMs)}</strong></div>
    </section>
    <section class="split benchmark-detail">
      <div class="panel">
        <div class="panel-title">Run</div>
        <table class="dense-table body-table">
          <tbody>
            <tr><th>Run</th><td>{artifact.runId}</td></tr>
            <tr><th>Task</th><td>{artifact.task.id} {artifact.task.version || ''}</td></tr>
            <tr><th>Module</th><td>{artifact.module.id} {artifact.module.version || ''}</td></tr>
            <tr><th>Resident</th><td>{residentDisplayName(artifact.resident)}</td></tr>
            <tr><th>Model</th><td>{artifact.modelProfile || '-'}</td></tr>
            <tr><th>Started</th><td>{artifact.startedAt || '-'}</td></tr>
            <tr><th>Ended</th><td>{artifact.endedAt || '-'}</td></tr>
            {#if artifact.failureReason}
              <tr><th>Failure</th><td>{artifact.failureReason}</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-title">Metrics</div>
        <div class="mini-grid benchmark-metric-list">
          {#each metricRows(artifact.metrics) as metric}
            <span><strong>{metric.key}</strong>{compactMetricValue(metric.value)}</span>
          {:else}
            <div class="empty">No metrics reported</div>
          {/each}
        </div>
      </div>
    </section>
    <section class="modules">
      <div class="panel">
        <div class="panel-title">Evidence</div>
        <div class="event-list">
          {#each benchmarkActionRows(artifact.evidence) as action}
            <div class="event-row">
              <span class:ok={action.ok === true} class:warn={action.ok === false} class="tag">{action.statusLabel}</span>
              <span>
                <strong>{action.actionLabel}</strong>
                <small>{action.effectLabel} | {action.detail}</small>
              </span>
            </div>
          {/each}
          {#each artifact.evidence.summaries || [] as summary}
            <div class="event-row"><span class="tag">proof</span><span>{summary}</span></div>
          {/each}
          {#if !benchmarkActionRows(artifact.evidence).length && !(artifact.evidence.summaries || []).length}
            <div class="empty">No evidence summaries</div>
          {/if}
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">Raw Artifact</div>
        <pre>{compactJson(artifact)}</pre>
      </div>
    </section>
  {:else}
    <section class="panel"><div class="empty">Benchmark artifact unavailable</div></section>
  {/if}
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

{#snippet ActivityPanel({ activity, runtime }: { activity: ReturnType<typeof buildActivitySnapshot>; runtime: RuntimeReadModel | undefined })}
  <section class:stale={activity.stale} class="panel activity-panel">
    <div class="row activity-head">
      <div>
        <div class="panel-title">SPARK Activity</div>
        <strong>{activity.statusText}</strong>
      </div>
      <span class:ok={activity.onlineLabel === 'online'} class="tag">{activity.onlineLabel}</span>
    </div>
    <div class="spark-tabs" role="tablist" aria-label="SPARK activity views">
      <button class:active={sparkActivityTab === 'activity'} role="tab" aria-selected={sparkActivityTab === 'activity'} onclick={() => (sparkActivityTab = 'activity')}>Activity</button>
      <button class:active={sparkActivityTab === 'stats'} role="tab" aria-selected={sparkActivityTab === 'stats'} onclick={() => (sparkActivityTab = 'stats')}>Stats</button>
    </div>
    {#if sparkActivityTab === 'stats'}
      {@render CharacterStatsPanel({ runtime })}
    {:else}
      <div class="spark-activity-grid">
        {@render SparkActivitySection({ title: 'Thinking', rows: thinkingActivity(runtime, activity) })}
        {@render SparkActivitySection({ title: 'Nervous System', rows: nervousActivity(runtime) })}
        {@render SparkActivitySection({ title: 'Body', rows: bodyActivity(runtime, activity) })}
      </div>
    {/if}
  </section>
{/snippet}

{#snippet SparkActivitySection({ title, rows }: { title: string; rows: SparkActivityItem[] })}
  <section class="spark-activity-section">
    <div class="panel-title">{title}</div>
    <div class="spark-activity-list">
      {#each rows as row}
        <div class="spark-activity-row">
          <span>{row.label}</span>
          <strong>{row.value}</strong>
          {#if row.detail}
            <small>{row.detail}</small>
          {/if}
        </div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet CharacterStatsPanel({ runtime }: { runtime: RuntimeReadModel | undefined })}
  <div class="stats-layout">
    <section class="stats-skills">
      <div class="panel-title">Skills</div>
      <div class="skill-grid">
        {#each skillRows(runtime) as skill}
          <div class="skill-row">
            <span>{skill.label}</span>
            <strong>{skill.level}</strong>
            <small>{Math.floor(skill.xp).toLocaleString()} xp</small>
          </div>
        {:else}
          <div class="empty">No skills reported</div>
        {/each}
      </div>
    </section>
    <section class="stats-model">
      <div class="panel-title">Character</div>
      <div class="model-frame">
        {#if statsModelStatus}
          <div class="empty">{statsModelStatus}</div>
        {/if}
        <ModelViewer glbBytes={statsModelBytes} />
      </div>
      {@render EquipmentPaperDoll({ runtime })}
    </section>
    <section class="stats-inventory">
      <div class="panel-title">Inventory</div>
      <div class="inventory-grid">
        {#each inventorySlots(runtime) as slot}
          {@render ItemSlotIcon({ slot, compact: false })}
        {/each}
      </div>
    </section>
  </div>
{/snippet}

{#snippet EquipmentPaperDoll({ runtime }: { runtime: RuntimeReadModel | undefined })}
  <div class="equipment-paper-doll" aria-label="Equipped items">
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 0), area: 'head', label: 'Head' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 1), area: 'back', label: 'Back' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 2), area: 'neck', label: 'Neck' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 13), area: 'quiver', label: 'Quiver' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 3), area: 'main-hand', label: 'Main hand' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 4), area: 'torso', label: 'Torso' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 5), area: 'off-hand', label: 'Off hand' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 7), area: 'legs', label: 'Legs' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 9), area: 'hands', label: 'Hands' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 10), area: 'feet', label: 'Feet' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 12), area: 'ring', label: 'Ring' })}
  </div>
{/snippet}

{#snippet EquipmentSlotBox({ slot, area, label }: { slot: ItemSlot; area: string; label: string })}
  <div class:empty-slot={!slot.item} class="equipment-slot item-slot" data-area={area} title={slot.item ? `${label}: ${itemLabel(slot.item)}` : `${label}: empty`} style={itemIconStyle(slot.item)}>
    {#if slot.item}
      <span class="item-glyph">{itemShortLabel(slot.item)}</span>
      {#if slot.item.amount && slot.item.amount > 1}
        <small>{slot.item.amount}</small>
      {/if}
    {:else}
      <span class="equipment-placeholder">{label}</span>
    {/if}
  </div>
{/snippet}

{#snippet ItemSlotIcon({ slot, compact }: { slot: ItemSlot; compact: boolean })}
  <div class:compact class:empty-slot={!slot.item} class="item-slot" title={itemSlotTitle(slot)} style={itemIconStyle(slot.item)}>
    {#if slot.item}
      <span class="item-glyph">{itemShortLabel(slot.item)}</span>
      {#if slot.item.amount && slot.item.amount > 1}
        <small>{slot.item.amount}</small>
      {/if}
    {:else}
      <span class="slot-index">{slot.slot + 1}</span>
    {/if}
  </div>
{/snippet}
