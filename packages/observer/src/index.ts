import type { Position, SpectatorSubject } from '@nullcity-dashboard/shared';

export interface SpectatorAnchor {
  subject: SpectatorSubject;
  position: Position;
  displayName: string;
  combatLevel?: number;
}

export interface ObserverFrame {
  sessionId: string;
  anchor?: SpectatorAnchor;
  perception?: unknown;
  packet?: { opcode: number; payload: unknown };
}

export function anchorFromPerception(subject: SpectatorSubject, perception: unknown, fallback?: Position): SpectatorAnchor {
  const record = typeof perception === 'object' && perception !== null ? (perception as Record<string, unknown>) : {};
  const resident = typeof record.resident === 'object' && record.resident !== null ? (record.resident as Record<string, unknown>) : {};
  const rawPosition = resident.position || record.position || fallback || { x: 0, y: 0, level: 0 };
  const positionRecord = typeof rawPosition === 'object' && rawPosition !== null ? (rawPosition as Record<string, unknown>) : {};
  return {
    subject,
    displayName: subject.kind === 'resident' ? subject.name : subject.username,
    position: {
      x: Number(positionRecord.x || 0),
      y: Number(positionRecord.y || 0),
      level: Number(positionRecord.level || 0),
    },
  };
}
