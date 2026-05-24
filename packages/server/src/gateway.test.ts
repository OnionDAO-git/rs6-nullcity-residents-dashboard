import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test } from 'bun:test';
import { WebSocket, WebSocketServer } from 'ws';
import { GatewayClient } from './gateway';

describe('GatewayClient resident feeds', () => {
  const servers: WebSocketServer[] = [];

  afterEach(() => {
    for (const server of servers) {
      for (const client of server.clients) {
        client.terminate();
      }
      server.close();
    }
    servers.splice(0, servers.length);
  });

  test('reattaches resident feeds after the gateway socket reconnects', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await onceListening(server);
    const sockets = new Set<WebSocket>();
    let attachCount = 0;

    server.on('connection', socket => {
      sockets.add(socket);
      socket.on('message', raw => {
        const message = JSON.parse(raw.toString()) as { id?: string; kind?: string };
        if (message.kind === 'controller_hello') {
          socket.send(JSON.stringify({ v: 1, id: message.id, kind: 'ok', payload: { ok: true } }));
          return;
        }
        if (message.kind === 'attach') {
          attachCount += 1;
          socket.send(
            JSON.stringify({
              v: 1,
              kind: 'perception',
              payload: {
                resident_id: 'resident:res:agent',
                perception: perceptionForTick(attachCount),
              },
            }),
          );
          socket.send(JSON.stringify({ v: 1, id: message.id, kind: 'ok', payload: { ok: true } }));
        }
      });
    });

    const port = (server.address() as AddressInfo).port;
    const client = new GatewayClient(`ws://127.0.0.1:${port}`);
    const first = await client.subscribeResidentFeed('res:agent');

    expect(attachCount).toBe(1);
    expect((first.latestPerception as { tick?: number } | undefined)?.tick).toBe(1);

    for (const socket of sockets) {
      socket.close();
    }
    await waitFor(() => !client.status().connected);

    const second = await client.subscribeResidentFeed('res:agent');

    expect(attachCount).toBe(2);
    expect((second.latestPerception as { tick?: number } | undefined)?.tick).toBe(2);
  });
});

function perceptionForTick(tick: number): Record<string, unknown> {
  return {
    tick,
    resident: {
      id: 'resident:res:agent',
      position: { x: 3215, y: 3230, level: 0 },
      hp: { current: 3 + tick, max: 10 },
    },
    nearby: { players: [], npcs: [], objects: [], worldItems: [] },
    events: [],
    availableActions: [],
  };
}

async function onceListening(server: WebSocketServer): Promise<void> {
  if (server.address()) {
    return;
  }
  await new Promise<void>(resolve => server.once('listening', resolve));
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
