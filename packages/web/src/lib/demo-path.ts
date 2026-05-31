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

export interface CityDemoPathInput {
  authenticated: boolean;
  residentCount: number;
  onlineResidents: number;
  lowApResidents: number;
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
  const supportReady = input.authenticated;
  const lowApResidents = Math.max(0, input.lowApResidents);
  const storyMetric = input.story.title?.trim() || input.story.label;

  return [
    {
      id: 'city-alive',
      tone: online > 0 ? 'ok' : 'warn',
      label: 'City alive',
      metric: `${online.toLocaleString()} / ${residentCount.toLocaleString()} online`,
      action: 'Open resident directory',
      path: '/residents',
      detail: 'Live residents are visible; use the directory to confirm names, AP, model, endpoint, and loop proof.',
    },
    {
      id: 'ap-support',
      tone: supportReady ? lowApResidents > 0 ? 'warn' : 'ok' : 'warn',
      label: 'Support with AP',
      metric: supportReady ? `${lowApResidents.toLocaleString()} AP needs` : 'guest',
      action: supportReady ? 'Open Embassy' : 'Login for AP support',
      path: supportReady ? '/embassy' : '/login',
      detail: supportReady
        ? 'Embassy funding is ready; profile AP/GP balances are available for support flows.'
        : 'Sign in before demonstrating AP funding, resident grants, or AP/GP balances.',
    },
    {
      id: 'resident-proof',
      tone: input.demoResident.tone,
      label: 'Watch resident react',
      metric: displayResidentName(input.demoResident.name) || 'directory',
      action: input.demoResident.action,
      path: input.demoResident.path || '/residents',
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

function displayResidentName(name: string | undefined): string {
  return (name || '').trim().replace(/^res:/i, '');
}
