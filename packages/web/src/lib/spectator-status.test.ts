import { describe, expect, test } from 'bun:test';
import { liveSpectatorStatus, waitingForStableRenderStatus } from './spectator-status';

describe('spectator status copy', () => {
  test('keeps volatile packet skips from changing the visible status line', () => {
    expect(waitingForStableRenderStatus('res:qa-cook')).toBe('following res:qa-cook');
    expect(liveSpectatorStatus({ packetCount: 0, hasMapBootstrap: false, subjectLabel: 'res:qa-cook' })).toBe('following res:qa-cook');
  });

  test('waits for map bootstrap and resident position before calling the client live', () => {
    expect(liveSpectatorStatus({ packetCount: 7, hasMapBootstrap: false, subjectLabel: 'res:hans', positionApplied: false })).toBe('following res:hans; waiting for map bootstrap');
    expect(liveSpectatorStatus({ packetCount: 7, hasMapBootstrap: true, subjectLabel: 'res:hans', positionApplied: false })).toBe('following res:hans; waiting for map position');
  });

  test('summarizes render progress without opcode chatter once packets replay and position applies', () => {
    expect(liveSpectatorStatus({ packetCount: 7, hasMapBootstrap: true, subjectLabel: 'res:qa-cook', positionApplied: true })).toBe('RuneScape view live');
  });
});
