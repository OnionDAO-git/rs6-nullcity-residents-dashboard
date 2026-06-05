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
  loginUrlReady?: boolean;
  gateway?: GatewayStatus | undefined;
  onlineResidents: ResidentDashboardRow[];
  gameClientStatus: GameClientStatus;
  ticketUser?: string;
  observeResident?: string;
  observeSessionConnected?: boolean;
}

export function buildWorldReadiness(input: WorldReadinessInput): WorldReadinessSummary {
  const observeResident = normalizeObserveResident(input.observeResident);
  const observeSessionConnected = Boolean(observeResident && input.observeSessionConnected);
  const checks = [
    sessionCheck(input.authenticated, input.loginUrlReady ?? true, observeResident),
    gatewayCheck(input.gateway, observeResident, observeSessionConnected),
    residentsCheck(input.onlineResidents.length, observeResident, observeSessionConnected),
    clientCheck(input.gameClientStatus, input.ticketUser),
  ];
  const blockers = checks.filter(check => check.tone === 'fail');
  const status: WorldReadinessStatus = blockers.length ? 'blocked' : checks.some(check => check.tone === 'warn') ? 'watch' : 'ready';
  const canStartClient =
    (input.authenticated || Boolean(observeResident)) &&
    (Boolean(input.gateway?.connected) || observeSessionConnected) &&
    input.gameClientStatus === 'idle';

  return {
    status,
    headline: headlineFor(status, input, observeResident),
    detail: detailFor(status, input, observeResident),
    checks,
    nextActions: nextActionsFor(checks, input.loginUrlReady ?? true, observeResident),
    canStartClient,
  };
}

function sessionCheck(authenticated: boolean, loginUrlReady: boolean, observeResident: string): WorldReadinessCheck {
  if (observeResident) {
    return {
      id: 'session',
      label: 'Session',
      tone: 'ok',
      value: 'observe mode',
      detail: `Resident observe mode follows ${observeResident} without an attendee game ticket.`,
    };
  }
  if (!authenticated) {
    if (!loginUrlReady) {
      return {
        id: 'session',
        label: 'Session',
        tone: 'fail',
        value: 'login unavailable',
        detail: 'Attendee login is not connected for this dashboard environment.',
      };
    }
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

function gatewayCheck(gateway: GatewayStatus | undefined, observeResident: string, observeSessionConnected: boolean): WorldReadinessCheck {
  if (!gateway?.connected) {
    if (observeResident && observeSessionConnected) {
      return {
        id: 'gateway',
        label: 'AgentGateway',
        tone: 'ok',
        value: 'observing',
        detail: 'A live resident observe session is connected while gateway status refreshes.',
      };
    }
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

function residentsCheck(onlineResidents: number, observeResident = '', observeSessionConnected = false): WorldReadinessCheck {
  if (observeResident && observeSessionConnected) {
    return {
      id: 'residents',
      label: 'Residents',
      tone: 'ok',
      value: 'session online',
      detail: `${observeResident} has an active observe stream.`,
    };
  }
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
  if (status === 'idle') {
    return {
      id: 'client',
      label: 'Client',
      tone: 'ok',
      value: 'ready',
      detail: 'Client runtime is idle and ready to start.',
    };
  }
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
      detail: 'Client startup or shutdown is in progress. Wait before starting again.',
    };
  }
  return {
    id: 'client',
    label: 'Client',
    tone: 'warn',
    value: status,
    detail: 'Client status is unknown. Refresh the page before starting.',
  };
}

function headlineFor(status: WorldReadinessStatus, input: WorldReadinessInput, observeResident: string): string {
  const observeReady = Boolean(observeResident && (input.gateway?.connected || input.observeSessionConnected));
  if (observeReady && status === 'ready') return 'Resident observe mode is ready.';
  if (observeResident && !input.gateway?.connected) return 'RuneScape gateway unavailable.';
  if (!input.authenticated && input.loginUrlReady === false) return 'World route blocked until attendee login is connected.';
  if (!input.authenticated) return 'Login required to enter the RuneScape client.';
  if (!input.gateway?.connected) return 'RuneScape gateway unavailable.';
  if (input.gameClientStatus === 'error') return 'RuneScape client needs a restart.';
  if (input.onlineResidents.length === 0) return 'World client can start, but no residents are online.';
  if (input.gameClientStatus === 'running') return 'World session running.';
  if (status === 'ready') return 'World route is ready.';
  return 'World route needs a quick operator check.';
}

function detailFor(status: WorldReadinessStatus, input: WorldReadinessInput, observeResident: string): string {
  if (observeResident && (input.gateway?.connected || input.observeSessionConnected)) return `Following ${observeResident} through the live RuneScape spectator client.`;
  if (observeResident) return 'Start the Null City game/controller stack before observing a resident in the client.';
  if (!input.authenticated && input.loginUrlReady === false) {
    return 'Ask staff to connect attendee login before using the world route.';
  }
  if (!input.authenticated) return 'Authenticate first so the dashboard can request a city game session ticket.';
  if (!input.gateway?.connected) return 'Start the Null City game/controller stack before using the embedded client.';
  if (input.gameClientStatus === 'running') {
    return input.ticketUser ? `Showing the RuneScape client as ${input.ticketUser}.` : 'The embedded RuneScape client is active.';
  }
  if (input.onlineResidents.length === 0) return 'Start or reconnect residents before using this route as a resident demo surface.';
  if (status === 'ready') return 'Press Start Client to enter the RuneScape UI from the dashboard.';
  return 'The dashboard is connected, but one readiness signal is still warming up.';
}

function nextActionsFor(checks: WorldReadinessCheck[], loginUrlReady: boolean, observeResident: string): string[] {
  const actions: string[] = [];
  if (observeResident && !checks.some(check => check.tone === 'fail')) {
    actions.push(`Open observe mode to follow ${observeResident} in the RuneScape client.`);
    return actions;
  }
  if (checks.find(check => check.id === 'session' && check.tone === 'fail')) {
    if (!loginUrlReady) {
      actions.push('Connect attendee login first; world access stays blocked until auth wiring is configured.');
    } else {
      actions.push('Login before starting the embedded RuneScape client.');
    }
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

function normalizeObserveResident(value: string | undefined): string {
  return (value || '').trim();
}
