import type { RuntimeReadModel, SpectatorSession } from '@nullcity-dashboard/shared';

export function residentIsOnline(runtime: RuntimeReadModel | undefined, session?: SpectatorSession | undefined): boolean {
  if (runtime?.online === true) return true;
  if (runtime?.online === false) return false;
  return session?.connected === true && session.subject.kind === 'resident';
}
