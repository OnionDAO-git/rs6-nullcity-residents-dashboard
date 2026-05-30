import type { ResidentDashboardRow } from '@nullcity-dashboard/shared';

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
