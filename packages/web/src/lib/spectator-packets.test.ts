import { describe, expect, test } from 'bun:test';
import { shouldReplaySpectatorPacket } from './spectator-packets';

describe('shouldReplaySpectatorPacket', () => {
  test('drops volatile player and npc delta packets that crash fresh spectator replays', () => {
    expect(shouldReplaySpectatorPacket(92)).toBe(false);
    expect(shouldReplaySpectatorPacket(128)).toBe(false);
  });

  test('keeps player and npc updates once the spectator has a stable map position', () => {
    const stableReplay = { hasMapBootstrap: true, positionApplied: true };

    expect(shouldReplaySpectatorPacket(92, stableReplay)).toBe(true);
    expect(shouldReplaySpectatorPacket(128, stableReplay)).toBe(true);
  });

  test('keeps map bootstrap packets and ordinary render packets', () => {
    expect(shouldReplaySpectatorPacket(166)).toBe(true);
    expect(shouldReplaySpectatorPacket(23)).toBe(true);
    expect(shouldReplaySpectatorPacket(71)).toBe(true);
  });
});
