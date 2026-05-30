import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';

export interface ResidentDetailEmptyStateInput {
  loading: boolean;
  residentCount: number;
  hasLiveHints: boolean;
  cityDataError?: string;
}

export interface ResidentDetailEmptyState {
  title: string;
  detail: string;
}

export function residentRouteSlug(name: string): string {
  const normalized = name.trim().toLowerCase();
  return normalized.startsWith('res:') ? normalized.slice(4) : normalized;
}

export function resolveResidentRouteId(input: string, rows: ResidentDashboardRow[]): string {
  const requested = input.trim();
  const requestedSlug = residentRouteSlug(requested);
  const match = rows.find(row => row.name.toLowerCase() === requested.toLowerCase() || residentRouteSlug(row.name) === requestedSlug);
  return match?.name || requested;
}

export function residentDetailEmptyState(input: ResidentDetailEmptyStateInput): ResidentDetailEmptyState {
  if (input.loading) {
    return {
      title: 'Resident detail is syncing',
      detail: 'Waiting for the live dashboard snapshot and optional city records.',
    };
  }
  if (input.residentCount === 0 && input.hasLiveHints) {
    return {
      title: 'Live snapshot unavailable for this resident',
      detail: input.cityDataError
        ? `${input.cityDataError}. The resident may still be in ops/debug data while the public city row catches up.`
        : 'The resident may still be in ops/debug data while the public city row catches up.',
    };
  }
  return {
    title: 'Resident not found in public city data',
    detail: 'Check the directory or ops roster for the current resident id.',
  };
}
