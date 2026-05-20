<script lang="ts">
  import { onMount } from 'svelte';
  import type { DashboardOverview, ObservableSubjectSummary, ResidentDashboardRow, RuntimeReadModel, SoulSummary, SpectatorMode, SpectatorSession, SpectatorSubject } from '@nullcity-dashboard/shared';
  import { NullCitySpectatorBridge, summarizePerception } from '@nullcity-dashboard/observer';
  import { api, routeTo } from './lib/api';
  import { buildActivitySnapshot } from './lib/activity';
  import { compactJson, subjectLabel, subjectPath, timeAgo } from './lib/format';

  let route = window.location.pathname;
  let loading = false;
  let actionBusy = false;
  let error = '';
  let actionError = '';
  let overview: DashboardOverview | undefined;
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
  let sessionStream: EventSource | undefined;
  let sessionStreamId = '';

  const defaultSpawnX = '3225';
  const defaultSpawnY = '3217';
  const defaultSpawnLevel = '0';

  let filter = 'all';
  let newName = 'res:resident_001';
  let spawnX = defaultSpawnX;
  let spawnY = defaultSpawnY;
  let spawnLevel = defaultSpawnLevel;
  let connectAfterCreate = false;
  let disconnectPolicy = 'idle';
  let jsonAction = '{\n  "kind": "noop",\n  "cause": "dashboard"\n}';

  $: parts = route.split('/').filter(Boolean);
  $: residentName = parts[0] === 'residents' && parts[1] && parts[1] !== 'new' ? decodeURIComponent(parts[1]) : '';
  $: observeKind = parts[0] === 'observe' ? parts[1] || '' : '';
  $: observeId = parts[0] === 'observe' ? parts[2] || '' : '';
  $: visibleResidents = route === '/' ? overview?.residents || [] : residents;
  $: activeObserveSession = findSelectedSession(activeSession, sessions, observeKind, observeId);
  $: activeResidentSession = findResidentSession(activeSession, sessions, residentName);
  $: if (route === '/residents/new') seedSpawnDefaults();

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
      if (route === '/') overview = await api.overview();
      else if (route === '/residents') residents = await api.residents(filter);
      else if (route === '/residents/new') {
        seedSpawnDefaults();
        souls = await api.souls();
      }
      else if (residentName) {
        [selectedRuntime, sessions] = await Promise.all([api.runtime(residentName), api.sessions()]);
        syncResidentStream();
      }
      else if (route === '/observe' || route.startsWith('/observe/')) {
        const observedResident = observeKind === 'resident' && observeId ? decodeURIComponent(observeId) : '';
        const observedRuntime = observedResident ? api.runtime(observedResident).catch(() => undefined) : Promise.resolve(undefined);
        [subjects, sessions, selectedRuntime] = await Promise.all([api.subjects(), api.sessions(), observedRuntime]);
        syncObserveStream();
      } else if (route === '/souls') souls = await api.souls();
      else if (route === '/logs') logs = await api.logs();
      if (!route.startsWith('/observe/') && !residentName) closeSessionStream();
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

  async function createResident() {
    await runAction(async () => {
      const name = newName.trim().toLowerCase();
      if (!/^res:[a-z0-9_]{1,20}$/.test(name)) throw new Error('Resident names must match res:[a-z0-9_]{1,20}');
      const body: Record<string, unknown> = { name };
      const x = Number(spawnX);
      const y = Number(spawnY);
      const level = Number(spawnLevel);
      if (Number.isInteger(x) && Number.isInteger(y)) body.spawnPosition = { x, y, level: Number.isInteger(level) ? level : 0 };
      await api.createResident(body);
      if (connectAfterCreate) await api.residentCommand(name, 'connect', { observe: true, control: false, onDisconnect: disconnectPolicy });
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

  async function loginResident() {
    if (!residentName) return;
    await runAction(async () => {
      await api.residentCommand(residentName, 'connect', { observe: true, control: false, onDisconnect: disconnectPolicy });
      await loadRoute();
    });
  }

  async function sendJsonAction() {
    if (!residentName) return;
    await runAction(async () => {
      await api.submitAction(residentName, JSON.parse(jsonAction));
      await loadRoute();
    });
  }

  async function startObserve(subject: ObservableSubjectSummary, mode: SpectatorMode = 'follow') {
    await observeSubject(subject.subject, mode);
  }

  async function observeResident() {
    if (!residentName) return;
    await runAction(async () => {
      await api.residentCommand(residentName, 'connect', { observe: false, control: false, onDisconnect: disconnectPolicy });
      await openObserveSubject({ kind: 'resident', name: residentName }, 'follow');
    });
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

  async function stopObserve(sessionId: string) {
    await runAction(async () => {
      await api.unobserve(sessionId);
      if (activeSession?.id === sessionId) activeSession = { ...activeSession, connected: false };
      await loadRoute();
    });
  }

  function residentIsOnline(): boolean {
    return selectedRuntime?.online === true;
  }

  function findSelectedSession(active: SpectatorSession | undefined, available: SpectatorSession[], kind: string, id: string | undefined): SpectatorSession | undefined {
    if (!kind || !id) return undefined;
    const decoded = decodeURIComponent(id);
    return [active, ...available].find(session => session && subjectMatches(session.subject, kind, decoded));
  }

  function findResidentSession(active: SpectatorSession | undefined, available: SpectatorSession[], name: string): SpectatorSession | undefined {
    if (!name) return undefined;
    return [active, ...available].find(session => session?.subject.kind === 'resident' && session.subject.name.toLowerCase() === name.toLowerCase());
  }

  function subjectMatches(subject: SpectatorSubject, kind: string, id: string): boolean {
    return subject.kind === kind && (subject.kind === 'resident' ? subject.name.toLowerCase() === id.toLowerCase() : subject.username.toLowerCase() === id.toLowerCase());
  }

  function upsertSession(session: SpectatorSession) {
    sessions = [session, ...sessions.filter(candidate => candidate.id !== session.id)];
  }

  function syncObserveStream() {
    const session = findSelectedSession(activeSession, sessions, observeKind, observeId);
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

  function spectatorFrame(node: HTMLElement, session: SpectatorSession | undefined) {
    const bridge = new NullCitySpectatorBridge(node);
    bridge.setSession(session);
    return {
      update(next: SpectatorSession | undefined) {
        bridge.setSession(next);
      },
      destroy() {
        bridge.destroy();
      },
    };
  }

  function sessionSummary(session: SpectatorSession | undefined) {
    return summarizePerception(session?.latestPerception);
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
    {@render ResidentTable({ rows: visibleResidents, onselect: nav })}
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
    {@render ResidentTable({ rows: visibleResidents, onselect: nav })}
  {:else if route === '/residents/new'}
    <section class="page-head compact">
      <p class="kicker">Lifecycle</p>
      <h1>Spawn Resident</h1>
    </section>
    <section class="form-grid">
      <label>Name <input bind:value={newName} placeholder="res:name" /></label>
      <label>X <input bind:value={spawnX} inputmode="numeric" placeholder={defaultSpawnX} /></label>
      <label>Y <input bind:value={spawnY} inputmode="numeric" placeholder={defaultSpawnY} /></label>
      <label>Level <input bind:value={spawnLevel} inputmode="numeric" placeholder={defaultSpawnLevel} /></label>
      <label>Disconnect policy <select bind:value={disconnectPolicy}><option value="idle">idle</option><option value="logout">logout</option></select></label>
      <label class="check"><input type="checkbox" bind:checked={connectAfterCreate} /> Spawn online after create</label>
      <button class="primary wide" disabled={actionBusy} onclick={createResident}>Create</button>
    </section>
    {@render SoulGrid({ souls })}
  {:else if residentName}
    <section class="toolbar">
      <div>
        <p class="kicker">Resident Detail</p>
        <h1>{residentName}</h1>
      </div>
      <div class="actions">
        {#if residentIsOnline()}
          <button disabled={actionBusy} onclick={observeResident}>Observe</button>
          <button disabled={actionBusy} onclick={() => commandResident('connect')}>Control</button>
          <button disabled={actionBusy} onclick={() => commandResident('detach')}>Detach</button>
          <button disabled={actionBusy} class="danger" onclick={() => commandResident('disconnect')}>Disconnect</button>
        {:else}
          <button disabled={actionBusy} class="primary" onclick={loginResident}>Login</button>
        {/if}
      </div>
    </section>
    {@render ActivityPanel({ activity: buildActivitySnapshot(selectedRuntime, activeResidentSession) })}
    <section class="split">
      <div class="panel observer-pane">
        <div class="panel-title">Spectator</div>
        <div class="observer-surface">
          <div class="spectator-frame" use:spectatorFrame={activeResidentSession} aria-label="resident spectator"></div>
          {#if !residentIsOnline()}
            <button disabled={actionBusy} class="surface-action" onclick={loginResident}>Login Resident</button>
          {:else if !activeResidentSession}
            <button disabled={actionBusy} class="surface-action" onclick={observeResident}>Start Spectator</button>
          {/if}
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">Body</div>
        {@render KeyValue({ data: selectedRuntime?.body || {} })}
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
            <span class="tag">{subject.subject.kind}</span>
          </div>
          <p>{subject.position ? `${subject.position.x}, ${subject.position.y}, ${subject.position.level}` : 'position unknown'}</p>
          <div class="actions">
            <button disabled={actionBusy} onclick={() => startObserve(subject, 'follow')}>Follow</button>
            <button disabled={actionBusy} onclick={() => startObserve(subject, 'free-camera')}>Free Camera</button>
          </div>
        </article>
      {/each}
    </section>
    {@render SessionList({ sessions, stop: stopObserve })}
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
      {@render ActivityPanel({ activity: buildActivitySnapshot(selectedRuntime, session) })}
    {/if}
    <section class="split wide">
      <div class="panel observer-pane large">
        <div class="panel-title">Spectator</div>
        <div class="observer-surface large">
          <div class="spectator-frame" use:spectatorFrame={session} aria-label="spectator"></div>
        </div>
      </div>
      <div class="panel">
        <div class="mini-grid observer-summary">
          <span>players {sessionSummary(session).players}</span>
          <span>residents {sessionSummary(session).residents}</span>
          <span>npcs {sessionSummary(session).npcs}</span>
          <span>objects {sessionSummary(session).objects}</span>
          <span>items {sessionSummary(session).items}</span>
        </div>
        <div class="panel-title">Perception</div>
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

{#snippet ResidentTable({ rows, onselect }: { rows: ResidentDashboardRow[]; onselect: (path: string) => void })}
  <section class="table-wrap">
    <table>
      <thead><tr><th>Resident</th><th>Status</th><th>Thinking</th><th>Attention</th><th>Body</th><th>Last Action</th></tr></thead>
      <tbody>
        {#each rows as row}
          <tr onclick={() => onselect(`/residents/${encodeURIComponent(row.name)}`)}>
            <td><strong>{row.name}</strong><small>{row.controllerId || 'uncontrolled'}</small></td>
            <td><span class:ok={row.online} class="dot"></span>{row.online ? 'online' : 'offline'}</td>
            <td>{row.thinking?.mode || 'unknown'}</td>
            <td class="num">{row.attention ?? '-'}</td>
            <td>{row.body?.controlHeld ? 'control held' : 'free'}</td>
            <td>{row.body?.lastAction?.kind || row.lastEvent?.kind || '-'}</td>
          </tr>
        {:else}
          <tr><td colspan="6" class="empty">No residents reported</td></tr>
        {/each}
      </tbody>
    </table>
  </section>
{/snippet}

{#snippet KeyValue({ data }: { data: unknown })}
  <pre>{compactJson(data)}</pre>
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

{#snippet SessionList({ sessions, stop }: { sessions: SpectatorSession[]; stop: (id: string) => void })}
  <section class="panel">
    <div class="panel-title">Current Spectators</div>
    {#each sessions as session}
      <div class="event-row">
        <span>{subjectLabel(session.subject)}</span>
        <span class="tag">{session.mode}</span>
        <button onclick={() => stop(session.id)}>Close</button>
      </div>
    {:else}
      <div class="empty">No active spectator sessions</div>
    {/each}
  </section>
{/snippet}
