export interface CanvasAdapter {
  mount(signal: AbortSignal): HTMLCanvasElement | Promise<HTMLCanvasElement>;
  unmount?(): void | Promise<void>;
}

export interface DomCanvasAdapterOptions {
  container: HTMLElement;
  canvas?: HTMLCanvasElement;
  id?: string;
  className?: string;
  width?: number;
  height?: number;
}

const DEFAULT_WIDTH = 765;
const DEFAULT_HEIGHT = 503;

export function createDomCanvasAdapter(options: DomCanvasAdapterOptions): CanvasAdapter {
  let mountedCanvas: HTMLCanvasElement | undefined;
  let createdCanvas = false;

  return {
    mount(signal) {
      if (signal.aborted) {
        throw new Error('Canvas mount was aborted.');
      }

      const canvas = options.canvas ?? document.createElement('canvas');
      createdCanvas = options.canvas === undefined;

      canvas.width = options.width ?? (canvas.width || DEFAULT_WIDTH);
      canvas.height = options.height ?? (canvas.height || DEFAULT_HEIGHT);

      if (options.id !== undefined) {
        canvas.id = options.id;
      }

      if (options.className !== undefined) {
        canvas.className = options.className;
      }

      if (!options.container.contains(canvas)) {
        options.container.append(canvas);
      }

      mountedCanvas = canvas;
      return canvas;
    },

    unmount() {
      if (createdCanvas) {
        mountedCanvas?.remove();
      }

      mountedCanvas = undefined;
      createdCanvas = false;
    },
  };
}
