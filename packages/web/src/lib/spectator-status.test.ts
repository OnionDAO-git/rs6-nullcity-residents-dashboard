import { describe, expect, test } from 'bun:test';
import { liveSpectatorStatus, waitingForStableRenderStatus } from './spectator-status';

describe('spectator status copy', () => {
  test('keeps volatile packet skips from changing the visible status line', () => {
    expect(waitingForStableRenderStatus('res:qa-cook')).toBe('following res:qa-cook');
    expect(liveSpectatorStatus({ packetCount: 0, hasMapBootstrap: false, subjectLabel: 'res:qa-cook' })).toBe('following res:qa-cook');
  });

  test('summarizes render progress without opcode chatter once packets replay', () => {
    expect(liveSpectatorStatus({ packetCount: 7, hasMapBootstrap: true, subjectLabel: 'res:qa-cook' })).toBe('RuneScape view live');
    expect(liveSpectatorStatus({ packetCount: 1, hasMapBootstrap: false, subjectLabel: 'res:hans' })).toBe('RuneScape view live');
  });
});
