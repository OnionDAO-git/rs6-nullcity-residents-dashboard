import type { DashboardOverview, GatewayStatus, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { ResidentReadModel } from './city-api';

const DEFAULT_CITY_OVERVIEW_TIMEOUT_MS = 2500;
const LIVE_RESIDENT_FALLBACK_ERROR = 'City overview unavailable; showing live resident fallback.';

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

export interface ResidentRosterEmptyStateInput {
  loading: boolean;
  hasLiveHints: boolean;
  cityDataError?: string;
  activeResidentCount?: number;
  residentCount?: number;
  gatewayOrControllerConnected?: boolean;
  bridgeAvailable?: boolean;
}

export interface ResidentRosterEmptyState {
  title: string;
  detail: string;
}

export interface ResidentLoopAvailabilityInput {
  hasLiveResident: boolean;
  hasProjectedResident: boolean;
  latestSeenAt?: string;
  latestPostAt?: string;
}

export interface ResidentLoopAvailabilityState {
  tone: 'ok' | 'warn' | 'fail';
  title: string;
  detail: string;
}

export interface CitySnapshotLoaders {
  overview: () => Promise<DashboardOverview>;
  residents: () => Promise<ResidentDashboardRow[]>;
  gatewayStatus: () => Promise<GatewayStatus>;
}

export interface CitySnapshotLoadOptions {
  overviewTimeoutMs?: number;
}

export interface CitySnapshotLoadResult {
  overview: DashboardOverview | undefined;
  gatewayStatus: GatewayStatus | undefined;
  residents: ResidentDashboardRow[];
  error: string;
}

export function residentRouteSlug(name: string): string {
  const normalized = name.trim().toLowerCase();
  return normalized.startsWith('res:') ? normalized.slice(4) : normalized;
}

export function residentLoopAvailabilityState(input: ResidentLoopAvailabilityInput): ResidentLoopAvailabilityState {
  if (input.hasLiveResident) {
    return {
      tone: 'ok',
      title: 'Live resident loop is grounded',
      detail: 'Model, endpoint, SPARK module, goal-plan-action, speech, and story are sourced from the live runtime snapshot.',
    };
  }

  if (input.hasProjectedResident) {
    const refs = [
      input.latestSeenAt ? `latestSeenAt ${input.latestSeenAt}` : '',
      input.latestPostAt ? `latestPostAt ${input.latestPostAt}` : '',
    ].filter(Boolean).join(' | ');

    return {
      tone: 'warn',
      title: 'Live resident loop is temporarily unavailable',
      detail: `Using projected city records only${refs ? ` (${refs})` : ''}.`,
    };
  }

  return {
    tone: 'fail',
    title: 'Resident loop evidence is missing',
    detail: 'No live runtime snapshot or projected city record is available yet.',
  };
}

export function resolveResidentRouteId(input: string, rows: ResidentDashboardRow[]): string {
  const requested = input.trim();
  const requestedSlug = residentRouteSlug(requested);
  const match = rows.find(row => row.name.toLowerCase() === requested.toLowerCase() || residentRouteSlug(row.name) === requestedSlug);
  return match?.name || requested;
}

export function residentRowsForCityDirectory(
  overviewRows: ResidentDashboardRow[] | undefined,
  fallbackRows: ResidentDashboardRow[],
): ResidentDashboardRow[] {
  return overviewRows && overviewRows.length > 0 ? overviewRows : fallbackRows;
}

export function residentRowsNeedLiveFallback(overviewRows: ResidentDashboardRow[] | undefined): boolean {
  return !overviewRows || overviewRows.length === 0;
}

export function cityDataNoticeCopy(error: string): string {
  return error === LIVE_RESIDENT_FALLBACK_ERROR
    ? 'City details are still loading. Live residents are available.'
    : 'City details are still loading. You can still use the actions below.';
}

export async function loadCitySnapshotWithLiveFallback(
  loaders: CitySnapshotLoaders,
  options: CitySnapshotLoadOptions = {},
): Promise<CitySnapshotLoadResult> {
  try {
    const overview = await withTimeout(
      loaders.overview(),
      options.overviewTimeoutMs ?? DEFAULT_CITY_OVERVIEW_TIMEOUT_MS,
      'City overview',
    );
    const residents = overview.residents || [];
    return {
      overview,
      gatewayStatus: overview.gateway,
      residents: residentRowsNeedLiveFallback(overview.residents)
        ? await loaders.residents().catch(() => residents)
        : residents,
      error: '',
    };
  } catch (err) {
    const [fallbackResidents, fallbackGateway] = await Promise.allSettled([
      loaders.residents(),
      loaders.gatewayStatus(),
    ]);
    const residents = fallbackResidents.status === 'fulfilled' ? fallbackResidents.value : [];

    return {
      overview: undefined,
      gatewayStatus: fallbackGateway.status === 'fulfilled' ? fallbackGateway.value : undefined,
      residents,
      error: residents.length > 0
        ? LIVE_RESIDENT_FALLBACK_ERROR
        : err instanceof Error ? err.message : 'City data unavailable',
    };
  }
}

export function findResidentReadModel(rows: ResidentReadModel[], input: string): ResidentReadModel | undefined {
  const requested = input.trim().toLowerCase();
  const requestedSlug = residentRouteSlug(requested);
  return rows.find(row => {
    const ids = [row.id, row.nullcityResidentId, row.displayName].filter(Boolean).map(value => value.toLowerCase());
    return ids.some(value => value === requested || residentRouteSlug(value) === requestedSlug);
  });
}

export function residentDetailEmptyState(input: ResidentDetailEmptyStateInput): ResidentDetailEmptyState {
  if (input.loading) {
    return {
      title: 'Resident page is loading',
      detail: 'Use Watch or Residents while this resident page catches up.',
    };
  }
  if (input.residentCount === 0 && input.hasLiveHints) {
    return {
      title: 'Resident page is catching up',
      detail: 'This resident may still be active. Use Watch or Residents while the page updates.',
    };
  }
  return {
    title: 'Resident not found',
    detail: 'Go back to Residents and choose someone from the current list.',
  };
}

export function residentRosterEmptyState(input: ResidentRosterEmptyStateInput): ResidentRosterEmptyState {
  if (input.loading) {
    return {
      title: 'Resident list is loading',
      detail: 'Use Watch or Residents while residents load.',
    };
  }
  if (!input.hasLiveHints) {
    return {
      title: 'No residents are listed yet',
      detail: 'Open Watch or Residents while residents arrive.',
    };
  }

  if (input.cityDataError) {
    return {
      title: 'Resident list is catching up',
      detail: 'Open Watch or Residents while the resident list updates.',
    };
  }

  if (input.residentCount && input.residentCount > 0) {
    return {
      title: 'Resident list is catching up',
      detail: `${(input.activeResidentCount || 0).toLocaleString()} of ${input.residentCount.toLocaleString()} residents are active right now. Use Watch or Residents while the list updates.`,
    };
  }

  if (input.gatewayOrControllerConnected) {
    return {
      title: 'Resident list is catching up',
      detail: 'The city is responding. Use Watch or Residents while the resident list updates.',
    };
  }

  if (input.bridgeAvailable) {
    return {
      title: 'Resident list is catching up',
      detail: 'The city is responding. Use Watch or Residents while the resident list updates.',
    };
  }

  return {
    title: 'Resident list is catching up',
    detail: 'Residents look active. Use Watch or Residents while the list updates.',
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs)}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
