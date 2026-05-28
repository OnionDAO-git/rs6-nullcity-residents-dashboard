export type {
  GameClientConfig,
  GameClientController,
  GameClientOptions,
  GameClientStatus,
  GameClientStatusListener,
} from './orchestrator.js';
export { createGameClient } from './orchestrator.js';

export type {
  CanvasAdapter,
  DomCanvasAdapterOptions,
} from './canvas/index.js';
export { createDomCanvasAdapter } from './canvas/index.js';

export type {
  GameClientHandle,
  GameClientLifecycleContext,
  LifecycleAdapter,
  LifecycleStart,
  MaybePromise,
} from './lifecycle/index.js';
export {
  createLifecycleAdapter,
  createUnsupportedLifecycleAdapter,
} from './lifecycle/index.js';

export type {
  ForkedRuntimeClient,
  ForkedRuntimeLifecycleOptions,
  ForkedRuntimeModule,
} from './runtime/index.js';
export { createForkedRuntimeLifecycleAdapter } from './runtime/index.js';

export type {
  GameSessionTicket,
  HttpSessionTicketAdapterOptions,
  SessionTicketAdapter,
} from './session-ticket/index.js';
export {
  createHttpSessionTicketAdapter,
  isGameSessionTicket,
} from './session-ticket/index.js';
