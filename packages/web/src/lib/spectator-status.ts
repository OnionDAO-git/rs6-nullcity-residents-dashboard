export function waitingForStableRenderStatus(subjectLabel = 'subject'): string {
  return `following ${subjectLabel || 'subject'}`;
}

export function liveSpectatorStatus(input: { packetCount: number; hasMapBootstrap: boolean; subjectLabel?: string; positionApplied?: boolean }): string {
  if (input.packetCount <= 0) {
    return waitingForStableRenderStatus(input.subjectLabel);
  }

  if (!input.hasMapBootstrap) {
    return `${waitingForStableRenderStatus(input.subjectLabel)}; waiting for map bootstrap`;
  }

  if (input.positionApplied === false) {
    return `${waitingForStableRenderStatus(input.subjectLabel)}; waiting for map position`;
  }

  return 'RuneScape view live';
}
