import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { SpectatorSession } from '@nullcity-dashboard/shared';
import { NullCitySpectatorBridge } from './src/index';

type FakeListener = (event?: unknown) => void;
const windowListeners = new Map<string, FakeListener[]>();

class FakeElement {
  readonly tagName: string;
  readonly listeners = new Map<string, FakeListener[]>();
  readonly attributes = new Map<string, string>();
  children: FakeElement[] = [];
  className = '';
  hidden = false;
  textContent = '';

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: FakeListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) || []) listener();
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = children;
  }

  remove(): void {
    this.children = [];
  }

  getBoundingClientRect(): { width: number; height: number } {
    return { width: 640, height: 480 };
  }
}

class FakeCanvas extends FakeElement {
  width = 0;
  height = 0;

  constructor() {
    super('canvas');
  }

  getContext(): Record<string, () => void> {
    return {
      arc() {},
      beginPath() {},
      clearRect() {},
      fill() {},
      fillRect() {},
      fillText() {},
      lineTo() {},
      measureText: () => ({ width: 24 }),
      moveTo() {},
      rect() {},
      restore() {},
      save() {},
      setLineDash() {},
      setTransform() {},
      stroke() {},
      strokeRect() {},
    };
  }
}

class FakeIframe extends FakeElement {
  contentDocument = { title: 'NullCity Spectator' };
  postedMessages: unknown[] = [];
  contentWindow = { postMessage: (message: unknown) => this.postedMessages.push(message) };
  loading = '';
  src = '';
  title = '';

  constructor() {
    super('iframe');
  }
}

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalResizeObserver = globalThis.ResizeObserver;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

beforeEach(() => {
  windowListeners.clear();
  globalThis.document = {
    createElement(tagName: string): FakeElement {
      if (tagName === 'canvas') return new FakeCanvas();
      if (tagName === 'iframe') return new FakeIframe();
      return new FakeElement(tagName);
    },
  } as unknown as Document;
  globalThis.window = {
    devicePixelRatio: 1,
    location: { origin: 'http://127.0.0.1:5174' },
    addEventListener(type: string, listener: FakeListener) {
      windowListeners.set(type, [...(windowListeners.get(type) || []), listener]);
    },
    removeEventListener(type: string, listener: FakeListener) {
      windowListeners.set(type, (windowListeners.get(type) || []).filter(entry => entry !== listener));
    },
  } as unknown as Window & typeof globalThis;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame = (() => 0) as unknown as typeof requestAnimationFrame;
});

function dispatchWindowMessage(data: unknown): void {
  for (const listener of windowListeners.get('message') || []) {
    listener({ origin: 'http://127.0.0.1:5174', data });
  }
}

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
});

describe('NullCitySpectatorBridge', () => {
  const packet = (opcode: number, receivedAt: string) => ({
    opcode,
    receivedAt,
    payload: {
      opcode,
      type: 'server',
      updateTask: false,
      payloadLength: 0,
      payloadBase64: '',
      frameLength: 0,
      frameBase64: '',
    },
  } as const);

  test('starts the RuneScape spectator iframe when a session is present', () => {
    const container = new FakeElement('div');
    const bridge = new NullCitySpectatorBridge(container as unknown as HTMLElement, '/spectator.html');
    const session: SpectatorSession = {
      id: 'observe-res-hans',
      subject: { kind: 'resident', name: 'res:hans' },
      mode: 'follow',
      connected: true,
      position: { x: 3222, y: 3218, level: 0 },
      packets: [],
    };

    bridge.setSession(session);

    const iframe = container.children[0] as FakeIframe;
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.src).toBe('/spectator.html');
    expect(container.children.at(1)?.className).toBe('spectator-status');
  });

  test('posts the session position after the RuneScape spectator iframe reports ready', () => {
    const container = new FakeElement('div');
    const bridge = new NullCitySpectatorBridge(container as unknown as HTMLElement, '/spectator.html');
    const session: SpectatorSession = {
      id: 'observe-res-hans',
      subject: { kind: 'resident', name: 'res:hans' },
      mode: 'follow',
      connected: true,
      position: { x: 3222, y: 3218, level: 0 },
      packets: [],
    };

    bridge.setSession(session);

    const iframe = container.children[0] as FakeIframe;
    iframe.dispatch('load');
    expect(iframe.postedMessages).toEqual([]);
    dispatchWindowMessage({ type: 'nullcity:spectator-ready' });

    expect(iframe.postedMessages).toContainEqual({
      type: 'nullcity:spectator-session',
      sessionId: 'observe-res-hans',
      subject: { kind: 'resident', name: 'res:hans' },
      position: { x: 3222, y: 3218, level: 0 },
      actors: [],
    });
  });

  test('posts visible perception actors to the RuneScape iframe', () => {
    const container = new FakeElement('div');
    const bridge = new NullCitySpectatorBridge(container as unknown as HTMLElement, '/spectator.html');
    const session: SpectatorSession = {
      id: 'observe-res-hans',
      subject: { kind: 'resident', name: 'res:hans' },
      mode: 'follow',
      connected: true,
      position: { x: 3222, y: 3218, level: 0 },
      latestPerception: {
        nearby: {
          players: [
            { id: 'resident:father-aereck', kind: 'resident', name: 'res:father-aereck', position: { x: 3242, y: 3207, level: 0 } },
            { id: 'player:guest', kind: 'player', name: 'guest', position: { x: 3224, y: 3218, level: 0 } },
          ],
          npcs: [
            { id: 'npc:bob', kind: 'npc', name: 'Bob', position: { x: 3230, y: 3205, level: 0 } },
          ],
        },
      },
      packets: [],
    };

    bridge.setSession(session);

    const iframe = container.children[0] as FakeIframe;
    iframe.dispatch('load');
    dispatchWindowMessage({ type: 'nullcity:spectator-ready' });

    expect(iframe.postedMessages).toContainEqual({
      type: 'nullcity:spectator-session',
      sessionId: 'observe-res-hans',
      subject: { kind: 'resident', name: 'res:hans' },
      position: { x: 3222, y: 3218, level: 0 },
      actors: [
        { id: 'resident:father-aereck', kind: 'resident', name: 'res:father-aereck', position: { x: 3242, y: 3207, level: 0 } },
        { id: 'player:guest', kind: 'player', name: 'guest', position: { x: 3224, y: 3218, level: 0 } },
        { id: 'npc:bob', kind: 'npc', name: 'Bob', position: { x: 3230, y: 3205, level: 0 } },
      ],
    });
  });

  test('does not repost packets when a rolling session window changes packet indexes', () => {
    const container = new FakeElement('div');
    const bridge = new NullCitySpectatorBridge(container as unknown as HTMLElement, '/spectator.html');
    const packetA = packet(23, '2026-06-05T02:00:00.000Z');
    const packetB = packet(166, '2026-06-05T02:00:01.000Z');
    const packetC = packet(57, '2026-06-05T02:00:02.000Z');
    const session: SpectatorSession = {
      id: 'observe-res-hans',
      subject: { kind: 'resident', name: 'res:hans' },
      mode: 'follow',
      connected: true,
      position: { x: 3222, y: 3218, level: 0 },
      packets: [packetA, packetB],
    };

    bridge.setSession(session);

    const iframe = container.children[0] as FakeIframe;
    iframe.dispatch('load');
    dispatchWindowMessage({ type: 'nullcity:spectator-ready' });
    iframe.postedMessages = [];

    bridge.setSession({ ...session, packets: [packetB, packetC] });

    expect(iframe.postedMessages.filter(message => (message as { type?: string }).type === 'nullcity:spectator-packet')).toEqual([
      { type: 'nullcity:spectator-packet', sessionId: 'observe-res-hans', packet: packetC.payload },
    ]);
  });

  test('does not call the RuneScape iframe live before it confirms render readiness', () => {
    const container = new FakeElement('div');
    const bridge = new NullCitySpectatorBridge(container as unknown as HTMLElement, '/spectator.html');
    const session: SpectatorSession = {
      id: 'observe-res-hans',
      subject: { kind: 'resident', name: 'res:hans' },
      mode: 'follow',
      connected: true,
      position: { x: 3222, y: 3218, level: 0 },
      packets: [packet(23, '2026-06-05T02:00:00.000Z')],
    };

    bridge.setSession(session);

    expect(container.children.at(1)?.textContent).toBe('RuneScape packets loaded; waiting for 3D render');
  });

  test('keeps the live status after the RuneScape iframe confirms render readiness', () => {
    const container = new FakeElement('div');
    const bridge = new NullCitySpectatorBridge(container as unknown as HTMLElement, '/spectator.html');
    const session: SpectatorSession = {
      id: 'observe-res-hans',
      subject: { kind: 'resident', name: 'res:hans' },
      mode: 'follow',
      connected: true,
      position: { x: 3222, y: 3218, level: 0 },
      packets: [packet(166, '2026-06-05T02:00:00.000Z')],
    };

    bridge.setSession(session);
    const iframe = container.children[0] as FakeIframe;
    iframe.dispatch('load');
    dispatchWindowMessage({ type: 'nullcity:spectator-ready' });
    dispatchWindowMessage({ type: 'nullcity:spectator-status', text: 'RuneScape view live' });

    bridge.setSession({ ...session, packets: [...session.packets!, packet(82, '2026-06-05T02:00:01.000Z')] });

    expect(container.children.at(1)?.textContent).toBe('RuneScape view live');
  });
});
