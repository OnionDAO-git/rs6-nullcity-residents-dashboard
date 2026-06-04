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

function publicProjectorCopy(text: string, options: { hasUrgentAttentionRisk: boolean }): string {
  const copy = prettifyResidentRefs(text)
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
  return options.hasUrgentAttentionRisk ? copy : removeFalseAttentionUrgency(copy);
}

function removeFalseAttentionUrgency(text: string): string {
  return text
    .replace(/\battention warnings rise\b/gi, 'attention reserves hold')
    .replace(/Hans,\s+sitting at 5000 attention,\s+voiced the familiar refrain:\s+an embassy offering could buy more time before the fade clock starts ticking\./gi, 'Hans has 5000 attention, and an embassy offering could still shape what happens next.')
    .replace(/\bHans has 5000 attention,\s+but fade risk becomes real if no one helps\./gi, 'Hans has 5000 attention, and support can still shape what happens next.')
    .replace(/\bbefore the fade clock starts ticking\b/gi, 'while support still has time to matter')
    .replace(/\bbefore fade risk becomes real\b/gi, 'while support still has time to matter')
    .replace(/\bfade risk becomes real\b/gi, 'support still has time to matter')
    .replace(/\bfade clock starts ticking\b/gi, 'support becomes urgent')
    .replace(/\bfade risk\b/gi, 'support timing');
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
