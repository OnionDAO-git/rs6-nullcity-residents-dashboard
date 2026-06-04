import { refreshProjectorFrameFreshness, type ProjectorOverviewSnapshot, type ProjectorStoryFrame, type ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { toPublicOverviewResident } from './public-overview';
import { publicProjectorCopy } from './public-copy';

export interface BuildProjectorOverviewSnapshotInput {
  generatedAt: string;
  residents: ResidentDashboardRow[];
  patronAp?: number | undefined;
  projectorFrame?: ProjectorStoryFrame | undefined;
}

export function buildProjectorOverviewSnapshot(input: BuildProjectorOverviewSnapshotInput): ProjectorOverviewSnapshot {
  const refreshedFrame = input.projectorFrame ? refreshProjectorFrameFreshness(input.projectorFrame, input.generatedAt) : undefined;
  return {
    generatedAt: input.generatedAt,
    residents: input.residents.map(toPublicOverviewResident),
    ...(input.patronAp !== undefined ? { patronAp: input.patronAp } : {}),
    ...(refreshedFrame ? { projectorFrame: sanitizeProjectorFrame(refreshedFrame) } : {}),
  };
}

function sanitizeProjectorFrame(frame: ProjectorStoryFrame): ProjectorStoryFrame {
  const copy = (text: string) => publicProjectorCopy(text, {
    hasUrgentAttentionRisk: frame.publicHealth.lowApResidents > 0,
  });
  return {
    ...frame,
    narration: {
      ...frame.narration,
      title: copy(frame.narration.title),
      body: copy(frame.narration.body),
      bullets: frame.narration.bullets.map(copy),
    },
    leadEvent: frame.leadEvent ? sanitizeProjectorFrameEvent(frame.leadEvent, copy) : null,
    events: frame.events.map(event => sanitizeProjectorFrameEvent(event, copy)),
    residents: frame.residents.map(resident => ({
      ...resident,
      displayName: copy(resident.displayName),
      ...(resident.goal ? { goal: copy(resident.goal) } : {}),
      ...(resident.latestSpeechSummary ? { latestSpeechSummary: copy(resident.latestSpeechSummary) } : {}),
    })),
    actions: frame.actions.map(action => ({
      ...action,
      label: copy(action.label),
      detail: copy(action.detail),
    })),
    watchNext: frame.watchNext.map(copy),
    publicHealth: {
      ...frame.publicHealth,
      warnings: frame.publicHealth.warnings.map(copy),
    },
  };
}

function sanitizeProjectorFrameEvent(
  event: ProjectorStoryFrame['events'][number],
  copy: (text: string) => string,
): ProjectorStoryFrame['events'][number] {
  return {
    ...event,
    label: copy(event.label),
    note: copy(event.note),
    whyItMatters: copy(event.whyItMatters),
  };
}
