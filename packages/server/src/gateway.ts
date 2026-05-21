import type {
  ClientMessage,
  GatewayStatus,
  ObservableSubjectSummary,
  Position,
  ResidentSummary,
  ServerMessage,
  SpectatorMode,
  SpectatorSession,
  SpectatorSubject,
} from '@nullcity-dashboard/shared';
import { makeFrame, subjectKey } from '@nullcity-dashboard/shared';
import WebSocket from 'ws';

type Pending = {
  resolve: (message: ServerMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type SessionListener = (session: SpectatorSession) => void;
type ResidentFeedListener = (feed: ResidentFeedSnapshot) => void;

export interface ResidentFeedSnapshot {
  resident: string;
  attached: boolean;
  latestPerception?: unknown;
  latestEvent?: unknown;
  actionResults: Array<{ requestId?: string; result: unknown; cause?: string; t: string }>;
  events: Array<{ event: unknown; t: string }>;
  lastFeedAt?: string;
  lastError?: string;
}

export class GatewayClient {
  private ws?: WebSocket;
  private pending = new Map<string | number, Pending>();
  private sessions = new Map<string, SpectatorSession>();
  private sessionListeners = new Map<string, Set<SessionListener>>();
  private residentFeeds = new Map<string, ResidentFeedSnapshot>();
  private residentFeedListeners = new Map<string, Set<ResidentFeedListener>>();
  private attachingResidents = new Map<string, Promise<void>>();
  private connected = false;
  private connecting?: Promise<void>;
  private lastConnectedAt?: string;
  private lastDisconnectedAt?: string;
  private lastError?: string;
  private allowDelete?: boolean;

  constructor(
    private readonly url: string,
    private readonly token?: string,
  ) {}

  status(): GatewayStatus {
    return {
      configuredUrl: this.url,
      connected: this.connected,
      allowDelete: this.allowDelete,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      lastError: this.lastError,
    };
  }

  async probeStatus(): Promise<GatewayStatus> {
    try {
      const message = await this.request(makeFrame('gateway_status', {}), 1000);
      if (message.kind === 'gateway_status') this.allowDelete = message.payload.allowDelete;
    } catch {
      // Older or unavailable gateways still get represented by the local connection status.
    }
    return this.status();
  }

  async listResidents(filter: 'online' | 'offline' | 'all' = 'all'): Promise<ResidentSummary[]> {
    const message = await this.request(makeFrame('list_residents', { filter }));
    return message.kind === 'resident_list' ? message.payload.residents : [];
  }

  async listObservableSubjects(): Promise<ObservableSubjectSummary[]> {
    const message = await this.request(makeFrame('list_observable_subjects', { includeResidents: true, includePlayers: true }));
    return message.kind === 'observable_subject_list' ? message.payload.subjects : [];
  }

  async createResident(payload: Extract<ClientMessage, { kind: 'create_resident' }>['payload']): Promise<ServerMessage> {
    return this.request(makeFrame('create_resident', payload));
  }

  async command(kind: 'connect_resident' | 'attach' | 'detach' | 'disconnect_resident' | 'pause_resident' | 'delete_resident', payload: Record<string, unknown>): Promise<ServerMessage> {
    return this.request(makeFrame(kind, payload as never));
  }

  async submitAction(name: string, action: unknown): Promise<ServerMessage> {
    return this.request(makeFrame('submit_action', { name, action }));
  }

  async subscribeResidentFeed(name: string): Promise<ResidentFeedSnapshot> {
    const key = residentKey(name);
    const existing = this.ensureResidentFeed(key, name);
    if (existing.attached) return existing;
    if (!this.attachingResidents.has(key)) {
      this.attachingResidents.set(
        key,
        this.request(makeFrame('attach', { name, observe: true, control: false }))
          .then(() => {
            const feed = this.ensureResidentFeed(key, name);
            feed.attached = true;
            feed.lastError = undefined;
          })
          .catch(error => {
            const feed = this.ensureResidentFeed(key, name);
            feed.attached = false;
            feed.lastError = error instanceof Error ? error.message : 'Resident feed attach failed';
          })
          .finally(() => {
            this.attachingResidents.delete(key);
          }),
      );
    }
    await this.attachingResidents.get(key);
    return this.ensureResidentFeed(key, name);
  }

  getResidentFeed(name: string): ResidentFeedSnapshot | undefined {
    return this.residentFeeds.get(residentKey(name));
  }

  subscribeResidentFeedUpdates(name: string, listener: ResidentFeedListener): () => void {
    const key = residentKey(name);
    const listeners = this.residentFeedListeners.get(key) || new Set<ResidentFeedListener>();
    listeners.add(listener);
    this.residentFeedListeners.set(key, listeners);
    const feed = this.residentFeeds.get(key);
    if (feed) listener(feed);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.residentFeedListeners.delete(key);
    };
  }

  async observe(subject: SpectatorSubject, mode: SpectatorMode): Promise<SpectatorSession> {
    const message = await this.request(makeFrame('observe_subject', { subject, mode }));
    if (message.kind !== 'spectator_connected') {
      throw new Error(`Expected spectator_connected, got ${message.kind}`);
    }
    const state = message.payload.initialState as Record<string, unknown>;
    const session: SpectatorSession = {
      id: message.payload.sessionId,
      subject,
      mode,
      connected: true,
      regionId: typeof state.regionId === 'number' ? state.regionId : undefined,
      position: parsePosition(state.position),
      latestPerception: state.perception,
      packets: this.sessions.get(message.payload.sessionId)?.packets || [],
      lastEventAt: new Date().toISOString(),
    };
    this.setSession(session.id, session);
    return session;
  }

  async unobserve(sessionId: string): Promise<void> {
    await this.request(makeFrame('unobserve_subject', { sessionId }));
    const session = this.sessions.get(sessionId);
    if (session) {
      this.setSession(sessionId, { ...session, connected: false });
    }
  }

  getSession(sessionId: string): SpectatorSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): SpectatorSession[] {
    return [...this.sessions.values()].sort((a, b) => subjectKey(a.subject).localeCompare(subjectKey(b.subject)));
  }

  subscribeSession(sessionId: string, listener: SessionListener): () => void {
    const listeners = this.sessionListeners.get(sessionId) || new Set<SessionListener>();
    listeners.add(listener);
    this.sessionListeners.set(sessionId, listeners);
    const session = this.sessions.get(sessionId);
    if (session) listener(session);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.sessionListeners.delete(sessionId);
    };
  }

  private async request(message: ClientMessage, timeoutMs = 5000): Promise<ServerMessage> {
    await this.ensureConnected();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway is not connected');
    }

    const id = message.id ?? `${message.kind}-${Date.now()}`;
    const framed = { ...message, id } as ClientMessage;
    return await new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Gateway request timed out: ${message.kind}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws?.send(JSON.stringify(framed));
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;
    assertAgentGatewayUrl(this.url);

    this.connecting = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
      });
      this.ws = ws;

      const fail = (error: Error) => {
        this.lastError = error.message;
        this.connected = false;
        this.lastDisconnectedAt = new Date().toISOString();
        this.rejectAll(error);
        reject(error);
      };

      ws.on('open', () => {
        this.connected = true;
        this.lastConnectedAt = new Date().toISOString();
        this.lastError = undefined;
        ws.send(JSON.stringify(makeFrame('controller_hello', {
          controllerId: 'nullcity-dashboard',
          version: '0.1.0',
          capabilities: ['dashboard', 'observer', 'manual-control'],
        })));
        resolve();
      });

      ws.on('message', data => this.handleMessage(data.toString()));
      ws.on('error', error => {
        const message = error instanceof Error && error.message ? error.message : 'Gateway websocket error';
        fail(new Error(message));
      });
      ws.on('close', () => {
        this.connected = false;
        this.lastDisconnectedAt = new Date().toISOString();
        this.lastError = this.lastError || 'Gateway websocket closed';
        this.rejectAll(new Error('Gateway websocket closed'));
      });
    }).finally(() => {
      this.connecting = undefined;
    });

    return this.connecting;
  }

  private handleMessage(raw: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.kind === 'error') {
          pending.reject(new Error(`${message.payload.code}: ${message.payload.message}`));
        } else {
          pending.resolve(message);
        }
      }
    }

    this.applyPush(message);
  }

  private applyPush(message: ServerMessage): void {
    if (message.kind === 'spectator_connected') {
      const state = message.payload.initialState as Record<string, unknown>;
      const session: SpectatorSession = {
        id: message.payload.sessionId,
        subject: message.payload.subject,
        mode: isSpectatorMode(state.mode) ? state.mode : 'follow',
        connected: true,
        regionId: typeof state.regionId === 'number' ? state.regionId : undefined,
        position: parsePosition(state.position),
        latestPerception: state.perception,
        packets: this.sessions.get(message.payload.sessionId)?.packets || [],
        lastEventAt: new Date().toISOString(),
      };
      this.setSession(session.id, session);
      this.applyResidentFeedFromSession(session.subject, session.latestPerception, session.position);
    }
    if (message.kind === 'gateway_status') {
      this.allowDelete = message.payload.allowDelete;
    }
    if (message.kind === 'resident_connected') {
      const key = residentKey(message.payload.resident.name);
      const feed = this.ensureResidentFeed(key, message.payload.resident.name);
      feed.attached = true;
      feed.latestPerception = message.payload.perception;
      feed.lastFeedAt = new Date().toISOString();
      this.notifyResidentFeed(key, feed);
    }
    if (message.kind === 'perception') {
      const key = residentKey(message.payload.resident_id);
      const feed = this.ensureResidentFeed(key, message.payload.resident_id);
      feed.latestPerception = message.payload.perception;
      feed.lastFeedAt = new Date().toISOString();
      this.notifyResidentFeed(key, feed);
    }
    if (message.kind === 'event') {
      const key = residentKey(message.payload.resident_id);
      const feed = this.ensureResidentFeed(key, message.payload.resident_id);
      const entry = { event: message.payload.event, t: new Date().toISOString() };
      feed.latestEvent = message.payload.event;
      feed.events = [...feed.events.slice(-49), entry];
      feed.lastFeedAt = entry.t;
      this.notifyResidentFeed(key, feed);
    }
    if (message.kind === 'action_result') {
      const key = residentKey(message.payload.resident_id);
      const feed = this.ensureResidentFeed(key, message.payload.resident_id);
      const entry = {
        requestId: message.payload.request_id === undefined ? undefined : String(message.payload.request_id),
        result: message.payload.result,
        cause: message.payload.cause,
        t: new Date().toISOString(),
      };
      feed.actionResults = [...feed.actionResults.slice(-49), entry];
      feed.lastFeedAt = entry.t;
      this.notifyResidentFeed(key, feed);
    }
    if (message.kind === 'spectator_perception') {
      const session = this.sessions.get(message.payload.sessionId);
      if (session) {
        const perception = message.payload.perception as Record<string, unknown>;
        const position = parsePosition(message.payload.position) ??
          parsePosition((perception.resident as Record<string, unknown> | undefined)?.position ?? perception.position) ??
          session.position;
        this.setSession(session.id, {
          ...session,
          latestPerception: message.payload.perception,
          position,
          regionId: typeof message.payload.regionId === 'number' ? message.payload.regionId : session.regionId,
          lastEventAt: new Date().toISOString(),
        });
        this.applyResidentFeedFromSession(session.subject, message.payload.perception, position);
      }
    }
    if (message.kind === 'spectator_rebuild') {
      const session = this.sessions.get(message.payload.sessionId);
      if (session) {
        const payload = message.payload.payload as Record<string, unknown>;
        this.setSession(session.id, {
          ...session,
          regionId: typeof payload.regionId === 'number' ? payload.regionId : session.regionId,
          position: parsePosition(payload.position) ?? session.position,
          latestPerception: payload.perception ?? session.latestPerception,
          lastEventAt: new Date().toISOString(),
        });
        this.applyResidentFeedFromSession(session.subject, payload.perception ?? session.latestPerception, parsePosition(payload.position) ?? session.position);
      }
    }
    if (message.kind === 'spectator_packet') {
      const session = this.sessions.get(message.payload.sessionId);
      if (session) {
        this.setSession(session.id, {
          ...session,
          packets: [
            ...(session.packets || []).slice(-749),
            {
              opcode: message.payload.opcode,
              payload: message.payload.payload,
              receivedAt: new Date().toISOString(),
            },
          ],
          lastEventAt: new Date().toISOString(),
        });
      }
    }
    if (message.kind === 'spectator_disconnected') {
      const session = this.sessions.get(message.payload.sessionId);
      if (session) {
        this.setSession(session.id, { ...session, connected: false, error: message.payload.cause });
      }
    }
  }

  private setSession(sessionId: string, session: SpectatorSession): void {
    this.sessions.set(sessionId, session);
    for (const listener of this.sessionListeners.get(sessionId) || []) {
      listener(session);
    }
  }

  private applyResidentFeedFromSession(subject: SpectatorSubject, perception: unknown, position?: Position): void {
    if (subject.kind !== 'resident' || !perception) return;
    const key = residentKey(subject.name);
    const feed = this.ensureResidentFeed(key, subject.name);
    feed.attached = true;
    feed.latestPerception = perception;
    feed.lastFeedAt = new Date().toISOString();
    if (!position) {
      this.notifyResidentFeed(key, feed);
      return;
    }
    const perceptionRecord = typeof perception === 'object' && perception !== null && !Array.isArray(perception)
      ? perception as Record<string, unknown>
      : {};
    if (typeof perceptionRecord.position !== 'object' || perceptionRecord.position === null) {
      feed.latestPerception = { ...perceptionRecord, position };
    }
    this.notifyResidentFeed(key, feed);
  }

  private ensureResidentFeed(key: string, resident: string): ResidentFeedSnapshot {
    const existing = this.residentFeeds.get(key);
    if (existing) return existing;
    const feed: ResidentFeedSnapshot = {
      resident,
      attached: false,
      actionResults: [],
      events: [],
    };
    this.residentFeeds.set(key, feed);
    return feed;
  }

  private notifyResidentFeed(key: string, feed: ResidentFeedSnapshot): void {
    for (const listener of this.residentFeedListeners.get(key) || []) {
      listener(feed);
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

function residentKey(value: string): string {
  return value.trim().toLowerCase().replace(/^res:/, '');
}

function assertAgentGatewayUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.port === '43594') {
      throw new Error('AGENT_GATEWAY_URL points at the RuneScape game gateway on port 43594. Use the AgentGateway on port 43595 for dashboard resident control.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('RuneScape game gateway')) throw error;
  }
}

function parsePosition(value: unknown): { x: number; y: number; level: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const level = Number(record.level ?? 0);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y, level: Number.isFinite(level) ? level : 0 } : undefined;
}

function isSpectatorMode(value: unknown): value is SpectatorMode {
  return value === 'follow' || value === 'free-camera' || value === 'picture-in-picture';
}
