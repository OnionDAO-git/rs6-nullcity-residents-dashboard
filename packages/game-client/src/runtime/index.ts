import type { GameClientHandle, GameClientLifecycleContext, LifecycleAdapter } from '../lifecycle/index.js';

export interface ForkedRuntimeModule {
  Client?: new (nodeId: number, lowmem: boolean, members: boolean) => ForkedRuntimeClient;
  default?: new (nodeId: number, lowmem: boolean, members: boolean) => ForkedRuntimeClient;
}

export interface ForkedRuntimeClient {
  enableSpectatorMode?(): void;
  shutdown?(): void;
  stop?(): void;
}

export interface ForkedRuntimeLifecycleOptions {
  canvasId?: string;
  nodeId?: number;
  lowmem?: boolean;
  members?: boolean;
  loadModule?: (context: GameClientLifecycleContext) => Promise<ForkedRuntimeModule>;
}

const DEFAULT_CANVAS_ID = 'canvas';

export function createForkedRuntimeLifecycleAdapter(
  options: ForkedRuntimeLifecycleOptions = {},
): LifecycleAdapter {
  return {
    async start(context) {
      const previousCanvasId = context.canvas.id;
      const previousHost = runtimeGlobal().__NULLCITY_RS_HOST__;
      const previousSecure = runtimeGlobal().__NULLCITY_RS_SECURE__;

      context.canvas.id = (options.canvasId ?? previousCanvasId) || DEFAULT_CANVAS_ID;
      runtimeGlobal().__NULLCITY_RS_HOST__ = endpointHost(context.config.endpoint);
      runtimeGlobal().__NULLCITY_RS_SECURE__ = context.config.secure;

      try {
        const module = await loadRuntimeModule(options, context);
        const Client = module.Client ?? module.default;
        if (!Client) {
          throw new Error('Forked runtime module did not export Client or a default Client constructor.');
        }

        const client = new Client(options.nodeId ?? 0, options.lowmem ?? false, options.members ?? true);
        if (context.config.mode === 'spectator') {
          client.enableSpectatorMode?.();
        }

        return {
          destroy() {
            client.stop?.();
            client.shutdown?.();
            context.canvas.id = previousCanvasId;
            restoreRuntimeGlobal('__NULLCITY_RS_HOST__', previousHost);
            restoreRuntimeGlobal('__NULLCITY_RS_SECURE__', previousSecure);
          },
        } satisfies GameClientHandle;
      } catch (error) {
        context.canvas.id = previousCanvasId;
        restoreRuntimeGlobal('__NULLCITY_RS_HOST__', previousHost);
        restoreRuntimeGlobal('__NULLCITY_RS_SECURE__', previousSecure);
        throw error;
      }
    },
  };
}

async function loadRuntimeModule(
  options: ForkedRuntimeLifecycleOptions,
  context: GameClientLifecycleContext,
): Promise<ForkedRuntimeModule> {
  if (options.loadModule) {
    return options.loadModule(context);
  }

  throw new Error([
    'Forked Null City runtime is vendored but not directly importable yet.',
    'Blockers: upstream uses #/* and #3rdparty/* aliases, document.getElementById("canvas") at module import time, and Bun define-time process.env replacements.',
    'Pass loadModule after the app bundler maps those aliases to packages/game-client/src/runtime/upstream/src and injects build-time env values.',
  ].join(' '));
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint, window.location.href).host;
  } catch {
    return endpoint.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

function runtimeGlobal(): typeof globalThis & {
  __NULLCITY_RS_HOST__?: string;
  __NULLCITY_RS_SECURE__?: boolean;
} {
  return globalThis;
}

function restoreRuntimeGlobal<K extends '__NULLCITY_RS_HOST__' | '__NULLCITY_RS_SECURE__'>(
  key: K,
  value: (typeof globalThis & {
    __NULLCITY_RS_HOST__?: string;
    __NULLCITY_RS_SECURE__?: boolean;
  })[K],
): void {
  if (value === undefined) {
    delete runtimeGlobal()[key];
    return;
  }

  runtimeGlobal()[key] = value;
}
