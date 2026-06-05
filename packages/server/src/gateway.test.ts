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

  test('reattaches an already-attached resident feed when it has gone stale', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await onceListening(server);
    let attachCount = 0;

    server.on('connection', socket => {
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
    first.lastFeedAt = new Date(Date.now() - 60_000).toISOString();

    const second = await client.subscribeResidentFeed('res:agent');

    expect(attachCount).toBe(2);
    expect((second.latestPerception as { tick?: number } | undefined)?.tick).toBe(2);
  });

  test('retains a spectator map bootstrap packet for late iframe replays', async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    servers.push(server);
    await onceListening(server);

    server.on('connection', socket => {
      socket.on('message', raw => {
        const message = JSON.parse(raw.toString()) as { id?: string; kind?: string; payload?: Record<string, unknown> };
        if (message.kind === 'controller_hello') {
          socket.send(JSON.stringify({ v: 1, id: message.id, kind: 'ok', payload: { ok: true } }));
          return;
        }
        if (message.kind === 'observe_subject') {
          const sessionId = 'spectator:test:hans';
          socket.send(JSON.stringify({
            v: 1,
            id: message.id,
            kind: 'spectator_connected',
            payload: {
              sessionId,
              subject: message.payload?.subject,
              initialState: { position: { x: 3221, y: 3217, level: 0 }, regionId: 12850 },
            },
          }));
          for (let index = 0; index < 760; index += 1) {
            const opcode = index === 0 ? 166 : 128;
            socket.send(JSON.stringify({
              v: 1,
              kind: 'spectator_packet',
              payload: { sessionId, opcode, payload: packetFrame(opcode, index) },
            }));
          }
        }
      });
    });

    const port = (server.address() as AddressInfo).port;
    const client = new GatewayClient(`ws://127.0.0.1:${port}`);
    await client.observe({ kind: 'resident', name: 'res:hans' }, 'follow');
    await waitFor(() => (client.getSession('spectator:test:hans')?.packets?.length || 0) >= 750);

    const packets = client.getSession('spectator:test:hans')?.packets || [];
    expect(packets.some(packet => packet.opcode === 166)).toBe(true);
    expect(packets.at(-1)?.opcode).toBe(128);
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

function packetFrame(opcode: number, index: number) {
  return {
    opcode,
    type: 'FIXED',
    updateTask: false,
    payloadLength: 1,
    payloadBase64: Buffer.from([index % 256]).toString('base64'),
    frameLength: 1,
    frameBase64: Buffer.from([index % 256]).toString('base64'),
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
