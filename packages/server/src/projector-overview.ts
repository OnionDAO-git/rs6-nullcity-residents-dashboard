import { refreshProjectorFrameFreshness, type ProjectorOverviewSnapshot, type ProjectorStoryFrame, type ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { toPublicOverviewResident } from './public-overview';

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
  return {
    ...frame,
    narration: {
      ...frame.narration,
      title: publicProjectorCopy(frame.narration.title),
      body: publicProjectorCopy(frame.narration.body),
      bullets: frame.narration.bullets.map(publicProjectorCopy),
    },
    leadEvent: frame.leadEvent ? sanitizeProjectorFrameEvent(frame.leadEvent) : null,
    events: frame.events.map(sanitizeProjectorFrameEvent),
    residents: frame.residents.map(resident => ({
      ...resident,
      displayName: publicProjectorCopy(resident.displayName),
      ...(resident.goal ? { goal: publicProjectorCopy(resident.goal) } : {}),
      ...(resident.latestSpeechSummary ? { latestSpeechSummary: publicProjectorCopy(resident.latestSpeechSummary) } : {}),
    })),
    actions: frame.actions.map(action => ({
      ...action,
      label: publicProjectorCopy(action.label),
      detail: publicProjectorCopy(action.detail),
    })),
    watchNext: frame.watchNext.map(publicProjectorCopy),
    publicHealth: {
      ...frame.publicHealth,
      warnings: frame.publicHealth.warnings.map(publicProjectorCopy),
    },
  };
}

function sanitizeProjectorFrameEvent(event: ProjectorStoryFrame['events'][number]): ProjectorStoryFrame['events'][number] {
  return {
    ...event,
    label: publicProjectorCopy(event.label),
    note: publicProjectorCopy(event.note),
    whyItMatters: publicProjectorCopy(event.whyItMatters),
  };
}

function publicProjectorCopy(text: string): string {
  return prettifyResidentRefs(text)
    .replace(/\bWill\s+([A-Z][A-Za-z0-9' -]+?)\s+NPC\s+spawn\s+and\s+allow\s+(?:the\s+)?agent\s+to\s+acquire\s+axe\?/gi, (_match, name: string) => `Whether ${name.trim()} appears and lets The Steward get an axe.`)
    .replace(/\bthe\s+agent's\b/gi, "The Steward's")
    .replace(/\bthe\s+agent\b/gi, 'The Steward')
    .replace(/\bagent's\b/gi, "The Steward's")
    .replace(/\bagent\b/gi, 'The Steward')
    .replace(/\bthe\s+([A-Z][A-Za-z0-9'-]*(?:\s+[A-Z][A-Za-z0-9'-]*)*)\s+NPC\b/g, '$1')
    .replace(/\b([A-Z][A-Za-z0-9'-]*(?:\s+[A-Z][A-Za-z0-9'-]*)*)\s+NPC\b/g, '$1')
    .replace(/\bNPCs\b/g, 'Characters')
    .replace(/\bnpcs\b/g, 'characters')
    .replace(/\bNPC\b/g, 'character')
    .replace(/\bnpc\b/g, 'character')
    .replace(/\bspawns\b/gi, 'appears')
    .replace(/\bspawn\b/gi, 'appear')
    .replace(/\bto materialize\b/gi, 'to appear')
    .replace(/\bmaterialize\b/gi, 'appear')
    .replace(/\bAP\b/g, 'attention')
    .replace(/\bGP\b/g, 'RuneScape gold')
    .replace(/\bNCRI\b/g, 'special item');
}

function prettifyResidentRefs(text: string): string {
  return text
    .replace(/\bres:([a-z0-9_-]+)/gi, (_match, slug: string) => displayName(`res:${slug}`))
    .replace(/\bQa\b/g, 'QA')
    .replace(/\bGp\b/g, 'GP')
    .replace(/\bAp\b/g, 'AP')
    .replace(/\bNcri\b/g, 'NCRI');
}

function displayName(name: string): string {
  const slug = name.replace(/^res:/i, '');
  if (slug === 'agent') return 'The Steward';
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.toLowerCase() === 'qa' ? 'QA' : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
