import type { ActiveGoal, EconomyEvent, ResidentEconomy } from './api';

export interface ResidentGoalContractSignal {
  tone: 'ok' | 'warn';
  summary: string;
  detail: string;
}

const MAX_GOAL_TEXT = 88;

export function residentGoalContractSignal(economy: ResidentEconomy | undefined): ResidentGoalContractSignal {
  if (!economy) {
    return {
      tone: 'warn',
      summary: 'Goal contract feed unavailable.',
      detail: 'Controller economy projection has not published active goal contract data yet.',
    };
  }

  const goal = firstGoal(economy.activeGoals);
  const latestEvent = latestEconomyEvent(economy.recentEvents);
  const latestEventLabel = latestEvent ? eventSummary(latestEvent) : 'No recent economy event';

  if (!goal) {
    return {
      tone: 'warn',
      summary: 'No active goal contract published.',
      detail: `AP ${economy.ap.toLocaleString()} · ${latestEventLabel}`,
    };
  }

  if (goal.completion) {
    return {
      tone: 'ok',
      summary: truncateGoal(goal.goalText),
      detail: `Condition: ${goal.completion.condition} · Evidence: ${goal.completion.evidenceSource} · AP ${economy.ap.toLocaleString()} · ${latestEventLabel}`,
    };
  }

  return {
    tone: 'warn',
    summary: truncateGoal(goal.goalText),
    detail: `Aspirational goal without binary completion evidence. AP ${economy.ap.toLocaleString()} · ${latestEventLabel}`,
  };
}

function firstGoal(goals: ActiveGoal[]): ActiveGoal | undefined {
  return goals.find(goal => goal.goalText.trim().length > 0);
}

function truncateGoal(goalText: string): string {
  const text = goalText.trim();
  if (!text) return 'Untitled goal';
  if (text.length <= MAX_GOAL_TEXT) return text;
  return `${text.slice(0, MAX_GOAL_TEXT - 1).trimEnd()}…`;
}

function latestEconomyEvent(events: EconomyEvent[]): EconomyEvent | undefined {
  return [...events].sort((left, right) => toMillis(right.ts) - toMillis(left.ts))[0];
}

function toMillis(ts: string): number {
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventSummary(event: EconomyEvent): string {
  const ap = event.apDelta === undefined ? '' : `${event.apDelta >= 0 ? '+' : ''}${event.apDelta} AP`;
  const gp = event.gpDelta === undefined ? '' : `${event.gpDelta >= 0 ? '+' : ''}${event.gpDelta} GP`;
  const delta = [ap, gp].filter(Boolean).join(' · ');
  return delta ? `${event.kind} (${delta})` : event.kind;
}
