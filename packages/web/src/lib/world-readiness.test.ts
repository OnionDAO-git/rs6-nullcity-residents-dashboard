import { describe, expect, test } from 'bun:test';
import type { GatewayStatus, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { buildWorldReadiness } from './world-readiness';

const connectedGateway: GatewayStatus = {
  configuredUrl: 'ws://127.0.0.1:43595',
  connected: true,
};

function resident(overrides: Partial<ResidentDashboardRow> = {}): ResidentDashboardRow {
  return {
    name: 'res:hans',
    online: true,
    attention: 64,
    ...overrides,
  };
}

describe('buildWorldReadiness', () => {
  test('blocks the world route until an attendee session is authenticated', () => {
    const summary = buildWorldReadiness({
      authenticated: false,
      gateway: connectedGateway,
      onlineResidents: [resident()],
      gameClientStatus: 'idle',
    });

    expect(summary.status).toBe('blocked');
    expect(summary.headline).toBe('Login required to enter the RuneScape client.');
    expect(summary.checks.map(check => [check.id, check.tone])).toEqual([
      ['session', 'fail'],
      ['gateway', 'ok'],
      ['residents', 'ok'],
      ['client', 'ok'],
    ]);
    expect(summary.nextActions[0]).toBe('Login before starting the embedded RuneScape client.');
    expect(summary.canStartClient).toBe(false);
  });

  test('blocks when the AgentGateway is offline', () => {
    const summary = buildWorldReadiness({
      authenticated: true,
      gateway: { ...connectedGateway, connected: false, lastError: 'connect ECONNREFUSED 127.0.0.1:43595' },
      onlineResidents: [resident()],
      gameClientStatus: 'idle',
    });

    expect(summary.status).toBe('blocked');
    expect(summary.checks.find(check => check.id === 'gateway')).toMatchObject({
      tone: 'fail',
      value: 'offline',
      detail: 'AgentGateway is not connected.',
    });
    expect(summary.nextActions).toContain('Start the controller/game stack so the dashboard can reach the AgentGateway.');
    expect(summary.canStartClient).toBe(false);
  });

  test('blocks world access when attendee login wiring is unavailable', () => {
    const summary = buildWorldReadiness({
      authenticated: false,
      loginUrlReady: false,
      gateway: connectedGateway,
      onlineResidents: [resident()],
      gameClientStatus: 'idle',
    });

    expect(summary.status).toBe('blocked');
    expect(summary.headline).toBe('World route blocked until attendee login is connected.');
    expect(summary.detail).toBe('Ask staff to connect attendee login before using the world route.');
    expect(summary.checks.find(check => check.id === 'session')).toMatchObject({
      tone: 'fail',
      value: 'login unavailable',
      detail: 'Attendee login is not connected for this dashboard environment.',
    });
    expect(summary.nextActions).toContain('Connect attendee login first; world access stays blocked until auth wiring is configured.');
    expect(summary.canStartClient).toBe(false);
  });

  test('watches when no residents are online but lets an authenticated operator start the client', () => {
    const summary = buildWorldReadiness({
      authenticated: true,
      gateway: connectedGateway,
      onlineResidents: [],
      gameClientStatus: 'idle',
    });

    expect(summary.status).toBe('watch');
    expect(summary.headline).toBe('World client can start, but no residents are online.');
    expect(summary.canStartClient).toBe(true);
    expect(summary.checks.find(check => check.id === 'residents')).toMatchObject({
      tone: 'warn',
      value: '0 online',
    });
  });

  test('keeps start disabled while the client runtime is already starting', () => {
    const summary = buildWorldReadiness({
      authenticated: true,
      gateway: connectedGateway,
      onlineResidents: [resident()],
      gameClientStatus: 'starting-runtime',
    });

    expect(summary.status).toBe('watch');
    expect(summary.canStartClient).toBe(false);
    expect(summary.checks.find(check => check.id === 'client')).toMatchObject({
      tone: 'warn',
      value: 'starting runtime',
    });
  });

  test('marks the world ready when login, gateway, residents, and running client are present', () => {
    const summary = buildWorldReadiness({
      authenticated: true,
      gateway: connectedGateway,
      onlineResidents: [resident(), resident({ name: 'res:pip' })],
      gameClientStatus: 'running',
      ticketUser: 'city-demo',
    });

    expect(summary.status).toBe('ready');
    expect(summary.headline).toBe('World session running.');
    expect(summary.canStartClient).toBe(false);
    expect(summary.checks.map(check => [check.id, check.tone, check.value])).toEqual([
      ['session', 'ok', 'attendee'],
      ['gateway', 'ok', 'online'],
      ['residents', 'ok', '2 online'],
      ['client', 'ok', 'running'],
    ]);
    expect(summary.detail).toContain('city-demo');
  });

  test('surfaces client errors as blockers even when the gateway is healthy', () => {
    const summary = buildWorldReadiness({
      authenticated: true,
      gateway: connectedGateway,
      onlineResidents: [resident()],
      gameClientStatus: 'error',
    });

    expect(summary.status).toBe('blocked');
    expect(summary.checks.find(check => check.id === 'client')).toMatchObject({
      tone: 'fail',
      value: 'error',
    });
    expect(summary.nextActions).toContain('Stop and restart the embedded RuneScape client.');
  });
});
