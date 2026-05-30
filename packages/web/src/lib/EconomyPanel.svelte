<script lang="ts">
  import { onDestroy } from 'svelte';
  import { api, type ResidentEconomy, type EconomyEvent, type ActiveGoal } from './api';
  import { timeAgo } from './format';

  interface Props {
    /** Full resident id (e.g. `res:agent`) or bare slug. */
    resident: string;
    /** Refresh interval ms. 0 disables polling. */
    refreshMs?: number;
  }

  let { resident, refreshMs = 5000 }: Props = $props();

  let economy: ResidentEconomy | undefined = $state();
  let loading = $state(false);
  let error = $state('');
  let lastFetchedResident = '';
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  async function load(showSpinner = false): Promise<void> {
    if (!resident) return;
    if (showSpinner) loading = true;
    try {
      economy = await api.residentEconomy(resident);
      error = '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Economy unavailable';
    } finally {
      loading = false;
      lastFetchedResident = resident;
    }
  }

  $effect(() => {
    if (resident && resident !== lastFetchedResident) {
      void load(true);
    }
  });

  $effect(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (resident && refreshMs > 0) {
      pollTimer = setInterval(() => void load(false), refreshMs);
    }
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  function formatDelta(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) return '';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toLocaleString()}`;
  }

  function eventDeltaLabel(event: EconomyEvent): string {
    const parts: string[] = [];
    if (event.apDelta !== undefined) parts.push(`${formatDelta(event.apDelta)} AP`);
    if (event.gpDelta !== undefined) parts.push(`${formatDelta(event.gpDelta)} GP`);
    return parts.join(' · ');
  }

  function eventToneClass(event: EconomyEvent): string {
    if ((event.apDelta ?? 0) < 0 || (event.gpDelta ?? 0) < 0) return 'tag warn';
    if ((event.apDelta ?? 0) > 0 || (event.gpDelta ?? 0) > 0) return 'tag ok';
    return 'tag';
  }
</script>

<section class="panel economy-panel" data-testid="economy-panel">
  <div class="row">
    <div class="panel-title">Resident Economy</div>
    {#if loading}
      <span class="tag">loading</span>
    {/if}
  </div>

  {#if error}
    <div class="empty economy-error">{error}</div>
  {/if}

  <div class="economy-balance">
    <div class="metric ap-metric">
      <span>AP</span>
      <strong>{(economy?.ap ?? 0).toLocaleString()}</strong>
    </div>
    <small>Attention Points (resident life-force). Source: runtime-state.json</small>
  </div>

  <div class="panel-subtitle">Recent economy events</div>
  <div class="event-list economy-events">
    {#each economy?.recentEvents ?? [] as event (event.id)}
      <div class="event-row">
        <span class={eventToneClass(event)}>{event.kind}</span>
        <span>
          <strong>{eventDeltaLabel(event) || event.kind}</strong>
          <small>
            {#if event.note}{event.note} · {/if}
            {#if event.ncriId}NCRI {event.ncriId} · {/if}
            {timeAgo(event.ts)} ago
          </small>
        </span>
      </div>
    {:else}
      <div class="empty">No economy events yet</div>
    {/each}
  </div>

  <div class="panel-subtitle">Active goals</div>
  <div class="event-list economy-goals">
    {#each economy?.activeGoals ?? [] as goal (goal.id)}
      <div class="event-row">
        <span class="tag">goal</span>
        <span>
          <strong>{goal.goalText}</strong>
          {#if goal.completion}
            <small>completes when {goal.completion.condition} (evidence: {goal.completion.evidenceSource})</small>
          {:else}
            <small>aspirational — may never complete</small>
          {/if}
        </span>
      </div>
    {:else}
      <div class="empty">No active goals yet</div>
    {/each}
  </div>
</section>

<style>
  .economy-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .economy-balance {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 0.5rem 0;
  }

  .ap-metric strong {
    font-family: 'Space Mono', ui-monospace, monospace;
    font-size: 2rem;
    font-variant-numeric: tabular-nums;
    color: var(--s-gold, #E4B840);
  }

  .ap-metric span {
    text-transform: uppercase;
    font-size: 0.75rem;
    color: var(--text-3, #8A7E6A);
    margin-right: 0.5rem;
  }

  .panel-subtitle {
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: var(--text-3, #8A7E6A);
    margin-top: 0.5rem;
  }

  .economy-error {
    color: var(--s-rose, #D4707A);
  }
</style>
