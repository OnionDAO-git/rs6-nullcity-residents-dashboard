import type { GatewayStatus, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import type { GameClientStatus } from '@nullcity-dashboard/game-client';

export type WorldReadinessStatus = 'ready' | 'watch' | 'blocked';
export type WorldReadinessTone = 'ok' | 'warn' | 'fail';

export interface WorldReadinessCheck {
  id: 'session' | 'gateway' | 'residents' | 'client';
  label: string;
  tone: WorldReadinessTone;
  value: string;
  detail: string;
}

export interface WorldReadinessSummary {
  status: WorldReadinessStatus;
  headline: string;
  detail: string;
  checks: WorldReadinessCheck[];
  nextActions: string[];
  canStartClient: boolean;
}

export interface WorldReadinessInput {
  authenticated: boolean;
  gateway?: GatewayStatus | undefined;
  onlineResidents: ResidentDashboardRow[];
  gameClientStatus: GameClientStatus;
  ticketUser?: string;
}

export function buildWorldReadiness(input: WorldReadinessInput): WorldReadinessSummary {
  const checks = [
    sessionCheck(input.authenticated),
    gatewayCheck(input.gateway),
    residentsCheck(input.onlineResidents.length),
    clientCheck(input.gameClientStatus, input.ticketUser),
  ];
  const blockers = checks.filter(check => check.tone === 'fail');
  const status: WorldReadinessStatus = blockers.length ? 'blocked' : checks.some(check => check.tone === 'warn') ? 'watch' : 'ready';
  const canStartClient = input.authenticated && Boolean(input.gateway?.connected) && input.gameClientStatus !== 'error';

  return {
    status,
    headline: headlineFor(status, input),
    detail: detailFor(status, input),
    checks,
    nextActions: nextActionsFor(checks),
    canStartClient,
  };
}

function sessionCheck(authenticated: boolean): WorldReadinessCheck {
  if (!authenticated) {
    return {
      id: 'session',
      label: 'Session',
      tone: 'fail',
      value: 'login required',
      detail: 'The RuneScape client route requires an attendee session.',
    };
  }
  return {
    id: 'session',
    label: 'Session',
    tone: 'ok',
    value: 'attendee',
    detail: 'An authenticated city session can request a game ticket.',
  };
}

function gatewayCheck(gateway: GatewayStatus | undefined): WorldReadinessCheck {
  if (!gateway?.connected) {
    return {
      id: 'gateway',
      label: 'AgentGateway',
      tone: 'fail',
      value: 'offline',
      detail: 'AgentGateway is not connected.',
    };
  }
  return {
    id: 'gateway',
    label: 'AgentGateway',
    tone: 'ok',
    value: 'online',
    detail: 'Dashboard can reach the resident/game gateway.',
  };
}

function residentsCheck(onlineResidents: number): WorldReadinessCheck {
  if (onlineResidents === 0) {
    return {
      id: 'residents',
      label: 'Residents',
      tone: 'warn',
      value: '0 online',
      detail: 'You can enter the client, but no residents are currently visible as online.',
    };
  }
  return {
    id: 'residents',
    label: 'Residents',
    tone: 'ok',
    value: `${onlineResidents.toLocaleString()} online`,
    detail: `${onlineResidents.toLocaleString()} resident${onlineResidents === 1 ? '' : 's'} available to visit or observe.`,
  };
}

function clientCheck(status: GameClientStatus, ticketUser: string | undefined): WorldReadinessCheck {
  if (status === 'error') {
    return {
      id: 'client',
      label: 'Client',
      tone: 'fail',
      value: 'error',
      detail: 'The embedded RuneScape client reported an error.',
    };
  }
  if (status === 'running') {
    return {
      id: 'client',
      label: 'Client',
      tone: 'ok',
      value: 'running',
      detail: ticketUser ? `Session ticket active for ${ticketUser}.` : 'Embedded RuneScape client is running.',
    };
  }
  if (status === 'mounting-canvas' || status === 'requesting-ticket' || status === 'starting-runtime' || status === 'stopping') {
    return {
      id: 'client',
      label: 'Client',
      tone: 'warn',
      value: status.replace(/-/g, ' '),
      detail: 'Client startup or shutdown is in progress.',
    };
  }
  return {
    id: 'client',
    label: 'Client',
    tone: 'warn',
    value: status,
    detail: 'Client is ready to start when the operator presses Start Client.',
  };
}

function headlineFor(status: WorldReadinessStatus, input: WorldReadinessInput): string {
  if (!input.authenticated) return 'Login required to enter the RuneScape client.';
  if (!input.gateway?.connected) return 'RuneScape gateway unavailable.';
  if (input.gameClientStatus === 'error') return 'RuneScape client needs a restart.';
  if (input.onlineResidents.length === 0) return 'World client can start, but no residents are online.';
  if (input.gameClientStatus === 'running') return 'World session running.';
  if (status === 'ready') return 'World route is ready.';
  return 'World route needs a quick operator check.';
}

function detailFor(status: WorldReadinessStatus, input: WorldReadinessInput): string {
  if (!input.authenticated) return 'Authenticate first so the dashboard can request a city game session ticket.';
  if (!input.gateway?.connected) return 'Start the Null City game/controller stack before using the embedded client.';
  if (input.gameClientStatus === 'running') {
    return input.ticketUser ? `Showing the RuneScape client as ${input.ticketUser}.` : 'The embedded RuneScape client is active.';
  }
  if (input.onlineResidents.length === 0) return 'Start or reconnect residents before using this route as a resident demo surface.';
  if (status === 'ready') return 'Press Start Client to enter the RuneScape UI from the dashboard.';
  return 'The dashboard is connected, but one readiness signal is still warming up.';
}

function nextActionsFor(checks: WorldReadinessCheck[]): string[] {
  const actions: string[] = [];
  if (checks.find(check => check.id === 'session' && check.tone === 'fail')) {
    actions.push('Login before starting the embedded RuneScape client.');
  }
  if (checks.find(check => check.id === 'gateway' && check.tone === 'fail')) {
    actions.push('Start the controller/game stack so the dashboard can reach the AgentGateway.');
  }
  if (checks.find(check => check.id === 'residents' && check.tone === 'warn')) {
    actions.push('Start or reconnect at least one resident before presenting the world route.');
  }
  if (checks.find(check => check.id === 'client' && check.tone === 'fail')) {
    actions.push('Stop and restart the embedded RuneScape client.');
  }
  if (actions.length === 0) {
    actions.push('Use Start Client, then switch to a resident detail view if you need their plan/action context.');
  }
  return actions;
}
