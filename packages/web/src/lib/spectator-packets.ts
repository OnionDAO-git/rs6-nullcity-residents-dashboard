const VOLATILE_ENTITY_DELTA_OPCODES = new Set([92, 128]);

export type SpectatorPacketReplayContext = {
  hasMapBootstrap?: boolean;
  positionApplied?: boolean;
};

export function shouldReplaySpectatorPacket(opcode: number, _context: SpectatorPacketReplayContext = {}): boolean {
  return !VOLATILE_ENTITY_DELTA_OPCODES.has(opcode);
}
