import { Client, type SpectatorRsPacketFrame } from 'client2';
import { shouldReplaySpectatorPacket } from './lib/spectator-packets';
import { liveSpectatorStatus, waitingForStableRenderStatus } from './lib/spectator-status';

type SpectatorMessage =
  | { type: 'nullcity:spectator-session'; sessionId: string; subject: { kind: string; name?: string; username?: string }; position?: { x: number; y: number; level?: number } }
  | { type: 'nullcity:spectator-packet'; sessionId: string; packet: SpectatorRsPacketFrame }
  | { type: 'nullcity:spectator-clear' };

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const status = document.getElementById('status') as HTMLDivElement;
let sessionId = '';
let packetCount = 0;
let lastOpcode = '';
let hasMapBootstrap = false;
let subjectLabel = 'subject';
let targetPosition: { x: number; y: number; level?: number } | undefined;
let positionApplied = false;
let positionFollowTimer: number | undefined;

const clientConfig = await loadClientConfig();
(globalThis as typeof globalThis & { __NULLCITY_RS_HOST__?: string }).__NULLCITY_RS_HOST__ = clientConfig.host;
(globalThis as typeof globalThis & { __NULLCITY_RS_SECURE__?: boolean }).__NULLCITY_RS_SECURE__ = clientConfig.secure;

const client = new Client(10, false, true);
client.enableSpectatorMode();
(globalThis as typeof globalThis & { __NULLCITY_SPECTATOR_CLIENT__?: Client }).__NULLCITY_SPECTATOR_CLIENT__ = client;
setStatus(`waiting for spectator packets via ${clientConfig.secure ? 'wss' : 'ws'}://${clientConfig.host}`);

window.addEventListener('message', event => {
  if (event.origin !== window.location.origin) return;
  const message = event.data as SpectatorMessage;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'nullcity:spectator-clear') {
    sessionId = '';
    packetCount = 0;
    lastOpcode = '';
    hasMapBootstrap = false;
    subjectLabel = 'subject';
    targetPosition = undefined;
    positionApplied = false;
    stopPositionFollow();
    setStatus('waiting for spectator packets');
    return;
  }

  if (message.type === 'nullcity:spectator-session') {
    if (message.sessionId !== sessionId) {
      sessionId = message.sessionId;
      packetCount = 0;
      lastOpcode = '';
      hasMapBootstrap = false;
      positionApplied = false;
    }
    setTargetPosition(message.position);
    const label = message.subject.kind === 'resident' ? message.subject.name : message.subject.username;
    subjectLabel = label || 'subject';
    setStatus(currentLiveStatus());
    return;
  }

  if (message.type === 'nullcity:spectator-packet' && message.sessionId === sessionId) {
    const isMapBootstrap = message.packet.opcode === 166 || message.packet.opcode === 23;
    if (!shouldReplaySpectatorPacket(message.packet.opcode, { hasMapBootstrap, positionApplied })) {
      schedulePositionFollow();
      setStatus(currentLiveStatus());
      return;
    }
    packetCount += 1;
    lastOpcode = String(message.packet.opcode);
    hasMapBootstrap = hasMapBootstrap || isMapBootstrap;
    try {
      client.pushSpectatorPacket(message.packet);
      if (isMapBootstrap) applyTargetPosition();
      schedulePositionFollow();
      setStatus(currentLiveStatus());
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'packet decode failed';
      setStatus(`packet ${lastOpcode} failed: ${detail}`);
    }
  }
});

window.parent.postMessage({ type: 'nullcity:spectator-ready' }, window.location.origin);

function setStatus(text: string): void {
  if (status.textContent === text) return;
  status.textContent = text;
  status.hidden = text.length === 0;
  window.parent.postMessage({ type: 'nullcity:spectator-status', text }, window.location.origin);
}

function setTargetPosition(position: { x: number; y: number; level?: number } | undefined): void {
  if (!samePosition(targetPosition, position)) {
    positionApplied = false;
  }
  targetPosition = position;
  schedulePositionFollow();
}

function currentLiveStatus(): string {
  return liveSpectatorStatus({
    packetCount,
    hasMapBootstrap,
    subjectLabel,
    positionApplied: targetPosition ? positionApplied : true,
  });
}

function applyTargetPosition(): boolean {
  if (!targetPosition) return false;
  const applied = client.setSpectatorPosition(targetPosition.x, targetPosition.y, targetPosition.level ?? 0);
  if (positionApplied !== applied) {
    positionApplied = applied;
    setStatus(currentLiveStatus());
  }
  return applied;
}

function schedulePositionFollow(): void {
  if (!targetPosition || positionFollowTimer !== undefined) return;

  const syncPosition = () => applyTargetPosition();

  syncPosition();
  positionFollowTimer = window.setInterval(() => {
    if (!targetPosition) {
      stopPositionFollow();
      return;
    }
    syncPosition();
  }, 500);
}

function stopPositionFollow(): void {
  if (positionFollowTimer === undefined) return;
  window.clearInterval(positionFollowTimer);
  positionFollowTimer = undefined;
}

function samePosition(a: { x: number; y: number; level?: number } | undefined, b: { x: number; y: number; level?: number } | undefined): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && (a.level ?? 0) === (b.level ?? 0);
}

async function loadClientConfig(): Promise<{ host: string; secure: boolean }> {
  try {
    const response = await fetch('/api/controller/config');
    if (!response.ok) throw new Error(`config ${response.status}`);
    const config = await response.json() as { rsClientHost?: unknown; rsClientSecure?: unknown };
    return {
      host: typeof config.rsClientHost === 'string' && config.rsClientHost ? config.rsClientHost : defaultClientHost(),
      secure: config.rsClientSecure === true,
    };
  } catch {
    return { host: defaultClientHost(), secure: window.location.protocol === 'https:' };
  }
}

function defaultClientHost(): string {
  return `${window.location.host}/rs`;
}

function fitCanvas(): void {
  const scale = Math.min(window.innerWidth / 765, window.innerHeight / 503);
  canvas.style.width = `${Math.max(1, Math.floor(765 * scale))}px`;
  canvas.style.height = `${Math.max(1, Math.floor(503 * scale))}px`;
}

window.addEventListener('resize', fitCanvas);
fitCanvas();
