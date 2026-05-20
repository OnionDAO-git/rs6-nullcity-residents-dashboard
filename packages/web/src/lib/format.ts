import type { SpectatorSubject } from '@nullcity-dashboard/shared';

export function subjectLabel(subject: SpectatorSubject): string {
  return subject.kind === 'resident' ? subject.name : subject.username;
}

export function subjectPath(subject: SpectatorSubject): string {
  return subject.kind === 'resident' ? `resident/${encodeURIComponent(subject.name)}` : `player/${encodeURIComponent(subject.username)}`;
}

export function compactJson(value: unknown): string {
  if (value === undefined || value === null) return '-';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function timeAgo(value?: string): string {
  if (!value) return '-';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}
