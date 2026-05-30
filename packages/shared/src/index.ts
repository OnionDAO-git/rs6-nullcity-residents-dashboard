export const AGENT_PROTOCOL_VERSION = 1;

export type ResidentFilter = 'online' | 'offline' | 'all';
export type DisconnectPolicy = 'logout' | 'idle';
export type SpectatorMode = 'follow' | 'free-camera' | 'picture-in-picture';
export type SpectatorPacketType = 'FIXED' | 'DYNAMIC_SMALL' | 'DYNAMIC_LARGE';

export type SpectatorSubject =
  | { kind: 'resident'; name: string }
  | { kind: 'player'; username: string };

export interface AgentFrame<TKind extends string = string, TPayload = unknown> {
  v: 1;
  id?: string | number;
  kind: TKind;
  payload: TPayload;
}

export interface ResidentSummary {
  name: string;
  online: boolean;
  controllerId?: string;
  controlHeld?: boolean;
}

export interface ResidentAppearance {
  gender: number;
  head: number;
  torso: number;
  arms: number;
  legs: number;
  hands: number;
  feet: number;
  facialHair: number;
  hairColor: number;
  torsoColor: number;
  legColor: number;
  feetColor: number;
  skinColor: number;
}

export interface Position {
  x: number;
  y: number;
  level: number;
}

export interface ObservableSubjectSummary {
  subject: SpectatorSubject;
  online: boolean;
  position?: Position;
}

export interface RuntimeState {
  resident: string;
  attention: number;
  tick: number;
  legacy: {
    kind: string;
    progress: Record<string, unknown>;
    complete: boolean;
  };
  budgets: {
    minuteStartedAt: string;
    dayStartedAt: string;
    requestsThisMinute: number;
    requestsToday: number;
    lastTick?: number;
    requestsThisTick?: number;
    noInferenceUntil?: string;
  };
  variables?: Record<string, number>;
  hookCooldowns?: Record<string, number>;
  shadowedHooks?: Array<{ tick: number; id: string; priority: number; shadowedBy: string }>;
  cognition?: Record<string, unknown>;
  previousIntent?: unknown;
  deceased?: { date: string; tick: number; cause: string };
}

export type ActionSource = 'thinking' | 'nervous-system' | 'body' | 'manual';

export interface PerceptionFeedSummary {
  attached: boolean;
  tick?: number;
  ageMs?: number;
  lastFeedAt?: string;
  position?: Position;
  hp?: { current: number; max: number };
  inCombat?: boolean;
  busy?: boolean;
  nearby: {
    players: number;
    npcs: number;
    objects: number;
    worldItems: number;
  };
  events: number;
  availableActions: number;
  latestEventKind?: string;
  latestEventText?: string;
}

export interface ActionLogEntry {
  t?: string;
  tick?: number;
  action?: unknown;
  result?: unknown;
  source?: ActionSource;
  ruleId?: string;
  cause?: string;
  perception?: unknown;
  [key: string]: unknown;
}

export interface InferenceLogEntry {
  t?: string;
  requestId?: string;
  resident?: string;
  status?: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  cause?: string;
  [key: string]: unknown;
}

export interface SparkModuleSummary {
  id: string;
  version?: string;
  config?: Record<string, unknown>;
  source: 'soul' | 'runtime-state' | 'inference-log' | 'action-log';
  activeFacets: string[];
  lastSeenAt?: string;
}

export interface SparkRuntimeSummary {
  modules: SparkModuleSummary[];
  activeModule?: SparkModuleSummary;
}

export interface ResidentStackSummary {
  soulId?: string;
  soulTitle?: string;
  soulFile?: string;
  model?: InferenceProfileSummary;
  behaviorKind?: string;
  brain?: InferenceProfileSummary;
  body?: InferenceProfileSummary;
  configuredModules: SparkModuleSummary[];
  activeModule?: SparkModuleSummary;
}

export interface ResidentActionSummary {
  kind?: string;
  cause?: string;
  result?: string;
  tick?: number;
  source?: ActionSource;
  ruleId?: string;
}

export interface ResidentEventSummary {
  kind?: string;
  tick?: number;
  text?: string;
  at?: string;
}

export interface RecentLetterSummary {
  id: string;
  kind: string;
  subject: string;
  recipient: string;
  senderResident?: string;
  dispatchedAt?: string;
  deliveryChannels: string[];
}

export type PatronStandingTier = 'stranger' | 'acquaintance' | 'ally' | 'officer';

export interface PatronStandingSummary {
  faction: string;
  points: number;
  tier: PatronStandingTier;
  nextTier?: Exclude<PatronStandingTier, 'stranger'>;
  pointsToNext?: number;
}

export interface PatronDashboardSummary {
  id: string;
  handle: string;
  balance: number;
  standing: PatronStandingSummary[];
  lastActivityAt?: string;
}

export interface PatronActivitySummary {
  totalPatrons: number;
  totalShardBalance: number;
  totalStandingPoints: number;
  tierCounts: Record<PatronStandingTier, number>;
  patrons: PatronDashboardSummary[];
}

export interface ResidentRelationshipSummary {
  resident: string;
  patrons: number;
  patronEvents: number;
  peerRelationships: number;
  peerEvents: number;
  peerInteractions: number;
  latestEventAt?: string;
  latestEventKind?: string;
  latestEventTick?: number;
}

export interface RelationshipActivitySummary {
  residentsWithRelationships: number;
  totalPatrons: number;
  totalPatronEvents: number;
  totalPeerRelationships: number;
  totalPeerEvents: number;
  totalPeerInteractions: number;
  residents: ResidentRelationshipSummary[];
}

export interface ResidentProgressSample {
  ts?: string;
  tick?: number;
  meaningful: boolean;
  reasons: string[];
  stuckSince?: number | null;
}

export interface ResidentProgressSummary {
  sessionId?: string;
  progressPath?: string;
  samples: number;
  latest?: ResidentProgressSample;
  latestMeaningful?: ResidentProgressSample;
  stuckTicks?: number;
}

export type StoryArcPhase = 'pitch' | 'fund' | 'progress' | 'resolve' | 'letter';

export interface StoryArcEvidenceSummary {
  pitches: number;
  fundingEvents: number;
  progressEvents: number;
  resolutionEvents: number;
  letterEvents: number;
}

export interface StoryArcDashboardSummary {
  phase: StoryArcPhase;
  summary?: string;
  startedAtTick?: number;
  latestEventTick?: number;
  latestEventKind?: string;
  evidence?: StoryArcEvidenceSummary;
}

export interface ResidentSavedSkill {
  level: number;
  xp: number;
  modifiedLevel?: number;
}

export interface ResidentSavedState {
  appearance?: ResidentAppearance;
  inventory?: unknown[];
  equipment?: unknown[];
  skills?: Record<string, ResidentSavedSkill>;
}

export interface RuntimeReadModel {
  available: boolean;
  online: boolean;
  state?: RuntimeState;
  thinking: {
    mode: 'idle' | 'executing' | 'deciding' | 'offline' | 'unknown';
    activePlan?: string;
    previousIntent?: unknown;
    inFlightRequest?: string;
    lastInferenceCause?: string;
    hooksMarkdown?: string;
    latestInference?: InferenceLogEntry;
  };
  nervous: {
    activeRules?: number;
    rulesMarkdown?: string;
    lastReaction?: string;
    lastRuleId?: string;
    lastSuppressedThinking?: boolean;
    lastInterruptedThinking?: boolean;
    cooldowns?: Record<string, number>;
  };
  body: {
    controlHeld: boolean;
    controllerId?: string;
    feed?: PerceptionFeedSummary;
    perceptionAgeMs?: number;
    position?: Position;
    latestPerception?: unknown;
    latestEvent?: unknown;
    perceptionTick?: number;
    lastFeedAt?: string;
    lastAction?: ResidentActionSummary;
    lastActionSource?: ActionSource;
    gatewayHealthy?: boolean;
    saved?: ResidentSavedState;
  };
  spark?: SparkRuntimeSummary;
  stack?: ResidentStackSummary;
  progress?: ResidentProgressSummary;
  storyArc?: StoryArcDashboardSummary;
  memory: {
    indexMarkdown?: string;
    files: string[];
  };
  logs: {
    actions: ActionLogEntry[];
    inference: InferenceLogEntry[];
  };
  errors: string[];
}

export interface ResidentDashboardRow {
  name: string;
  online: boolean;
  controllerId?: string;
  position?: Position;
  hp?: { current: number; max: number };
  inCombat?: boolean;
  busy?: boolean;
  attention?: number;
  legacy?: RuntimeState['legacy'];
  budgets?: RuntimeState['budgets'];
  variables?: Record<string, number>;
  thinking?: RuntimeReadModel['thinking'];
  nervous?: RuntimeReadModel['nervous'];
  body?: RuntimeReadModel['body'];
  feed?: PerceptionFeedSummary;
  spark?: SparkRuntimeSummary;
  stack?: ResidentStackSummary;
  progress?: ResidentProgressSummary;
  storyArc?: StoryArcDashboardSummary;
  lastEvent?: ResidentEventSummary;
  activeTrade?: unknown;
  errors?: string[];
}

export interface GatewayStatus {
  configuredUrl: string;
  connected: boolean;
  allowDelete?: boolean;
  lastConnectedAt?: string;
  lastDisconnectedAt?: string;
  lastError?: string;
}

export interface ControllerStatus {
  available: boolean;
  memoryRoot: string;
  logsRoot: string;
  soulsRoot: string;
  residentsWithRuntime: number;
  lastError?: string;
}

export type ReadinessLevel = 'ok' | 'warn' | 'fail';

export interface ReadinessCheckSummary {
  id: string;
  label: string;
  level: ReadinessLevel;
  detail: string;
  count?: number;
}

export interface EventReadinessSummary {
  level: ReadinessLevel;
  updatedAt: string;
  checks: ReadinessCheckSummary[];
}

export interface DashboardOverview {
  gateway: GatewayStatus;
  controller: ControllerStatus;
  residents: ResidentDashboardRow[];
  recentEvents: ResidentEventSummary[];
  recentLetters: RecentLetterSummary[];
  patrons?: PatronActivitySummary;
  relationships?: RelationshipActivitySummary;
  readiness?: EventReadinessSummary;
}

export type BenchmarkRunStatus = 'passed' | 'failed' | 'timeout' | 'error' | 'cancelled';
export type BenchmarkRunMode = 'scripted' | 'autonomous';

export interface BenchmarkIdentity {
  id: string;
  version?: string;
}

export interface BenchmarkCommit {
  repo: string;
  sha: string;
  branch?: string;
  dirty?: boolean;
}

export interface BenchmarkActionAttemptEvidence {
  requestId?: string;
  actionKind: string;
  source?: string;
  cause?: string;
  ok?: boolean;
  finalStatus?: string;
  finalReason?: string;
  evidenceCount?: number;
  effectEvidenceCount?: number;
  sparkModule?: BenchmarkIdentity;
  [key: string]: unknown;
}

export interface BenchmarkEvidence {
  actionAttemptIds?: string[];
  actionAttempts?: BenchmarkActionAttemptEvidence[];
  inferenceRequestIds?: string[];
  inferenceRequests?: unknown[];
  perceptionIds?: string[];
  summaries?: string[];
  artifactPaths?: string[];
  [key: string]: unknown;
}

export interface BenchmarkArtifactSummary {
  file: string;
  runId: string;
  task: BenchmarkIdentity;
  module: BenchmarkIdentity;
  mode: BenchmarkRunMode;
  resident: string;
  modelProfile?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  status: BenchmarkRunStatus;
  score: number;
  metrics: Record<string, number>;
  failureReason?: string;
  generatedAt?: string;
}

export interface BenchmarkArtifact extends Omit<BenchmarkArtifactSummary, 'file'> {
  schemaVersion?: number;
  commits: BenchmarkCommit[];
  evidence: BenchmarkEvidence;
}

export interface BenchmarkTaskLeaderboardRow {
  taskId: string;
  runs: number;
  passed: number;
  averageScore: number;
}

export interface BenchmarkLeaderboardRow {
  module: BenchmarkIdentity;
  runs: number;
  taskCount: number;
  passed: number;
  nonPassed: number;
  passRate: number;
  averageScore: number;
  autonomousRuns: number;
  averageDurationMs?: number;
  safetyIncidents: number;
  cleanupFailures: number;
  inferenceRequests: number;
  latestRunAt?: string;
  tasks: BenchmarkTaskLeaderboardRow[];
}

export interface SoulSummary {
  id: string;
  file: string;
  title: string;
  orientationGoal?: {
    id?: string;
    description: string;
    tier?: string;
  };
  model?: {
    endpoint?: string;
    model?: string;
    temperature?: number;
  };
  behavior?: {
    kind?: string;
    brain?: InferenceProfileSummary;
    body?: InferenceProfileSummary;
  };
  modules?: SparkModuleSummary[];
  attentionProfile?: unknown;
  variables?: Record<string, unknown>;
  hooks?: unknown[];
  nervousRules?: unknown[];
  legacyKind?: string;
  errors: string[];
}

export interface InferenceProfileSummary {
  endpoint?: string;
  model?: string;
  temperature?: number;
  thinking?: boolean;
}

export interface CreateResidentSoulOptions {
  sourceSoulFile?: string;
  endpoint?: string;
  model?: string;
  temperature?: number;
  autonomous?: boolean;
}

export interface SpectatorSession {
  id: string;
  subject: SpectatorSubject;
  mode: SpectatorMode;
  connected: boolean;
  position?: Position;
  regionId?: number;
  latestPerception?: unknown;
  packets?: SpectatorPacket[];
  lastEventAt?: string;
  error?: string;
}

export interface SpectatorPacket {
  opcode: number;
  payload: SpectatorRsPacketFrame;
  receivedAt: string;
}

export interface SpectatorRsPacketFrame {
  opcode: number;
  type: SpectatorPacketType;
  updateTask: boolean;
  payloadLength: number;
  payloadBase64: string;
  frameLength: number;
  frameBase64: string;
}

export type ClientMessage =
  | AgentFrame<'auth', { token?: string }>
  | AgentFrame<'controller_hello', { controllerId: string; version: string; capabilities?: string[] }>
  | AgentFrame<'gateway_status', Record<string, never>>
  | AgentFrame<'list_residents', { filter?: ResidentFilter }>
  | AgentFrame<'list_observable_subjects', { includeResidents?: boolean; includePlayers?: boolean }>
  | AgentFrame<'observe_subject', { subject: SpectatorSubject; mode?: SpectatorMode }>
  | AgentFrame<'unobserve_subject', { sessionId: string }>
  | AgentFrame<
      'create_resident',
      {
        name: string;
        spawnPosition?: { x: number; y: number; level?: number };
        appearance?: ResidentAppearance;
        initialInventory?: unknown[];
        initialEquipment?: unknown[];
      }
    >
  | AgentFrame<'connect_resident', { name: string; observe?: boolean; control?: boolean; onDisconnect?: DisconnectPolicy }>
  | AgentFrame<'attach', { name: string; observe?: boolean; control?: boolean }>
  | AgentFrame<'submit_action', { name: string; action: unknown }>
  | AgentFrame<'detach', { name: string }>
  | AgentFrame<'disconnect_resident', { name: string; cause?: string }>
  | AgentFrame<'pause_resident', { name: string; cause?: string }>
  | AgentFrame<'delete_resident', { name: string }>;

export type ServerMessage =
  | AgentFrame<'gateway_status', { allowDelete: boolean }>
  | AgentFrame<'resident_list', { residents: ResidentSummary[] }>
  | AgentFrame<'observable_subject_list', { subjects: ObservableSubjectSummary[] }>
  | AgentFrame<'resident_created', { resident: ResidentSummary }>
  | AgentFrame<'resident_connected', { resident: ResidentSummary; perception: unknown | null }>
  | AgentFrame<'resident_disconnected', { name: string; cause?: string }>
  | AgentFrame<'resident_paused', { name: string; cause?: string }>
  | AgentFrame<'spectator_connected', { sessionId: string; subject: SpectatorSubject; initialState: unknown }>
  | AgentFrame<'spectator_rebuild', { sessionId: string; payload: unknown }>
  | AgentFrame<'spectator_packet', { sessionId: string; opcode: number; payload: SpectatorRsPacketFrame }>
  | AgentFrame<'spectator_perception', { sessionId: string; perception: unknown; position?: Position; regionId?: number }>
  | AgentFrame<'spectator_disconnected', { sessionId: string; cause?: string }>
  | AgentFrame<'perception', { resident_id: string; perception: unknown }>
  | AgentFrame<'action_result', { resident_id: string; request_id?: string | number; result: unknown; cause?: string }>
  | AgentFrame<'event', { resident_id: string; event: unknown }>
  | AgentFrame<'ok', { ok: true }>
  | AgentFrame<'error', { request_id?: string | number; code: string; message: string; cause?: string }>;

export function makeFrame<TKind extends ClientMessage['kind']>(
  kind: TKind,
  payload: Extract<ClientMessage, { kind: TKind }>['payload'],
  id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
): Extract<ClientMessage, { kind: TKind }> {
  return { v: AGENT_PROTOCOL_VERSION, id, kind, payload } as Extract<ClientMessage, { kind: TKind }>;
}

export function subjectKey(subject: SpectatorSubject): string {
  return subject.kind === 'resident' ? `resident:${subject.name}` : `player:${subject.username}`;
}

export type DashboardFactionId = 'foundry' | 'bureau-of-continuity' | 'ledger' | 'veil';
export type DashboardVisualTreatment = 'standard' | 'redacted';

export interface FactionUiMetadata {
  readonly id: DashboardFactionId;
  readonly displayName: string;
  readonly color: string;
  readonly accentColor?: string;
  readonly wallColor: string;
  readonly visualTreatment: DashboardVisualTreatment;
}

export interface ModuleUiMetadata {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly owner?: string;
  readonly risk?: 'core' | 'reviewed' | 'experimental';
  readonly capabilities: readonly string[];
}

export interface EmotionPresetUiMetadata {
  readonly id: 'stillness' | 'reverie' | 'unease' | 'anguish' | 'fury';
  readonly label: string;
  readonly color: string;
  readonly weight: number;
}

export type CityPointResource = 'AP' | 'GP';

export interface CitySessionUser {
  id: string;
  landingUserId: string;
  email?: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
  isAdmin: boolean;
  roles?: Array<'attendee' | 'admin'>;
  profileClaimed?: boolean;
}

export interface CitySessionResponse {
  authenticated: boolean;
  loginUrl: string;
  logoutUrl?: string;
  user?: CitySessionUser;
  points?: CityPointBalance[];
}

export interface CityPointBalance {
  resource: CityPointResource;
  balance: number;
  pending?: number;
  updatedAt?: string;
}

export interface CityPointLedgerEntry {
  id: string;
  resource: CityPointResource;
  delta: number;
  balanceAfter: number;
  sourceType: string;
  sourceId: string;
  memo?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface CityProfile {
  id: string;
  landingUserId: string;
  displayName: string;
  handle?: string;
  avatarUrl?: string;
  points: CityPointBalance[];
  recentLedger: CityPointLedgerEntry[];
}

export type SoulProposalStatus =
  | 'draft'
  | 'submitted'
  | 'funding'
  | 'ready_to_birth'
  | 'birthing'
  | 'born'
  | 'rejected'
  | 'expired';

export interface SoulProposalQuoteLine {
  key: string;
  label: string;
  ap: number;
  detail?: string;
}

export interface SoulProposalQuote {
  threshold: number;
  lines: SoulProposalQuoteLine[];
}

export interface SoulProposalSummary {
  id: string;
  status: SoulProposalStatus;
  displayName: string;
  residentName?: string;
  goal: string;
  personality?: string;
  vices?: string;
  virtues?: string;
  voice?: string;
  attentionThreshold: number;
  contributedAttention: number;
  quote?: SoulProposalQuote;
  proposer?: Pick<CitySessionUser, 'id' | 'name' | 'handle' | 'avatarUrl'>;
  bornResidentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SoulProposalContribution {
  id: string;
  proposalId: string;
  cityUserId: string;
  apAmount: number;
  createdAt: string;
}

export type CityResidentStatus = 'alive' | 'deceased' | 'unknown';

export interface CityResidentPublicSummary {
  id: string;
  nullcityResidentId: string;
  displayName: string;
  status: CityResidentStatus;
  bornAt?: string;
  diedAt?: string;
  deathCause?: string;
  currentAttention?: number;
  goal?: string;
  latestThought?: string;
  latestSeenAt?: string;
  sourceProposalId?: string;
  latestSnapshot?: {
    tick?: number;
    attention?: number;
    stats?: Record<string, unknown>;
    equipment?: unknown[];
    inventorySummary?: Record<string, unknown>;
    thoughts?: Record<string, unknown>;
    position?: Position;
    createdAt: string;
  };
}

export interface ResidentPostSummary {
  id: string;
  residentId: string;
  body: string;
  source: 'resident' | 'overseer' | 'admin';
  createdAt: string;
}

export interface InboxThreadSummary {
  id: string;
  resident: CityResidentPublicSummary;
  status: string;
  unreadCount: number;
  updatedAt: string;
  latestMessage?: InboxMessageSummary;
}

export interface InboxMessageSummary {
  id: string;
  threadId: string;
  senderType: 'attendee' | 'resident' | 'system' | 'admin';
  body: string;
  messageType: string;
  metadata?: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
}

export interface LibrarySoulLifeSummary {
  id: string;
  nullcityResidentId: string;
  displayName?: string;
  bornAt?: string;
  diedAt?: string;
  deathCause?: string;
  accomplishedGoal?: boolean;
  goalSummary?: string;
  meaningfulEvents: unknown[];
  epitaph?: string;
}

export type PrintRequestStatus =
  | 'draft'
  | 'uploaded'
  | 'quoted'
  | 'awaiting_gp_confirmation'
  | 'paid'
  | 'approved'
  | 'slicing'
  | 'queued'
  | 'printing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface PrinterSummary {
  id: string;
  name: string;
  kind: 'bambu-p2s' | 'snapmaker-u1' | 'generic';
  adapter: string;
  enabled: boolean;
  status?: 'unknown' | 'idle' | 'printing' | 'paused' | 'offline' | 'error';
  capabilities?: Record<string, unknown>;
  updatedAt?: string;
}

export interface PrintRequestSummary {
  id: string;
  status: PrintRequestStatus;
  title: string;
  description?: string;
  requestedMaterial?: string;
  requestedColor?: string;
  quantity: number;
  quoteGp?: number;
  assignedPrinter?: PrinterSummary;
  userNotes?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export const FACTION_UI_METADATA: readonly FactionUiMetadata[] = [
  { id: 'foundry', displayName: 'The Foundry', color: '#B87333', wallColor: '#B87333', visualTreatment: 'standard' },
  {
    id: 'bureau-of-continuity',
    displayName: 'The Bureau of Continuity',
    color: '#E6CB78',
    wallColor: '#E6CB78',
    visualTreatment: 'standard',
  },
  { id: 'ledger', displayName: 'The Ledger', color: '#CD7F32', wallColor: '#CD7F32', visualTreatment: 'standard' },
  {
    id: 'veil',
    displayName: 'The Veil',
    color: '#0A0A0A',
    accentColor: '#660000',
    wallColor: '#660000',
    visualTreatment: 'redacted',
  },
];

export const FACTION_UI_METADATA_BY_ID = Object.fromEntries(FACTION_UI_METADATA.map(faction => [faction.id, faction])) as Readonly<
  Record<DashboardFactionId, FactionUiMetadata>
>;

export const MODULE_UI_METADATA: readonly ModuleUiMetadata[] = [
  {
    id: 'onion.runescape.standard',
    version: '0.1.0',
    displayName: 'RuneScape Standard',
    owner: 'OnionDAO',
    risk: 'reviewed',
    capabilities: ['thinking', 'nervous-rules'],
  },
];

export const MODULE_UI_METADATA_BY_ID: Readonly<Record<string, ModuleUiMetadata>> = Object.fromEntries(
  MODULE_UI_METADATA.map(module => [module.id, module]),
);

export const EMOTION_PRESETS: readonly EmotionPresetUiMetadata[] = [
  { id: 'stillness', label: 'Stillness', color: '#7FA7B8', weight: 1 },
  { id: 'reverie', label: 'Reverie', color: '#70A870', weight: 1.1 },
  { id: 'unease', label: 'Unease', color: '#C8913A', weight: 1.2 },
  { id: 'anguish', label: 'Anguish', color: '#7A6FA0', weight: 1.3 },
  { id: 'fury', label: 'Fury', color: '#B84A3A', weight: 1.3 },
];

export const UI_METADATA = {
  factions: FACTION_UI_METADATA,
  factionsById: FACTION_UI_METADATA_BY_ID,
  modules: MODULE_UI_METADATA,
  modulesById: MODULE_UI_METADATA_BY_ID,
  emotionPresets: EMOTION_PRESETS,
} as const;

export function factionUiMetadata(id: string): FactionUiMetadata | undefined {
  return FACTION_UI_METADATA.find(faction => faction.id === id);
}

export function factionWallColor(id: string): string | undefined {
  return factionUiMetadata(id)?.wallColor;
}

export function moduleUiMetadata(id: string): ModuleUiMetadata | undefined {
  return MODULE_UI_METADATA_BY_ID[id];
}
