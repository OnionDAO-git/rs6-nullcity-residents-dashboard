import type {
  ControllerStatus,
  DashboardOverview,
  GatewayStatus,
  ObservableSubjectSummary,
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
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export const api = {
  overview: () => request<DashboardOverview>('/api/overview'),
  gatewayStatus: () => request<GatewayStatus>('/api/gateway/status'),
  controllerStatus: () => request<ControllerStatus>('/api/controller/status'),
  residents: (filter = 'all') => request<ResidentDashboardRow[]>(`/api/residents?filter=${encodeURIComponent(filter)}`),
  runtime: (resident: string) => request<RuntimeReadModel>(`/api/runtime/${encodeURIComponent(resident)}`),
  createResident: (body: unknown) => request('/api/residents', { method: 'POST', body: JSON.stringify(body) }),
  residentCommand: (resident: string, command: 'connect' | 'attach' | 'detach' | 'disconnect', body: unknown = {}) =>
    request(`/api/residents/${encodeURIComponent(resident)}/${command}`, { method: 'POST', body: JSON.stringify(body) }),
  submitAction: (resident: string, action: unknown) =>
    request(`/api/residents/${encodeURIComponent(resident)}/actions`, { method: 'POST', body: JSON.stringify({ action }) }),
  subjects: () => request<ObservableSubjectSummary[]>('/api/observe/subjects'),
  sessions: () => request<SpectatorSession[]>('/api/observe/sessions'),
  observe: (subject: SpectatorSubject, mode: SpectatorMode) =>
    request<SpectatorSession>('/api/observe/session', { method: 'POST', body: JSON.stringify({ subject, mode }) }),
  unobserve: (sessionId: string) => request(`/api/observe/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  streamSession: (sessionId: string) => new EventSource(`/api/observe/session/${encodeURIComponent(sessionId)}/stream`),
  souls: () => request<SoulSummary[]>('/api/souls'),
  logs: () => request<{ actions: unknown[]; inference: unknown[] }>('/api/logs'),
};

export function routeTo(path: string): void {
  history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
