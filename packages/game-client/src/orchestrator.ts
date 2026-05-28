import type { CanvasAdapter } from './canvas/index.js';
import type { GameClientHandle, LifecycleAdapter } from './lifecycle/index.js';
import type { GameSessionTicket, SessionTicketAdapter } from './session-ticket/index.js';

export type GameClientStatus =
  | 'idle'
  | 'mounting-canvas'
  | 'requesting-ticket'
  | 'starting-runtime'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

export type GameClientMode = 'player' | 'spectator' | 'debug';

export interface GameClientConfig {
  endpoint: string;
  secure: boolean;
  mode: GameClientMode;
  featureFlags?: Readonly<Record<string, boolean>>;
}

export type GameClientStatusListener = (
  status: GameClientStatus,
  detail?: unknown,
) => void;

export interface GameClientOptions {
  canvas: CanvasAdapter;
  session: SessionTicketAdapter;
  lifecycle: LifecycleAdapter;
  config: GameClientConfig;
  onStatusChange?: GameClientStatusListener;
}

export interface GameClientController {
  readonly status: GameClientStatus;
  readonly ticket: GameSessionTicket | undefined;
  start(): Promise<void>;
  destroy(): Promise<void>;
}

export function createGameClient(options: GameClientOptions): GameClientController {
  let status: GameClientStatus = 'idle';
  let ticket: GameSessionTicket | undefined;
  let handle: GameClientHandle | undefined;
  let abortController: AbortController | undefined;
  let startPromise: Promise<void> | undefined;

  const setStatus = (nextStatus: GameClientStatus, detail?: unknown) => {
    status = nextStatus;
    options.onStatusChange?.(nextStatus, detail);
  };

  return {
    get status() {
      return status;
    },

    get ticket() {
      return ticket;
    },

    async start() {
      if (status === 'running') {
        return;
      }

      if (startPromise !== undefined) {
        return startPromise;
      }

      startPromise = startInternal().finally(() => {
        startPromise = undefined;
      });

      return startPromise;
    },

    async destroy() {
      await cleanup(ticket);
      setStatus('stopped');
    },
  };

  async function startInternal() {
      abortController = new AbortController();
      const signal = abortController.signal;

      try {
        setStatus('mounting-canvas');
        const canvas = await options.canvas.mount(signal);

        setStatus('requesting-ticket');
        ticket = await options.session.createTicket(signal);

        setStatus('starting-runtime');
        handle = await options.lifecycle.start({
          canvas,
          config: options.config,
          signal,
          ticket,
        });

        setStatus('running');
      } catch (error) {
        await cleanup(ticket);
        setStatus('error', error);
        throw error;
      }
  }

  async function cleanup(activeTicket: GameSessionTicket | undefined) {
    setStatus('stopping');
    abortController?.abort();
    abortController = undefined;

    try {
      await handle?.destroy();
    } finally {
      handle = undefined;
      await options.canvas.unmount?.();
      await options.session.logout?.(activeTicket);
      ticket = undefined;
    }
  }
}
