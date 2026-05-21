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
    perceptionAgeMs?: number;
    lastAction?: ResidentActionSummary;
    lastActionSource?: ActionSource;
    gatewayHealthy?: boolean;
  };
  spark?: SparkRuntimeSummary;
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
  spark?: SparkRuntimeSummary;
  lastEvent?: ResidentEventSummary;
  activeTrade?: unknown;
  errors?: string[];
}

export interface GatewayStatus {
  configuredUrl: string;
  connected: boolean;
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

export interface DashboardOverview {
  gateway: GatewayStatus;
  controller: ControllerStatus;
  residents: ResidentDashboardRow[];
  recentEvents: ResidentEventSummary[];
}

export interface SoulSummary {
  id: string;
  file: string;
  title: string;
  attentionProfile?: unknown;
  variables?: Record<string, unknown>;
  hooks?: unknown[];
  nervousRules?: unknown[];
  legacyKind?: string;
  errors: string[];
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
