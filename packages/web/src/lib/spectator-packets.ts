const VOLATILE_ENTITY_DELTA_OPCODES = new Set([92, 128]);

export type SpectatorPacketReplayContext = {
  hasMapBootstrap?: boolean;
  positionApplied?: boolean;
};

export function shouldReplaySpectatorPacket(opcode: number, context: SpectatorPacketReplayContext = {}): boolean {
  if (!VOLATILE_ENTITY_DELTA_OPCODES.has(opcode)) return true;
  return context.hasMapBootstrap === true && context.positionApplied === true;
}
