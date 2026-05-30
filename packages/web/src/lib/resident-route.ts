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

export function residentRosterEmptyState(input: ResidentRosterEmptyStateInput): ResidentRosterEmptyState {
  if (input.loading) {
    return {
      title: 'Resident roster is syncing',
      detail: 'Waiting for the live dashboard snapshot and optional city records.',
    };
  }
  if (!input.hasLiveHints) {
    return {
      title: 'No public residents reported',
      detail: 'Residents appear here after the public dashboard snapshot reports them.',
    };
  }

  if (input.cityDataError) {
    return {
      title: 'Resident roster is syncing',
      detail: `${input.cityDataError}. Story and ops views may still have live resident evidence.`,
    };
  }

  if (input.residentCount && input.residentCount > 0) {
    return {
      title: 'Resident roster is syncing',
      detail: `${(input.activeResidentCount || 0).toLocaleString()} / ${input.residentCount.toLocaleString()} residents are visible through the economy heartbeat while the public roster catches up.`,
    };
  }

  if (input.gatewayOrControllerConnected) {
    return {
      title: 'Resident roster is syncing',
      detail: 'Gateway/controller is connected; the public roster may still be catching up.',
    };
  }

  if (input.bridgeAvailable) {
    return {
      title: 'Resident roster is syncing',
      detail: 'Controller bridge data is present while the public resident roster catches up.',
    };
  }

  return {
    title: 'Resident roster is syncing',
    detail: 'Live resident evidence is present while the public roster catches up.',
  };
}
