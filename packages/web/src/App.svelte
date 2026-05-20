<script lang="ts">
  import { onMount } from 'svelte';
  import type { DashboardOverview, ObservableSubjectSummary, ResidentDashboardRow, RuntimeReadModel, SoulSummary, SpectatorMode, SpectatorSession } from '@nullcity-dashboard/shared';
  import { api, routeTo } from './lib/api';
  import { compactJson, subjectLabel, subjectPath, timeAgo } from './lib/format';

  let route = window.location.pathname;
  let loading = false;
  let error = '';
  let overview: DashboardOverview | undefined;
  let residents: ResidentDashboardRow[] = [];
  let selectedRuntime: RuntimeReadModel | undefined;
  let subjects: ObservableSubjectSummary[] = [];
  let sessions: SpectatorSession[] = [];
  let souls: SoulSummary[] = [];
  let logs: { actions: unknown[]; inference: unknown[] } = { actions: [], inference: [] };

  let filter = 'all';
  let newName = 'res:';
  let spawnX = '';
  let spawnY = '';
  let spawnLevel = '0';
  let connectAfterCreate = true;
  let disconnectPolicy = 'idle';
  let selectedSoul = '';
  let jsonAction = '{\n  "kind": "noop",\n  "cause": "dashboard"\n}';

  $: parts = route.split('/').filter(Boolean);
  $: residentName = parts[0] === 'residents' && parts[1] && parts[1] !== 'new' ? decodeURIComponent(parts[1]) : '';
  $: observeKind = parts[0] === 'observe' ? parts[1] : '';
  $: observeId = parts[0] === 'observe' ? parts[2] : '';

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
      else if (route === '/residents/new') souls = await api.souls();
      else if (residentName) selectedRuntime = await api.runtime(residentName);
      else if (route === '/observe' || route.startsWith('/observe/')) {
        [subjects, sessions] = await Promise.all([api.subjects(), api.sessions()]);
      } else if (route === '/souls') souls = await api.souls();
      else if (route === '/logs') logs = await api.logs();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Request failed';
    } finally {
      loading = false;
    }
  }

  function nav(path: string) {
    routeTo(path);
  }

  async function createResident() {
    const body: Record<string, unknown> = { name: newName };
    const x = Number(spawnX);
    const y = Number(spawnY);
    const level = Number(spawnLevel);
    if (Number.isFinite(x) && Number.isFinite(y)) body.spawnPosition = { x, y, level: Number.isFinite(level) ? level : 0 };
    if (selectedSoul) body.soul = selectedSoul;
    await api.createResident(body);
    if (connectAfterCreate) await api.residentCommand(newName, 'connect', { observe: true, control: true, onDisconnect: disconnectPolicy });
    nav(`/residents/${encodeURIComponent(newName)}`);
  }

  async function commandResident(command: 'connect' | 'attach' | 'detach' | 'disconnect') {
    if (!residentName) return;
    await api.residentCommand(residentName, command, command === 'connect' ? { observe: true, control: true, onDisconnect: disconnectPolicy } : {});
    await loadRoute();
  }

  async function sendJsonAction() {
    if (!residentName) return;
    await api.submitAction(residentName, JSON.parse(jsonAction));
    await loadRoute();
  }

  async function startObserve(subject: ObservableSubjectSummary, mode: SpectatorMode = 'follow') {
    await api.observe(subject.subject, mode);
    nav(`/observe/${subjectPath(subject.subject)}`);
  }

  async function stopObserve(sessionId: string) {
    await api.unobserve(sessionId);
    await loadRoute();
  }

  function residentRows(): ResidentDashboardRow[] {
    return route === '/' ? overview?.residents || [] : residents;
  }

  function selectedSession(): SpectatorSession | undefined {
    if (!observeKind || !observeId) return undefined;
    const decoded = decodeURIComponent(observeId);
    return sessions.find(session =>
      session.subject.kind === observeKind && (session.subject.kind === 'resident' ? session.subject.name === decoded : session.subject.username === decoded),
    );
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

  {#if error}
    <div class="notice rose">{error}</div>
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
    {@render ResidentTable({ rows: residentRows(), onselect: nav })}
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
    {@render ResidentTable({ rows: residentRows(), onselect: nav })}
  {:else if route === '/residents/new'}
    <section class="page-head compact">
      <p class="kicker">Lifecycle</p>
      <h1>Spawn Resident</h1>
    </section>
    <section class="form-grid">
      <label>Name <input bind:value={newName} placeholder="res:name" /></label>
      <label>Soul <select bind:value={selectedSoul}><option value="">unassigned</option>{#each souls as soul}<option value={soul.file}>{soul.title}</option>{/each}</select></label>
      <label>X <input bind:value={spawnX} inputmode="numeric" /></label>
      <label>Y <input bind:value={spawnY} inputmode="numeric" /></label>
      <label>Level <input bind:value={spawnLevel} inputmode="numeric" /></label>
      <label>Disconnect policy <select bind:value={disconnectPolicy}><option value="idle">idle</option><option value="logout">logout</option></select></label>
      <label class="check"><input type="checkbox" bind:checked={connectAfterCreate} /> Connect after create</label>
      <button class="primary wide" onclick={createResident}>Create</button>
    </section>
    {@render SoulGrid({ souls })}
  {:else if residentName}
    <section class="toolbar">
      <div>
        <p class="kicker">Resident Detail</p>
        <h1>{residentName}</h1>
      </div>
      <div class="actions">
        <button onclick={() => commandResident('attach')}>Observe</button>
        <button onclick={() => commandResident('connect')}>Control</button>
        <button onclick={() => commandResident('detach')}>Detach</button>
        <button class="danger" onclick={() => commandResident('disconnect')}>Disconnect</button>
      </div>
    </section>
    <section class="split">
      <div class="panel observer-pane">
        <div class="panel-title">Spectator</div>
        <div class="spectator-placeholder">Read-only observer surface</div>
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
      <button class="primary" onclick={sendJsonAction}>Submit Action</button>
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
            <button onclick={() => startObserve(subject, 'follow')}>Follow</button>
            <button onclick={() => startObserve(subject, 'free-camera')}>Free Camera</button>
          </div>
        </article>
      {/each}
    </section>
    {@render SessionList({ sessions, stop: stopObserve })}
  {:else if route.startsWith('/observe/')}
    {@const session = selectedSession()}
    <section class="toolbar">
      <div>
        <p class="kicker">Spectator Session</p>
        <h1>{session ? subjectLabel(session.subject) : 'Subject unavailable'}</h1>
      </div>
      <button onclick={() => nav('/observe')}>Subjects</button>
    </section>
    <section class="split wide">
      <div class="panel observer-pane large">
        <div class="panel-title">Canvas</div>
        <div class="spectator-placeholder">{session?.connected ? 'Spectating' : 'Session closed'}</div>
      </div>
      <div class="panel">
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
