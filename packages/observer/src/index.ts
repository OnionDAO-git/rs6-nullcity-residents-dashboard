import type { Position, SpectatorSession, SpectatorSubject } from '@nullcity-dashboard/shared';

export interface SpectatorAnchor {
  subject: SpectatorSubject;
  position: Position;
  displayName: string;
  combatLevel?: number;
  hpFraction?: number;
}

export interface ObserverActor {
  id: string;
  kind: 'player' | 'resident' | 'npc';
  name: string;
  position: Position;
  hpFraction?: number;
}

export interface ObserverObject {
  id: string;
  kind: 'object' | 'item';
  label: string;
  position: Position;
}

export interface ObserverFrame {
  sessionId: string;
  anchor?: SpectatorAnchor;
  actors: ObserverActor[];
  objects: ObserverObject[];
  tick?: number;
  regionId?: number;
  perception?: unknown;
  packet?: { opcode: number; payload: unknown };
}

type SpectatorFrameMessage =
  | { type: 'nullcity:spectator-session'; sessionId: string; subject: SpectatorSubject }
  | { type: 'nullcity:spectator-packet'; sessionId: string; packet: unknown }
  | { type: 'nullcity:spectator-clear' };

export class NullCitySpectatorBridge {
  private readonly iframe: HTMLIFrameElement;
  private readonly fallbackCanvas: HTMLCanvasElement;
  private readonly fallbackRenderer: NullCityObserverRenderer;
  private readonly status: HTMLDivElement;
  private readonly sentPackets = new Set<string>();
  private currentSessionId = '';
  private started = false;
  private loaded = false;
  private pendingSession: SpectatorSession | undefined;
  private statusListener?: (event: MessageEvent) => void;

  constructor(private readonly container: HTMLElement, private readonly src = '/spectator.html') {
    this.iframe = document.createElement('iframe');
    this.iframe.title = 'NullCity 3D spectator';
    this.iframe.loading = 'eager';
    this.iframe.setAttribute('allow', 'fullscreen');
    this.fallbackCanvas = document.createElement('canvas');
    this.fallbackCanvas.className = 'spectator-canvas';
    this.fallbackCanvas.setAttribute('aria-label', 'NullCity live spectator map');
    this.fallbackRenderer = new NullCityObserverRenderer(this.fallbackCanvas);
    this.status = document.createElement('div');
    this.status.className = 'spectator-status';
    this.status.textContent = 'waiting for spectator session';
    this.statusListener = event => {
      if (event.origin !== window.location.origin) return;
      const data = record(event.data);
      if (data.type === 'nullcity:spectator-status') {
        this.setStatus(String(data.text || ''));
      }
    };
    window.addEventListener('message', this.statusListener);
    this.iframe.addEventListener('load', () => {
      if (!this.started) return;
      this.loaded = true;
      this.verifyLoadedDocument();
      this.flush();
    });
    this.container.replaceChildren(this.fallbackCanvas, this.status);
  }

  setSession(session: SpectatorSession | undefined): void {
    if (session?.id !== this.currentSessionId) {
      this.currentSessionId = session?.id || '';
      this.sentPackets.clear();
    }
    this.pendingSession = session;
    this.flush();
  }

  destroy(): void {
    if (this.started) this.post({ type: 'nullcity:spectator-clear' });
    if (this.statusListener) window.removeEventListener('message', this.statusListener);
    this.fallbackRenderer.destroy();
    this.fallbackCanvas.remove();
    this.iframe.remove();
    this.status.remove();
    this.sentPackets.clear();
    this.pendingSession = undefined;
  }

  private flush(): void {
    const session = this.pendingSession;
    if (!session) {
      this.fallbackRenderer.setFrame(undefined);
      this.stopClient();
      return;
    }

    this.fallbackRenderer.setFrame(frameFromSession(session));

    if (this.started && this.loaded) {
      this.post({ type: 'nullcity:spectator-session', sessionId: session.id, subject: session.subject });
      for (const [index, packet] of (session.packets || []).entries()) {
        const key = `${session.id}:${index}:${packet.receivedAt}:${packet.opcode}`;
        if (this.sentPackets.has(key)) {
          continue;
        }
        this.sentPackets.add(key);
        this.post({ type: 'nullcity:spectator-packet', sessionId: session.id, packet: packet.payload });
      }
    }

    const packetCount = session.packets?.length || 0;
    if (packetCount > 0) {
      this.setStatus(`live spectator; ${packetCount} render packet${packetCount === 1 ? '' : 's'} captured`);
    } else {
      this.setStatus('live spectator from perception; waiting for render packets');
    }
  }

  private post(message: SpectatorFrameMessage): void {
    this.iframe.contentWindow?.postMessage(message, window.location.origin);
  }

  private stopClient(): void {
    if (this.started) {
      this.post({ type: 'nullcity:spectator-clear' });
      this.started = false;
      this.loaded = false;
      this.iframe.src = 'about:blank';
      this.container.replaceChildren(this.fallbackCanvas, this.status);
    }
    this.setStatus('waiting for spectator session');
  }

  private verifyLoadedDocument(): void {
    const title = this.iframe.contentDocument?.title || '';
    if (title && title !== 'NullCity Spectator') {
      this.setStatus('3D client page was not served; rebuild dashboard web assets');
    } else {
      this.setStatus('waiting for spectator packets');
    }
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
    this.status.hidden = text.length === 0;
  }
}

type DrawTheme = {
  background: string;
  grid: string;
  gridStrong: string;
  text: string;
  muted: string;
  anchor: string;
  player: string;
  resident: string;
  npc: string;
  object: string;
  item: string;
};

const theme: DrawTheme = {
  background: '#0e0c0a',
  grid: 'rgba(228, 184, 64, 0.12)',
  gridStrong: 'rgba(88, 192, 180, 0.22)',
  text: '#ede8e0',
  muted: '#8a7e6a',
  anchor: '#e4b840',
  player: '#3d94c4',
  resident: '#58c0b4',
  npc: '#d4707a',
  object: '#b080a0',
  item: '#4eae6e',
};

export class NullCityObserverRenderer {
  private frame: ObserverFrame | undefined;
  private animation = 0;
  private resizeObserver?: ResizeObserver;
  private destroyed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(canvas);
    this.resizeCanvas();
    this.loop();
  }

  setFrame(frame: ObserverFrame | undefined): void {
    this.frame = frame;
    this.draw();
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
  }

  private loop = (): void => {
    if (this.destroyed) return;
    this.animation += 1;
    this.draw();
    requestAnimationFrame(this.loop);
  };

  private resizeCanvas(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width * dpr));
    const height = Math.max(260, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.draw();
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, width, height);

    const anchor = this.frame?.anchor;
    this.drawGrid(ctx, width, height, anchor?.position);
    if (!this.frame || !anchor) {
      this.drawEmpty(ctx, width, height);
      return;
    }

    const tile = this.tileSize(width, height);
    const origin = { x: width / 2, y: height / 2 };
    const project = (position: Position) => ({
      x: origin.x + (position.x - anchor.position.x) * tile,
      y: origin.y - (position.y - anchor.position.y) * tile,
    });

    for (const object of this.frame.objects) {
      this.drawObject(ctx, project(object.position), object);
    }
    for (const actor of this.frame.actors) {
      this.drawActor(ctx, project(actor.position), actor, false);
    }
    const anchorActor: ObserverActor = {
      id: subjectId(anchor.subject),
      kind: anchor.subject.kind,
      name: anchor.displayName,
      position: anchor.position,
    };
    if (anchor.hpFraction !== undefined) anchorActor.hpFraction = anchor.hpFraction;
    this.drawActor(ctx, origin, anchorActor, true);
    this.drawHud(ctx, width, height, anchor, this.frame);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, anchor?: Position): void {
    const tile = this.tileSize(width, height);
    const offsetX = anchor ? ((anchor.x % 8) * tile) % (tile * 8) : 0;
    const offsetY = anchor ? ((anchor.y % 8) * tile) % (tile * 8) : 0;
    ctx.lineWidth = 1;
    for (let x = width / 2 - offsetX; x < width; x += tile) this.line(ctx, x, 0, x, height, theme.grid);
    for (let x = width / 2 - offsetX; x > 0; x -= tile) this.line(ctx, x, 0, x, height, theme.grid);
    for (let y = height / 2 + offsetY; y < height; y += tile) this.line(ctx, 0, y, width, y, theme.grid);
    for (let y = height / 2 + offsetY; y > 0; y -= tile) this.line(ctx, 0, y, width, y, theme.grid);
    this.line(ctx, width / 2, 0, width / 2, height, theme.gridStrong);
    this.line(ctx, 0, height / 2, width, height / 2, theme.gridStrong);
  }

  private drawActor(ctx: CanvasRenderingContext2D, point: { x: number; y: number }, actor: ObserverActor, anchor: boolean): void {
    const color = anchor ? theme.anchor : theme[actor.kind];
    const pulse = anchor ? 2 + Math.sin(this.animation / 10) * 2 : 0;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0e0c0a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, anchor ? 9 + pulse : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (typeof actor.hpFraction === 'number') {
      ctx.fillStyle = '#d4707a';
      ctx.fillRect(point.x - 14, point.y + 13, 28, 3);
      ctx.fillStyle = '#4eae6e';
      ctx.fillRect(point.x - 14, point.y + 13, Math.max(0, Math.min(1, actor.hpFraction)) * 28, 3);
    }
    this.label(ctx, actor.name, point.x, point.y - 15, anchor ? theme.text : theme.muted);
  }

  private drawObject(ctx: CanvasRenderingContext2D, point: { x: number; y: number }, object: ObserverObject): void {
    ctx.fillStyle = object.kind === 'item' ? theme.item : theme.object;
    ctx.strokeStyle = '#0e0c0a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(point.x - 5, point.y - 5, 10, 10);
    ctx.fill();
    ctx.stroke();
  }

  private drawHud(ctx: CanvasRenderingContext2D, width: number, height: number, anchor: SpectatorAnchor, frame: ObserverFrame): void {
    ctx.fillStyle = 'rgba(14, 12, 10, 0.72)';
    ctx.fillRect(12, 12, Math.min(420, width - 24), 72);
    ctx.strokeStyle = 'rgba(228, 184, 64, 0.32)';
    ctx.strokeRect(12, 12, Math.min(420, width - 24), 72);
    ctx.fillStyle = theme.text;
    ctx.font = '600 14px Space Mono, monospace';
    ctx.fillText(anchor.displayName, 24, 36);
    ctx.fillStyle = theme.muted;
    ctx.font = '12px Space Mono, monospace';
    ctx.fillText(`tile ${anchor.position.x}, ${anchor.position.y}, ${anchor.position.level}`, 24, 57);
    ctx.fillText(`tick ${frame.tick ?? '-'}  region ${frame.regionId ?? '-'}`, 24, 76);
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'right';
    ctx.fillText('read-only spectator', width - 16, height - 16);
    ctx.textAlign = 'left';
  }

  private drawEmpty(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = theme.muted;
    ctx.font = '13px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('no spectator session', width / 2, height / 2);
    ctx.textAlign = 'left';
  }

  private tileSize(width: number, height: number): number {
    return Math.max(18, Math.min(34, Math.floor(Math.min(width, height) / 18)));
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
    ctx.font = '11px Space Mono, monospace';
    const width = ctx.measureText(text).width + 8;
    ctx.fillStyle = 'rgba(14, 12, 10, 0.72)';
    ctx.fillRect(x - width / 2, y - 12, width, 16);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
    ctx.textAlign = 'left';
  }

  private line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, stroke: string): void {
    ctx.strokeStyle = stroke;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}

export function frameFromSession(session: SpectatorSession | undefined): ObserverFrame | undefined {
  if (!session) return undefined;
  const perception = record(session.latestPerception);
  const anchor = anchorFromPerception(session.subject, session.latestPerception, session.position);
  const nearby = record(perception.nearby);
  const frame: ObserverFrame = {
    sessionId: session.id,
    anchor,
    actors: [...actorsFrom(nearby.players, ['player', 'resident']), ...actorsFrom(nearby.npcs, ['npc'])],
    objects: [...objectsFrom(nearby.objects, 'object'), ...objectsFrom(nearby.worldItems, 'item')],
    perception: session.latestPerception,
  };
  const packet = session.packets?.at(-1);
  if (packet) frame.packet = { opcode: packet.opcode, payload: packet.payload };
  const tick = numberOrUndefined(perception.tick);
  if (tick !== undefined) frame.tick = tick;
  if (session.regionId !== undefined) frame.regionId = session.regionId;
  return frame;
}

export function anchorFromPerception(subject: SpectatorSubject, perception: unknown, fallback?: Position): SpectatorAnchor {
  const root = record(perception);
  const resident = record(root.resident);
  const rawPosition = fallback ?? recordOrUndefined(resident.position) ?? recordOrUndefined(root.position) ?? { x: 0, y: 0, level: 0 };
  const hp = record(resident.hp);
  const current = numberOrUndefined(hp.current);
  const max = numberOrUndefined(hp.max);
  const anchor: SpectatorAnchor = {
    subject,
    displayName: subject.kind === 'resident' ? subject.name : subject.username,
    position: positionFrom(rawPosition),
  };
  if (current !== undefined && max) anchor.hpFraction = current / max;
  return anchor;
}

export function summarizePerception(perception: unknown): { players: number; residents: number; npcs: number; objects: number; items: number } {
  const nearby = record(record(perception).nearby);
  const actors = array(nearby.players);
  return {
    players: actors.filter(item => record(item).kind === 'player').length,
    residents: actors.filter(item => record(item).kind === 'resident').length,
    npcs: array(nearby.npcs).length,
    objects: array(nearby.objects).length,
    items: array(nearby.worldItems).length,
  };
}

function actorsFrom(value: unknown, allowed: Array<ObserverActor['kind']>): ObserverActor[] {
  const fallbackKind = allowed[0];
  if (!fallbackKind) return [];
  return array(value).flatMap(item => {
    const actor = record(item);
    const kind = typeof actor.kind === 'string' && allowed.includes(actor.kind as ObserverActor['kind']) ? (actor.kind as ObserverActor['kind']) : fallbackKind;
    const position = recordOrUndefined(actor.position);
    if (!position) return [];
    const result: ObserverActor = {
      id: String(actor.id || actor.name || `${kind}:${position.x}:${position.y}`),
      kind,
      name: String(actor.name || actor.key || actor.id || kind),
      position: positionFrom(position),
    };
    const hpFraction = numberOrUndefined(actor.hpFraction);
    if (hpFraction !== undefined) result.hpFraction = hpFraction;
    return [result];
  });
}

function objectsFrom(value: unknown, kind: ObserverObject['kind']): ObserverObject[] {
  return array(value).flatMap((item, index) => {
    const object = record(item);
    const position = recordOrUndefined(object.position);
    if (!position) return [];
    return [{
      id: String(object.id || object.objectId || object.itemId || `${kind}:${index}`),
      kind,
      label: String(object.key || object.objectId || object.itemId || kind),
      position: positionFrom(position),
    }];
  });
}

function subjectId(subject: SpectatorSubject): string {
  return subject.kind === 'resident' ? `resident:${subject.name}` : `player:${subject.username}`;
}

function positionFrom(value: Position | Record<string, unknown>): Position {
  return {
    x: Number(value.x || 0),
    y: Number(value.y || 0),
    level: Number(value.level || 0),
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
