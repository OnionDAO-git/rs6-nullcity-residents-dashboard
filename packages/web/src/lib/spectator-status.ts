export function waitingForStableRenderStatus(subjectLabel = 'subject'): string {
  return `following ${subjectLabel || 'subject'}`;
}

export function liveSpectatorStatus(input: { packetCount: number; hasMapBootstrap: boolean; subjectLabel?: string }): string {
  if (input.packetCount <= 0) {
    return waitingForStableRenderStatus(input.subjectLabel);
  }

  return 'RuneScape view live';
}
