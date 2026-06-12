import { describe, expect, test } from 'bun:test';
import { shouldReplaySpectatorPacket } from './spectator-packets';

describe('shouldReplaySpectatorPacket', () => {
  test('drops volatile player and npc delta packets that crash fresh spectator replays', () => {
    expect(shouldReplaySpectatorPacket(92)).toBe(false);
    expect(shouldReplaySpectatorPacket(128)).toBe(false);
  });

  test('keeps player and npc updates blocked even after map position until actor bootstrap exists', () => {
    const stableReplay = { hasMapBootstrap: true, positionApplied: true };

    expect(shouldReplaySpectatorPacket(92, stableReplay)).toBe(false);
    expect(shouldReplaySpectatorPacket(128, stableReplay)).toBe(false);
  });

  test('keeps map bootstrap packets and ordinary render packets', () => {
    expect(shouldReplaySpectatorPacket(166)).toBe(true);
    expect(shouldReplaySpectatorPacket(23)).toBe(true);
    expect(shouldReplaySpectatorPacket(71)).toBe(true);
  });
});
