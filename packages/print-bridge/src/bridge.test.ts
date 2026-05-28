import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { DryRunPrinterAdapter } from './adapters';
import { PrintBridgeClient } from './bridge';
import { DryRunSlicerRunner } from './slicer';
import type { BridgeHeartbeatPayload, CityJobStatusUpdate, CityPrintQueueClient, PrintBridgeJob } from './types';

describe('print bridge client', () => {
  test('runs a dry-run job through slice, upload, start, heartbeat, and completion', async () => {
    let now = new Date('2026-05-27T12:00:00.000Z').getTime();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'print-bridge-'));
    const sourcePath = path.join(root, 'part.stl');
    await fs.writeFile(sourcePath, 'solid part\nendsolid part\n', 'utf8');
    const city = new MemoryCityClient({
      id: 'queue-1',
      printRequestId: 'print-1',
      title: 'Resident miniature',
      sourceFilePath: sourcePath,
      quantity: 1,
    });
    const bridge = new PrintBridgeClient({
      bridgeId: 'bridge-1',
      city,
      adapters: [new DryRunPrinterAdapter({ id: 'dry-printer', now: () => now, completeAfterMs: 1000 })],
      slicer: new DryRunSlicerRunner(),
      workDir: root,
      now: () => new Date(now),
    });

    await bridge.tick();
    expect(city.statuses.map(status => status.status)).toEqual(['claimed', 'slicing', 'queued', 'queued', 'printing']);
    expect(city.heartbeats[0]).toMatchObject({
      bridgeId: 'bridge-1',
      at: '2026-05-27T12:00:00.000Z',
      printers: [{ printerId: 'dry-printer', state: 'idle' }],
    });

    now += 1500;
    await bridge.tick();
    expect(city.statuses.at(-1)).toMatchObject({ status: 'completed', jobId: 'queue-1' });
  });

  test('emits active job heartbeat payloads', async () => {
    let now = new Date('2026-05-27T12:00:00.000Z').getTime();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'print-bridge-heartbeat-'));
    const city = new MemoryCityClient({ id: 'queue-2', printRequestId: 'print-2', title: 'Token', quantity: 1 });
    const bridge = new PrintBridgeClient({
      bridgeId: 'bridge-2',
      city,
      adapters: [new DryRunPrinterAdapter({ id: 'dry-printer', now: () => now, completeAfterMs: 10_000 })],
      slicer: new DryRunSlicerRunner(),
      workDir: root,
      now: () => new Date(now),
    });

    await bridge.tick();
    now += 1000;
    await bridge.tick();

    expect(city.heartbeats.at(-1)).toMatchObject({
      bridgeId: 'bridge-2',
      currentJobId: 'queue-2',
      printers: [{ printerId: 'dry-printer', state: 'printing' }],
    });
  });
});

class MemoryCityClient implements CityPrintQueueClient {
  readonly statuses: CityJobStatusUpdate[] = [];
  readonly heartbeats: BridgeHeartbeatPayload[] = [];
  private job: PrintBridgeJob | undefined;

  constructor(job: PrintBridgeJob) {
    this.job = job;
  }

  async claimNextJob(_input: { bridgeId: string; printerIds: string[] }): Promise<PrintBridgeJob | undefined> {
    const job = this.job;
    this.job = undefined;
    return job;
  }

  async updateJobStatus(update: CityJobStatusUpdate): Promise<void> {
    this.statuses.push(update);
  }

  async heartbeat(payload: BridgeHeartbeatPayload): Promise<void> {
    this.heartbeats.push(payload);
  }
}
