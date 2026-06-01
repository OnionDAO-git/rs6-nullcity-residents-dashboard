import { cityPath, isKnownCityRoute } from './routes';

export type CityDemoPathTone = 'ok' | 'warn' | 'fail';

export interface CityDemoResidentSignal {
  tone: CityDemoPathTone;
  name?: string;
  path?: string;
  action: string;
  detail: string;
}

export interface CityDemoStorySignal {
  tone: CityDemoPathTone;
  label: string;
  title?: string;
  summary: string;
}

export interface CityDemoApSupportSignal {
  tone: CityDemoPathTone;
  metric: string;
  action: string;
  path: string;
  detail: string;
}

export interface CityDemoPathInput {
  authenticated: boolean;
  loginUrlReady?: boolean;
  residentCount: number;
  onlineResidents: number;
  activeResidents?: number;
  pausedResidents?: number;
  lowApResidents: number;
  apSupport?: CityDemoApSupportSignal;
  demoResident: CityDemoResidentSignal;
  story: CityDemoStorySignal;
}

export interface CityDemoPathStep {
  id: 'city-alive' | 'ap-support' | 'resident-proof' | 'grounded-story';
  tone: CityDemoPathTone;
  label: string;
  metric: string;
  action: string;
  path: string;
  detail: string;
}

export function cityDemoPathSteps(input: CityDemoPathInput): CityDemoPathStep[] {
  const online = Math.max(0, input.onlineResidents);
  const residentCount = Math.max(0, input.residentCount);
  const active = input.activeResidents === undefined ? undefined : Math.max(0, input.activeResidents);
  const paused = input.pausedResidents === undefined ? undefined : Math.max(0, input.pausedResidents);
  const hasCohortCounts = active !== undefined || paused !== undefined;
  const activeCount = active ?? online;
  const supportReady = input.authenticated;
  const loginUrlReady = input.loginUrlReady ?? true;
  const supportUnavailable = !supportReady && !loginUrlReady;
  const lowApResidents = Math.max(0, input.lowApResidents);
  const storyMetric = input.story.title?.trim() || input.story.label;
  const support = supportReady ? input.apSupport : undefined;
  const residentPath = safeDemoPath(input.demoResident.path, '/residents');
  const supportPath = support
    ? safeDemoPath(support.path, '/embassy')
    : supportReady ? '/embassy' : supportUnavailable ? residentPath : '/login';
  const residentLabel = residentProofStepLabel(input.demoResident);

  return [
    {
      id: 'city-alive',
      tone: activeCount > 0 ? 'ok' : 'warn',
      label: 'City alive',
      metric: hasCohortCounts
        ? `${activeCount.toLocaleString()} / ${residentCount.toLocaleString()} active`
        : `${online.toLocaleString()} / ${residentCount.toLocaleString()} online`,
      action: 'Open city overview',
      path: '/overview',
      detail: cityAliveStepDetail({ activeCount, online, paused, hasCohortCounts }),
    },
    {
      id: 'ap-support',
      tone: support?.tone || (supportReady ? lowApResidents > 0 ? 'warn' : 'ok' : 'warn'),
      label: 'Support with AP',
      metric: support?.metric || (supportReady ? `${lowApResidents.toLocaleString()} AP needs` : supportUnavailable ? 'login unavailable' : 'guest'),
      action: support?.action || (supportReady ? 'Open Embassy' : supportUnavailable ? 'Watch resident instead' : 'Login for AP support'),
      path: supportPath,
      detail: support?.detail || (supportReady
        ? 'Embassy funding is ready; profile AP/GP balances are available for support flows.'
        : supportUnavailable
          ? 'Attendee login is not connected; keep the demo moving by watching a resident while staff provides the attendee QR or login link.'
        : 'Sign in before demonstrating AP funding, resident grants, or AP/GP balances.'),
    },
    {
      id: 'resident-proof',
      tone: input.demoResident.tone,
      label: residentLabel,
      metric: displayResidentName(input.demoResident.name) || 'directory',
      action: input.demoResident.action,
      path: residentPath,
      detail: input.demoResident.detail,
    },
    {
      id: 'grounded-story',
      tone: input.story.tone,
      label: 'Read grounded story',
      metric: storyMetric,
      action: 'Open Storyteller',
      path: '/story',
      detail: input.story.summary,
    },
  ];
}

function cityAliveStepDetail(input: {
  activeCount: number;
  online: number;
  paused: number | undefined;
  hasCohortCounts: boolean;
}): string {
  const proofDetail = 'Room-safe overview shows the live city, Storyteller status, and resident roster; use the directory next for names, AP/GP, qmd memory, model, endpoint, and loop proof.';
  if (!input.hasCohortCounts) return proofDetail;

  const pausedCount = input.paused ?? Math.max(0, input.online - input.activeCount);
  return `${input.activeCount.toLocaleString()} controller-held residents are active; ${pausedCount.toLocaleString()} online rows are paused/cohort-excluded. Room-safe overview shows the live city first; use the directory next for names, AP/GP, qmd memory, model, endpoint, and loop proof.`;
}

function displayResidentName(name: string | undefined): string {
  return (name || '').trim().replace(/^res:/i, '');
}

function residentProofStepLabel(resident: CityDemoResidentSignal): string {
  if (resident.tone === 'ok') return 'Watch resident react';
  return displayResidentName(resident.name) ? 'Review resident proof' : 'Wait for residents';
}

function safeDemoPath(path: string | undefined, fallback: string): string {
  const rawPath = (path || '').trim();
  if (!rawPath) return fallback;
  const normalized = cityPath(rawPath);
  return isKnownCityRoute(normalized) ? normalized : fallback;
}
