import { describe, expect, test } from 'bun:test';
import { shouldReplaySpectatorPacket } from './spectator-packets';

describe('shouldReplaySpectatorPacket', () => {
  test('drops volatile player and npc delta packets that crash late spectator replays', () => {
    expect(shouldReplaySpectatorPacket(92)).toBe(false);
    expect(shouldReplaySpectatorPacket(128)).toBe(false);
  });

  test('keeps map bootstrap packets and ordinary render packets', () => {
    expect(shouldReplaySpectatorPacket(166)).toBe(true);
    expect(shouldReplaySpectatorPacket(23)).toBe(true);
    expect(shouldReplaySpectatorPacket(71)).toBe(true);
  });
});
