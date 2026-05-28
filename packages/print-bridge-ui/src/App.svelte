<script lang="ts">
  import { onMount } from 'svelte';

  type AdapterKind = 'bambu-lan' | 'fdm-monster' | 'moonraker' | 'snapmaker-u1' | 'dry-run';
  type SlicerKind = 'dry-run' | 'command';
  type Tab = 'setup' | 'printers' | 'runtime';

  interface PrinterDraft {
    id: string;
    name: string;
    kind: AdapterKind;
    host: string;
    serial: string;
    accessCode: string;
    baseUrl: string;
    apiKey: string;
    externalPrinterId: string;
    uploadDirectory: string;
    timeoutMs: number;
  }

  const storageKey = 'nullcity-print-bridge-ui-v1';

  let activeTab = $state<Tab>('setup');
  let bridgeId = $state('nullcity-print-bridge');
  let cityBaseUrl = $state('https://city.oniondao.dev');
  let cityToken = $state('');
  let pollMs = $state(10_000);
  let heartbeatMs = $state(30_000);
  let workDir = $state('.print-bridge');
  let slicerKind = $state<SlicerKind>('dry-run');
  let slicerCommand = $state('');
  let slicerArgs = $state('{input} --output {output}');
  let slicerProfile = $state('');
  let bridgeProbe = $state<'idle' | 'checking' | 'ok' | 'failed'>('idle');
  let probeMessage = $state('');
  let copied = $state('');
  let printers = $state<PrinterDraft[]>([
    {
      id: 'p2s-east',
      name: 'P2S East',
      kind: 'bambu-lan',
      host: '',
      serial: '',
      accessCode: '',
      baseUrl: '',
      apiKey: '',
      externalPrinterId: '',
      uploadDirectory: 'cache',
      timeoutMs: 15_000,
    },
  ]);

  const firstPrinter = $derived(printers[0]);
  const useAdaptersJson = $derived(printers.length > 1);
  const missing = $derived(validateConfig());
  const adapterJson = $derived(JSON.stringify(printers.map(toAdapterConfig), null, 2));
  const envText = $derived(buildEnvText());
  const runCommand = $derived(`set -a && source .env.print-bridge && set +a && bun --eval '${inlineRunner()}'`);
  const adminPrinterRows = $derived(printers.map(printer => ({
    name: printer.name || printer.id,
    bridgeId,
    printerId: printer.id,
    adapter: printer.kind,
  })));

  onMount(() => {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const data = JSON.parse(saved) as Partial<{
        bridgeId: string;
        cityBaseUrl: string;
        cityToken: string;
        pollMs: number;
        heartbeatMs: number;
        workDir: string;
        slicerKind: SlicerKind;
        slicerCommand: string;
        slicerArgs: string;
        slicerProfile: string;
        printers: PrinterDraft[];
      }>;
      bridgeId = data.bridgeId || bridgeId;
      cityBaseUrl = data.cityBaseUrl || cityBaseUrl;
      cityToken = data.cityToken || cityToken;
      pollMs = data.pollMs || pollMs;
      heartbeatMs = data.heartbeatMs || heartbeatMs;
      workDir = data.workDir || workDir;
      slicerKind = data.slicerKind || slicerKind;
      slicerCommand = data.slicerCommand || slicerCommand;
      slicerArgs = data.slicerArgs || slicerArgs;
      slicerProfile = data.slicerProfile || slicerProfile;
      printers = data.printers?.length ? data.printers : printers;
    } catch {
      localStorage.removeItem(storageKey);
    }
  });

  $effect(() => {
    localStorage.setItem(storageKey, JSON.stringify({
      bridgeId,
      cityBaseUrl,
      cityToken,
      pollMs,
      heartbeatMs,
      workDir,
      slicerKind,
      slicerCommand,
      slicerArgs,
      slicerProfile,
      printers,
    }));
  });

  function toAdapterConfig(printer: PrinterDraft) {
    if (printer.kind === 'bambu-lan') {
      return {
        kind: 'bambu-lan',
        id: printer.id,
        host: printer.host,
        serial: printer.serial,
        accessCode: printer.accessCode,
        uploadDirectory: printer.uploadDirectory || 'cache',
        timeoutMs: printer.timeoutMs || 15_000,
      };
    }
    if (printer.kind === 'fdm-monster') {
      return {
        kind: 'fdm-monster',
        id: printer.id,
        baseUrl: printer.baseUrl || 'http://127.0.0.1:4000',
        apiKey: printer.apiKey,
        printerId: printer.externalPrinterId || printer.id,
      };
    }
    if (printer.kind === 'snapmaker-u1') {
      return {
        kind: 'snapmaker-u1',
        id: printer.id,
        baseUrl: printer.baseUrl || 'http://127.0.0.1:7125',
        apiKey: printer.apiKey,
      };
    }
    if (printer.kind === 'moonraker') {
      return {
        kind: 'moonraker',
        id: printer.id,
        baseUrl: printer.baseUrl || 'http://127.0.0.1:7125',
        apiKey: printer.apiKey,
      };
    }
    return {
      kind: 'dry-run',
      id: printer.id,
      completeAfterMs: 30_000,
    };
  }

  function buildEnvText(): string {
    const lines: Array<[string, string]> = [
      ['PRINT_BRIDGE_ID', bridgeId],
      ['PRINT_BRIDGE_CITY_BASE_URL', cityBaseUrl],
      ['PRINT_BRIDGE_CITY_TOKEN', cityToken],
      ['PRINT_BRIDGE_POLL_MS', String(pollMs)],
      ['PRINT_BRIDGE_HEARTBEAT_MS', String(heartbeatMs)],
      ['PRINT_BRIDGE_WORK_DIR', workDir],
    ];

    if (useAdaptersJson) {
      lines.push(['PRINT_BRIDGE_ADAPTERS_JSON', adapterJson.replace(/\n/g, '')]);
    } else if (firstPrinter) {
      lines.push(['PRINT_BRIDGE_ADAPTER', firstPrinter.kind]);
      lines.push(['PRINT_BRIDGE_PRINTER_ID', firstPrinter.id]);
      if (firstPrinter.kind === 'bambu-lan') {
        lines.push(['BAMBU_LAN_HOST', firstPrinter.host]);
        lines.push(['BAMBU_LAN_SERIAL', firstPrinter.serial]);
        lines.push(['BAMBU_LAN_ACCESS_CODE', firstPrinter.accessCode]);
        lines.push(['BAMBU_LAN_UPLOAD_DIRECTORY', firstPrinter.uploadDirectory || 'cache']);
        lines.push(['BAMBU_LAN_TIMEOUT_MS', String(firstPrinter.timeoutMs || 15_000)]);
      }
      if (firstPrinter.kind === 'fdm-monster') {
        lines.push(['FDM_MONSTER_BASE_URL', firstPrinter.baseUrl || 'http://127.0.0.1:4000']);
        lines.push(['FDM_MONSTER_API_KEY', firstPrinter.apiKey]);
        lines.push(['FDM_MONSTER_PRINTER_ID', firstPrinter.externalPrinterId || firstPrinter.id]);
      }
      if (firstPrinter.kind === 'moonraker') {
        lines.push(['MOONRAKER_BASE_URL', firstPrinter.baseUrl || 'http://127.0.0.1:7125']);
        lines.push(['MOONRAKER_API_KEY', firstPrinter.apiKey]);
      }
      if (firstPrinter.kind === 'snapmaker-u1') {
        lines.push(['SNAPMAKER_BASE_URL', firstPrinter.baseUrl || 'http://127.0.0.1:7125']);
        lines.push(['SNAPMAKER_API_KEY', firstPrinter.apiKey]);
      }
    }

    if (slicerKind === 'command') {
      lines.push(['PRINT_BRIDGE_SLICER_COMMAND', slicerCommand]);
      lines.push(['PRINT_BRIDGE_SLICER_ARGS', slicerArgs]);
      if (slicerProfile) lines.push(['PRINT_BRIDGE_SLICER_PROFILE', slicerProfile]);
    }

    return lines.map(([key, value]) => `${key}=${quoteEnv(value)}`).join('\n');
  }

  function quoteEnv(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  function inlineRunner(): string {
    return [
      'import { loadPrintBridgeConfig, createPrintBridgeFromConfig, redactCredentials } from "./packages/print-bridge/src/config.ts";',
      'import { PrintBridgeClient } from "./packages/print-bridge/src/bridge.ts";',
      'const loaded = createPrintBridgeFromConfig(loadPrintBridgeConfig());',
      'if (!loaded.city) throw new Error("PRINT_BRIDGE_CITY_BASE_URL is required");',
      'const bridge = new PrintBridgeClient({ bridgeId: loaded.config.bridgeId, city: loaded.city, adapters: loaded.adapters, slicer: loaded.slicer, workDir: loaded.config.workDir, pollMs: loaded.config.pollMs, heartbeatMs: loaded.config.heartbeatMs });',
      'console.log(JSON.stringify(redactCredentials(loaded.config), null, 2));',
      'bridge.start();',
      'process.on("SIGINT", () => { bridge.stop(); process.exit(0); });',
    ].join(' ');
  }

  function validateConfig(): string[] {
    const issues: string[] = [];
    if (!bridgeId.trim()) issues.push('Bridge ID is required.');
    if (!cityBaseUrl.trim()) issues.push('City API base URL is required.');
    if (!cityToken.trim()) issues.push('City bridge token is required.');
    for (const printer of printers) {
      if (!printer.id.trim()) issues.push(`${printer.name || 'Printer'} needs a printer ID.`);
      if (printer.kind === 'bambu-lan') {
        if (!printer.host.trim()) issues.push(`${printer.id || 'Bambu printer'} needs a LAN host.`);
        if (!printer.serial.trim()) issues.push(`${printer.id || 'Bambu printer'} needs a serial.`);
        if (!printer.accessCode.trim()) issues.push(`${printer.id || 'Bambu printer'} needs a LAN access code.`);
      }
      if ((printer.kind === 'fdm-monster' || printer.kind === 'moonraker' || printer.kind === 'snapmaker-u1') && !printer.baseUrl.trim()) {
        issues.push(`${printer.id || 'Printer'} needs an adapter base URL.`);
      }
    }
    if (slicerKind === 'command' && !slicerCommand.trim()) issues.push('Command slicer needs a command.');
    return issues;
  }

  function addPrinter(): void {
    printers = [
      ...printers,
      {
        id: `printer-${printers.length + 1}`,
        name: `Printer ${printers.length + 1}`,
        kind: 'bambu-lan',
        host: '',
        serial: '',
        accessCode: '',
        baseUrl: '',
        apiKey: '',
        externalPrinterId: '',
        uploadDirectory: 'cache',
        timeoutMs: 15_000,
      },
    ];
  }

  function removePrinter(index: number): void {
    printers = printers.filter((_, printerIndex) => printerIndex !== index);
  }

  function updatePrinter(index: number, patch: Partial<PrinterDraft>): void {
    printers = printers.map((printer, printerIndex) => printerIndex === index ? { ...printer, ...patch } : printer);
  }

  async function copyText(name: string, text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    copied = name;
    window.setTimeout(() => {
      if (copied === name) copied = '';
    }, 1600);
  }

  async function probeBridge(): Promise<void> {
    bridgeProbe = 'checking';
    probeMessage = '';
    try {
      const response = await fetch(`${cityBaseUrl.replace(/\/$/, '')}/api/admin/print-bridge/heartbeat`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cityToken}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          bridgeId,
          at: new Date().toISOString(),
          printers: printers.map(printer => ({ printerId: printer.id, state: 'idle' })),
        }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text}`);
      bridgeProbe = 'ok';
      probeMessage = text || 'Heartbeat accepted.';
    } catch (error) {
      bridgeProbe = 'failed';
      probeMessage = error instanceof Error ? error.message : String(error);
    }
  }
</script>

<svelte:head>
  <title>Null City Print Bridge</title>
</svelte:head>

<main>
  <aside class="sidebar">
    <div class="brand">
      <span class="mark">NC</span>
      <div>
        <strong>Print Bridge</strong>
        <small>Local service console</small>
      </div>
    </div>

    <nav aria-label="Print bridge sections">
      <button class:active={activeTab === 'setup'} onclick={() => activeTab = 'setup'}>Setup</button>
      <button class:active={activeTab === 'printers'} onclick={() => activeTab = 'printers'}>Printers</button>
      <button class:active={activeTab === 'runtime'} onclick={() => activeTab = 'runtime'}>Runtime</button>
    </nav>

    <div class="status-card">
      <span class={`dot ${missing.length ? 'warn' : 'ok'}`}></span>
      <div>
        <strong>{missing.length ? `${missing.length} required fields` : 'Ready to run'}</strong>
        <small>{printers.length} printer{printers.length === 1 ? '' : 's'} on {bridgeId || 'unset bridge'}</small>
      </div>
    </div>
  </aside>

  <section class="workspace">
    {#if activeTab === 'setup'}
      <header class="page-header">
        <div>
          <p>Bridge identity</p>
          <h1>Connect the LAN service to the city API.</h1>
        </div>
        <button class="primary" disabled={bridgeProbe === 'checking' || missing.length > 0} onclick={probeBridge}>
          {bridgeProbe === 'checking' ? 'Checking...' : 'Test heartbeat'}
        </button>
      </header>

      <div class="grid two">
        <section class="panel">
          <h2>City connection</h2>
          <div class="form-grid">
            <label>Bridge ID <input bind:value={bridgeId} autocomplete="off" /></label>
            <label>City API base URL <input bind:value={cityBaseUrl} autocomplete="off" /></label>
            <label class="wide">Bridge token <input bind:value={cityToken} type="password" autocomplete="off" /></label>
          </div>
        </section>

        <section class="panel">
          <h2>Intervals</h2>
          <div class="form-grid">
            <label>Poll ms <input bind:value={pollMs} type="number" min="1000" step="1000" /></label>
            <label>Heartbeat ms <input bind:value={heartbeatMs} type="number" min="1000" step="1000" /></label>
            <label class="wide">Work directory <input bind:value={workDir} autocomplete="off" /></label>
          </div>
        </section>
      </div>

      {#if probeMessage}
        <pre class={`probe ${bridgeProbe}`}>{probeMessage}</pre>
      {/if}

      {#if missing.length}
        <section class="panel issues">
          <h2>Required before launch</h2>
          <ul>
            {#each missing as issue (issue)}
              <li>{issue}</li>
            {/each}
          </ul>
        </section>
      {/if}
    {/if}

    {#if activeTab === 'printers'}
      <header class="page-header">
        <div>
          <p>Printer adapters</p>
          <h1>Configure the printers this bridge can reach.</h1>
        </div>
        <button class="primary" onclick={addPrinter}>Add printer</button>
      </header>

      <div class="printer-list">
        {#each printers as printer, index (printer.id || index)}
          <section class="panel printer">
            <div class="printer-head">
              <div>
                <h2>{printer.name || printer.id || 'Printer'}</h2>
                <small>{printer.kind} adapter as {printer.id || 'unset id'}</small>
              </div>
              <button disabled={printers.length === 1} onclick={() => removePrinter(index)}>Remove</button>
            </div>

            <div class="form-grid">
              <label>Name <input value={printer.name} oninput={(event) => updatePrinter(index, { name: event.currentTarget.value })} /></label>
              <label>Printer ID <input value={printer.id} oninput={(event) => updatePrinter(index, { id: event.currentTarget.value })} /></label>
              <label>Adapter
                <select value={printer.kind} onchange={(event) => updatePrinter(index, { kind: event.currentTarget.value as AdapterKind })}>
                  <option value="bambu-lan">Bambu LAN</option>
                  <option value="fdm-monster">FDM Monster</option>
                  <option value="moonraker">Moonraker</option>
                  <option value="snapmaker-u1">Snapmaker U1</option>
                  <option value="dry-run">Dry run</option>
                </select>
              </label>

              {#if printer.kind === 'bambu-lan'}
                <label>Host / IP <input value={printer.host} oninput={(event) => updatePrinter(index, { host: event.currentTarget.value })} /></label>
                <label>Serial <input value={printer.serial} oninput={(event) => updatePrinter(index, { serial: event.currentTarget.value })} /></label>
                <label>LAN access code <input type="password" value={printer.accessCode} oninput={(event) => updatePrinter(index, { accessCode: event.currentTarget.value })} /></label>
                <label>Upload directory <input value={printer.uploadDirectory} oninput={(event) => updatePrinter(index, { uploadDirectory: event.currentTarget.value })} /></label>
                <label>Timeout ms <input type="number" value={printer.timeoutMs} oninput={(event) => updatePrinter(index, { timeoutMs: Number(event.currentTarget.value) })} /></label>
              {:else if printer.kind === 'fdm-monster'}
                <label>FDM Monster URL <input value={printer.baseUrl} placeholder="http://127.0.0.1:4000" oninput={(event) => updatePrinter(index, { baseUrl: event.currentTarget.value })} /></label>
                <label>API key <input type="password" value={printer.apiKey} oninput={(event) => updatePrinter(index, { apiKey: event.currentTarget.value })} /></label>
                <label>FDM printer ID <input value={printer.externalPrinterId} oninput={(event) => updatePrinter(index, { externalPrinterId: event.currentTarget.value })} /></label>
              {:else if printer.kind === 'moonraker' || printer.kind === 'snapmaker-u1'}
                <label>Base URL <input value={printer.baseUrl} placeholder="http://127.0.0.1:7125" oninput={(event) => updatePrinter(index, { baseUrl: event.currentTarget.value })} /></label>
                <label>API key <input type="password" value={printer.apiKey} oninput={(event) => updatePrinter(index, { apiKey: event.currentTarget.value })} /></label>
              {/if}
            </div>
          </section>
        {/each}
      </div>

      <section class="panel">
        <h2>Admin printer records</h2>
        <div class="table">
          <div>Name</div>
          <div>Bridge ID</div>
          <div>Printer ID</div>
          <div>Adapter</div>
          {#each adminPrinterRows as row (row.printerId)}
            <strong>{row.name}</strong>
            <code>{row.bridgeId}</code>
            <code>{row.printerId}</code>
            <span>{row.adapter}</span>
          {/each}
        </div>
      </section>
    {/if}

    {#if activeTab === 'runtime'}
      <header class="page-header">
        <div>
          <p>Launch material</p>
          <h1>Generate the local service environment and command.</h1>
        </div>
      </header>

      <section class="panel">
        <div class="panel-title">
          <h2>.env.print-bridge</h2>
          <button onclick={() => copyText('env', envText)}>{copied === 'env' ? 'Copied' : 'Copy'}</button>
        </div>
        <pre>{envText}</pre>
      </section>

      <section class="panel">
        <h2>Slicer</h2>
        <div class="segmented">
          <button class:active={slicerKind === 'dry-run'} onclick={() => slicerKind = 'dry-run'}>Dry run</button>
          <button class:active={slicerKind === 'command'} onclick={() => slicerKind = 'command'}>Command</button>
        </div>
        {#if slicerKind === 'command'}
          <div class="form-grid">
            <label>Command <input bind:value={slicerCommand} placeholder="orca-slicer" /></label>
            <label>Args <input bind:value={slicerArgs} /></label>
            <label class="wide">Profile <input bind:value={slicerProfile} /></label>
          </div>
        {/if}
      </section>

      {#if useAdaptersJson}
        <section class="panel">
          <div class="panel-title">
            <h2>Adapters JSON</h2>
            <button onclick={() => copyText('json', adapterJson)}>{copied === 'json' ? 'Copied' : 'Copy'}</button>
          </div>
          <pre>{adapterJson}</pre>
        </section>
      {/if}

      <section class="panel">
        <div class="panel-title">
          <h2>Run command</h2>
          <button onclick={() => copyText('command', runCommand)}>{copied === 'command' ? 'Copied' : 'Copy'}</button>
        </div>
        <pre>{runCommand}</pre>
      </section>
    {/if}
  </section>
</main>

<style>
  main {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
  }

  .sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    padding: 24px 18px;
    border-right: 1px solid var(--line);
    background: #0b100e;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 26px;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border: 1px solid #365348;
    border-radius: 8px;
    color: var(--green);
    background: #101b17;
    font-weight: 800;
  }

  .brand strong,
  .brand small {
    display: block;
  }

  .brand small,
  .status-card small,
  .printer-head small {
    color: var(--quiet);
  }

  nav {
    display: grid;
    gap: 8px;
  }

  nav button {
    justify-content: flex-start;
    text-align: left;
    padding: 0 12px;
  }

  button.primary {
    border-color: rgba(100, 197, 132, 0.55);
    color: var(--green);
  }

  button.active {
    border-color: #53685f;
    background: #21302a;
    color: var(--ink);
  }

  .status-card {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-top: 22px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
  }

  .dot {
    width: 10px;
    height: 10px;
    margin-top: 4px;
    border-radius: 50%;
  }

  .dot.ok {
    background: var(--green);
  }

  .dot.warn {
    background: var(--gold);
  }

  .workspace {
    min-width: 0;
    padding: 32px;
  }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 24px;
  }

  .page-header p {
    margin: 0 0 8px;
    color: var(--cyan);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  h1,
  h2 {
    margin: 0;
    letter-spacing: 0;
  }

  h1 {
    max-width: 760px;
    font-size: 32px;
    line-height: 1.1;
  }

  h2 {
    font-size: 15px;
  }

  .grid {
    display: grid;
    gap: 16px;
  }

  .grid.two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .panel {
    margin-bottom: 16px;
    padding: 18px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 16px 40px var(--shadow);
  }

  .panel h2 {
    margin-bottom: 16px;
  }

  .panel-title,
  .printer-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 16px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .wide {
    grid-column: 1 / -1;
  }

  .printer-list {
    display: grid;
    gap: 16px;
  }

  .segmented {
    display: inline-grid;
    grid-template-columns: repeat(2, minmax(96px, 1fr));
    gap: 6px;
    padding: 4px;
    margin-bottom: 16px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--field);
  }

  pre {
    overflow: auto;
    margin: 0;
    padding: 14px;
    border: 1px solid #24312c;
    border-radius: 6px;
    background: #070a09;
    color: #dce8df;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .probe {
    margin-bottom: 16px;
  }

  .probe.ok {
    border-color: rgba(100, 197, 132, 0.4);
  }

  .probe.failed,
  .issues {
    border-color: rgba(227, 120, 120, 0.38);
  }

  ul {
    margin: 0;
    padding-left: 18px;
    color: var(--muted);
  }

  li + li {
    margin-top: 6px;
  }

  .table {
    display: grid;
    grid-template-columns: 1.2fr 1.2fr 1fr 1fr;
    gap: 0;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 8px;
  }

  .table > * {
    min-width: 0;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
    color: var(--muted);
  }

  .table > :nth-child(-n + 4) {
    background: var(--panel-2);
    color: var(--ink);
    font-size: 12px;
    font-weight: 800;
  }

  .table > :nth-last-child(-n + 4) {
    border-bottom: 0;
  }

  .table code {
    overflow-wrap: anywhere;
  }

  @media (max-width: 860px) {
    main {
      grid-template-columns: 1fr;
    }

    .sidebar {
      position: static;
      height: auto;
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }

    nav {
      grid-template-columns: repeat(3, 1fr);
    }

    .workspace {
      padding: 20px;
    }

    .page-header,
    .panel-title,
    .printer-head {
      display: grid;
    }

    .grid.two,
    .form-grid {
      grid-template-columns: 1fr;
    }

    .wide {
      grid-column: auto;
    }

    h1 {
      font-size: 24px;
    }

    .table {
      grid-template-columns: 1fr;
    }

    .table > :nth-child(-n + 4) {
      display: none;
    }
  }
</style>
