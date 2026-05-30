import type {
  ControllerStatus,
  BenchmarkArtifact,
  BenchmarkArtifactSummary,
  BenchmarkLeaderboardRow,
  DashboardOverview,
  GatewayStatus,
  ObservableSubjectSummary,
  PatronActivitySummary,
  RelationshipActivitySummary,
  ResidentDashboardRow,
  RuntimeReadModel,
  SoulSummary,
  SpectatorMode,
  SpectatorSession,
  SpectatorSubject,
} from '@nullcity-dashboard/shared';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatErrorMessage(text) || `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function requestArrayBuffer(path: string, init?: RequestInit): Promise<ArrayBuffer> {
  const response = await fetchJson(path, init).catch(async error => {
    if (!isFetchFailure(error) || !path.startsWith('/api/rs6/')) throw error;
    const fallbackUrl = `http://127.0.0.1:8787${path}`;
    if (globalThis.location?.origin === 'http://127.0.0.1:8787') throw error;
    return fetchJson(fallbackUrl, init);
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(formatErrorMessage(text) || `${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

function fetchJson(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
}

function isFetchFailure(error: unknown): boolean {
  return error instanceof TypeError && /fetch/i.test(error.message);
}

function formatErrorMessage(text: string): string {
  let message = text;
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === 'string') message = parsed.error;
  } catch {
    // Plain text errors are already displayable.
  }
  if (message === 'EDELETE_DISABLED' || message === 'EDELETE_DISABLED: EDELETE_DISABLED') {
    return 'Resident delete is disabled by the game server. Set agentGateway.allowDelete to true and restart the server to enable it.';
  }
  return message;
}

export const api = {
  overview: () => request<DashboardOverview>('/api/overview'),
  gatewayStatus: () => request<GatewayStatus>('/api/gateway/status'),
  controllerStatus: () => request<ControllerStatus>('/api/controller/status'),
  residents: (filter = 'all') => request<ResidentDashboardRow[]>(`/api/residents?filter=${encodeURIComponent(filter)}`),
  runtime: (resident: string) => request<RuntimeReadModel>(`/api/runtime/${encodeURIComponent(resident)}`),
  createResident: (body: unknown) => request('/api/residents', { method: 'POST', body: JSON.stringify(body) }),
  residentCommand: (resident: string, command: 'connect' | 'attach' | 'detach' | 'disconnect' | 'pause', body: unknown = {}) =>
    request(`/api/residents/${encodeURIComponent(resident)}/${command}`, { method: 'POST', body: JSON.stringify(body) }),
  deleteResident: (resident: string) => request(`/api/residents/${encodeURIComponent(resident)}`, { method: 'DELETE' }),
  submitAction: (resident: string, action: unknown) =>
    request(`/api/residents/${encodeURIComponent(resident)}/actions`, { method: 'POST', body: JSON.stringify({ action }) }),
  composeResidentModel: (appearance: unknown) =>
    requestArrayBuffer('/api/rs6/compose', { method: 'POST', body: JSON.stringify({ appearance }) }),
  subjects: () => request<ObservableSubjectSummary[]>('/api/observe/subjects'),
  sessions: () => request<SpectatorSession[]>('/api/observe/sessions'),
  observe: (subject: SpectatorSubject, mode: SpectatorMode) =>
    request<SpectatorSession>('/api/observe/session', { method: 'POST', body: JSON.stringify({ subject, mode }) }),
  unobserve: (sessionId: string) => request(`/api/observe/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  streamRuntime: (resident: string) => new EventSource(`/api/runtime/${encodeURIComponent(resident)}/stream`),
  streamSession: (sessionId: string) => new EventSource(`/api/observe/session/${encodeURIComponent(sessionId)}/stream`),
  souls: () => request<SoulSummary[]>('/api/souls'),
  logs: () => request<{ actions: unknown[]; inference: unknown[] }>('/api/logs'),
  patronSummary: (limit = 20) => request<PatronActivitySummary>(`/api/patrons/summary?limit=${encodeURIComponent(limit)}`),
  relationshipSummary: (limit = 20) => request<RelationshipActivitySummary>(`/api/relationships/summary?limit=${encodeURIComponent(limit)}`),
  benchmarks: (limit = 200) => request<BenchmarkArtifactSummary[]>(`/api/benchmarks?limit=${encodeURIComponent(limit)}`),
  benchmark: (runId: string) => request<BenchmarkArtifact>(`/api/benchmarks/${encodeURIComponent(runId)}`),
  benchmarkLeaderboard: (limit = 50) => request<BenchmarkLeaderboardRow[]>(`/api/benchmarks/leaderboard?limit=${encodeURIComponent(limit)}`),
  residentEconomy: (resident: string) => request<ResidentEconomy>(`/api/resident/${encodeURIComponent(resident)}/economy`),
  storytellerDigests: (limit = 12) => request<StorytellerDigestFeed>(`/api/storyteller/digests?limit=${encodeURIComponent(limit)}`),
};

export interface EconomyEvent {
  id: string;
  ts: string;
  kind: string;
  apDelta?: number;
  gpDelta?: number;
  ncriId?: string;
  note?: string;
}

export interface ActiveGoal {
  id: string;
  goalText: string;
  completion?: {
    condition: string;
    evidenceSource: string;
  };
}

export interface ResidentEconomy {
  ap: number;
  recentEvents: EconomyEvent[];
  activeGoals: ActiveGoal[];
}

export interface StorytellerDispatchSummary {
  dispatchId: string;
  generatedAt?: string;
  modelProfile?: string;
  needsReview: boolean;
  warningCount: number;
  publicTitle?: string;
  eventRefCount: number;
  estimatedCostUsd?: number | null;
}

export interface StorytellerDigestSummary {
  runId: string;
  digestId: string;
  builtAt?: string;
  windowStart?: string;
  windowEnd?: string;
  topEventCount: number;
  residentCount: number;
  summary?: string;
  dispatch?: StorytellerDispatchSummary;
}

export interface StorytellerDigestFeed {
  items: StorytellerDigestSummary[];
}

export function routeTo(path: string): void {
  history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
