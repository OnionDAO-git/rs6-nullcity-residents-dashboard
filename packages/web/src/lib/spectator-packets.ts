const VOLATILE_ENTITY_DELTA_OPCODES = new Set([92, 128]);

export function shouldReplaySpectatorPacket(opcode: number): boolean {
  return !VOLATILE_ENTITY_DELTA_OPCODES.has(opcode);
}
