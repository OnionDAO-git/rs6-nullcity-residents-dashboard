export interface GameSessionTicket {
  ticket: string;
  landingUserId: string;
  gameUsername: string;
  expiresAt: string;
  nonce: string;
}

export interface SessionTicketAdapter {
  createTicket(signal?: AbortSignal): Promise<GameSessionTicket>;
  logout?(ticket?: GameSessionTicket): Promise<void>;
}

export interface HttpSessionTicketAdapterOptions {
  sessionEndpoint?: string;
  logoutEndpoint?: string;
  fetcher?: typeof fetch;
  credentials?: RequestCredentials;
  csrfToken?: string | (() => string | Promise<string>);
  csrfHeader?: string;
}

export function createHttpSessionTicketAdapter(
  options: HttpSessionTicketAdapterOptions = {},
): SessionTicketAdapter {
  const sessionEndpoint = options.sessionEndpoint ?? '/api/game/session';
  const logoutEndpoint = options.logoutEndpoint ?? '/api/game/logout';
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const credentials = options.credentials ?? 'include';
  const csrfHeader = options.csrfHeader ?? 'x-csrf-token';
  const csrfTokensByTicket = new Map<string, string>();

  return {
    async createTicket(signal) {
      const csrfToken = await resolveCsrfToken(options.csrfToken);
      const request: RequestInit = {
        method: 'POST',
        credentials,
        headers: {
          [csrfHeader]: csrfToken,
        },
      };

      if (signal !== undefined) {
        request.signal = signal;
      }

      const response = await fetcher(sessionEndpoint, request);

      if (!response.ok) {
        throw new Error(`Failed to create game session ticket: ${response.status}`);
      }

      const body: unknown = await response.json();

      if (!isGameSessionTicket(body)) {
        throw new Error('Game session endpoint returned an invalid ticket payload.');
      }

      csrfTokensByTicket.set(body.ticket, csrfToken);
      return body;
    },

    async logout(ticket) {
      if (ticket === undefined) {
        return;
      }

      const csrfToken = csrfTokensByTicket.get(ticket.ticket) ?? await resolveCsrfToken(options.csrfToken);
      csrfTokensByTicket.delete(ticket.ticket);
      await fetcher(logoutEndpoint, {
        method: 'POST',
        credentials,
        headers: {
          'content-type': 'application/json',
          [csrfHeader]: csrfToken,
        },
        body: JSON.stringify({ ticket: ticket.ticket, nonce: ticket.nonce }),
      });
    },
  };
}

export function isGameSessionTicket(value: unknown): value is GameSessionTicket {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.ticket === 'string' &&
    typeof value.landingUserId === 'string' &&
    typeof value.gameUsername === 'string' &&
    typeof value.expiresAt === 'string' &&
    typeof value.nonce === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function resolveCsrfToken(
  token: HttpSessionTicketAdapterOptions['csrfToken'],
): Promise<string> {
  if (typeof token === 'function') {
    const resolved = await token();
    if (resolved.trim()) return resolved;
  } else if (typeof token === 'string' && token.trim()) {
    return token;
  }

  return cookieValue('city_csrf') || crypto.randomUUID();
}

function cookieValue(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    return decodeURIComponent(trimmed.slice(prefix.length));
  }

  return undefined;
}
