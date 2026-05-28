import type { GameClientConfig } from '../orchestrator.js';
import type { GameSessionTicket } from '../session-ticket/index.js';

export type MaybePromise<T> = T | Promise<T>;

export interface GameClientHandle {
  destroy(): MaybePromise<void>;
}

export interface GameClientLifecycleContext {
  canvas: HTMLCanvasElement;
  config: GameClientConfig;
  signal: AbortSignal;
  ticket: GameSessionTicket;
}

export type LifecycleStart = (
  context: GameClientLifecycleContext,
) => MaybePromise<GameClientHandle | void>;

export interface LifecycleAdapter {
  start(context: GameClientLifecycleContext): MaybePromise<GameClientHandle>;
}

export function createLifecycleAdapter(start: LifecycleStart): LifecycleAdapter {
  return {
    async start(context) {
      const handle = await start(context);

      return handle ?? {
        destroy() {
          // No-op handles are useful while the forked runtime is being wired in.
        },
      };
    },
  };
}

export function createUnsupportedLifecycleAdapter(message = 'Game runtime is not wired yet.'): LifecycleAdapter {
  return {
    start() {
      throw new Error(message);
    },
  };
}
