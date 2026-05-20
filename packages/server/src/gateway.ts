import type {
  ClientMessage,
  GatewayStatus,
  ObservableSubjectSummary,
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

export class GatewayClient {
  private ws?: WebSocket;
  private pending = new Map<string | number, Pending>();
  private sessions = new Map<string, SpectatorSession>();
  private connected = false;
  private connecting?: Promise<void>;
  private lastConnectedAt?: string;
  private lastDisconnectedAt?: string;
  private lastError?: string;

  constructor(
    private readonly url: string,
    private readonly token?: string,
  ) {}

  status(): GatewayStatus {
    return {
      configuredUrl: this.url,
      connected: this.connected,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      lastError: this.lastError,
    };
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

  async command(kind: 'connect_resident' | 'attach' | 'detach' | 'disconnect_resident' | 'delete_resident', payload: Record<string, unknown>): Promise<ServerMessage> {
    return this.request(makeFrame(kind, payload as never));
  }

  async submitAction(name: string, action: unknown): Promise<ServerMessage> {
    return this.request(makeFrame('submit_action', { name, action }));
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
      position: parsePosition(state.position),
      latestPerception: state.perception,
      lastEventAt: new Date().toISOString(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async unobserve(sessionId: string): Promise<void> {
    await this.request(makeFrame('unobserve_subject', { sessionId }));
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, { ...session, connected: false });
    }
  }

  getSession(sessionId: string): SpectatorSession | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): SpectatorSession[] {
    return [...this.sessions.values()].sort((a, b) => subjectKey(a.subject).localeCompare(subjectKey(b.subject)));
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
      ws.on('error', () => fail(new Error('Gateway websocket error')));
      ws.on('close', () => {
        this.connected = false;
        this.lastDisconnectedAt = new Date().toISOString();
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
    if (message.kind === 'spectator_perception') {
      const session = this.sessions.get(message.payload.sessionId);
      if (session) {
        const perception = message.payload.perception as Record<string, unknown>;
        this.sessions.set(session.id, {
          ...session,
          latestPerception: message.payload.perception,
          position: parsePosition((perception.resident as Record<string, unknown> | undefined)?.position ?? perception.position) ?? session.position,
          lastEventAt: new Date().toISOString(),
        });
      }
    }
    if (message.kind === 'spectator_rebuild') {
      const session = this.sessions.get(message.payload.sessionId);
      if (session) {
        const payload = message.payload.payload as Record<string, unknown>;
        this.sessions.set(session.id, {
          ...session,
          position: parsePosition(payload.position) ?? session.position,
          latestPerception: payload.perception ?? session.latestPerception,
          lastEventAt: new Date().toISOString(),
        });
      }
    }
    if (message.kind === 'spectator_disconnected') {
      const session = this.sessions.get(message.payload.sessionId);
      if (session) {
        this.sessions.set(session.id, { ...session, connected: false, error: message.payload.cause });
      }
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

function parsePosition(value: unknown): { x: number; y: number; level: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const level = Number(record.level ?? 0);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y, level: Number.isFinite(level) ? level : 0 } : undefined;
}
