import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { SpectatorSession } from '@nullcity-dashboard/shared';
import { NullCitySpectatorBridge } from './src/index';

type FakeListener = () => void;

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
    addEventListener() {},
    removeEventListener() {},
  } as unknown as Window & typeof globalThis;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.requestAnimationFrame = (() => 0) as unknown as typeof requestAnimationFrame;
});

afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
});

describe('NullCitySpectatorBridge', () => {
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

  test('posts the session position to the RuneScape spectator iframe after it loads', () => {
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

    expect(iframe.postedMessages).toContainEqual({
      type: 'nullcity:spectator-session',
      sessionId: 'observe-res-hans',
      subject: { kind: 'resident', name: 'res:hans' },
      position: { x: 3222, y: 3218, level: 0 },
    });
  });
});
