import type { ProjectorOverviewSnapshot, ProjectorStoryFrame, ResidentDashboardRow } from '@nullcity-dashboard/shared';
import { toPublicOverviewResident } from './public-overview';

export interface BuildProjectorOverviewSnapshotInput {
  generatedAt: string;
  residents: ResidentDashboardRow[];
  patronAp?: number | undefined;
  projectorFrame?: ProjectorStoryFrame | undefined;
}

export function buildProjectorOverviewSnapshot(input: BuildProjectorOverviewSnapshotInput): ProjectorOverviewSnapshot {
  return {
    generatedAt: input.generatedAt,
    residents: input.residents.map(toPublicOverviewResident),
    ...(input.patronAp !== undefined ? { patronAp: input.patronAp } : {}),
    ...(input.projectorFrame ? { projectorFrame: input.projectorFrame } : {}),
  };
}
