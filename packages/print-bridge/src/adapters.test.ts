import { describe, expect, test } from 'bun:test';
import { BambuLanAdapter, bambuLanState, createPrinterAdapter, fdmMonsterState, moonrakerState } from './adapters';
import type { BambuFtpTransport, BambuMqttTransport } from './adapters/bambu-lan';

describe('printer adapter mapping', () => {
  test('maps FDM Monster status strings into bridge states', () => {
    expect(fdmMonsterState('Printing')).toBe('printing');
    expect(fdmMonsterState('Operational')).toBe('idle');
    expect(fdmMonsterState('Disconnected')).toBe('offline');
    expect(fdmMonsterState('Error')).toBe('error');
  });

  test('maps Moonraker status strings into bridge states', () => {
    expect(moonrakerState('printing')).toBe('printing');
    expect(moonrakerState('paused')).toBe('paused');
    expect(moonrakerState('complete')).toBe('idle');
    expect(moonrakerState('shutdown')).toBe('offline');
  });

  test('constructs the requested adapter implementation', () => {
    expect(createPrinterAdapter({ kind: 'dry-run', id: 'dry-1' }).kind).toBe('dry-run');
    expect(createPrinterAdapter({ kind: 'snapmaker-u1', id: 'snap-1', baseUrl: 'http://snapmaker.test' }).kind).toBe('snapmaker-u1');
    expect(createPrinterAdapter({ kind: 'bambu-lan', id: 'bambu-1' }).kind).toBe('bambu-lan');
  });

  test('maps Bambu LAN report states into bridge states', () => {
    expect(bambuLanState('RUNNING')).toBe('printing');
    expect(bambuLanState('PAUSE')).toBe('paused');
    expect(bambuLanState('FINISH')).toBe('idle');
    expect(bambuLanState('FAILED')).toBe('error');
  });

  test('uploads and starts Bambu LAN gcode over FTPS and MQTT', async () => {
    const mqtt = new FakeBambuMqttTransport({ print: { gcode_state: 'RUNNING', mc_percent: 42, gcode_file: 'cache/part.gcode' } });
    const ftp = new FakeBambuFtpTransport();
    const adapter = new BambuLanAdapter({
      id: 'bambu-1',
      host: '192.168.1.50',
      serial: '01P00A123456789',
      accessCode: '12345678',
      mqtt: () => mqtt,
      ftp: () => ftp,
      sequence: () => 'seq-1',
    });

    const status = await adapter.getStatus();
    expect(status.state).toBe('printing');
    expect(status.progress).toBe(0.42);
    expect(mqtt.published[0]).toMatchObject({
      topic: 'device/01P00A123456789/request',
      payload: { pushing: { command: 'pushall' } },
    });

    const uploaded = await adapter.uploadJob({
      job: { id: 'job-1', printRequestId: 'print-1', title: 'Part', quantity: 1 },
      artifactPath: '/tmp/part.gcode',
    });
    expect(ftp.uploads).toEqual([{ localPath: '/tmp/part.gcode', remotePath: 'cache/part.gcode' }]);
    expect(uploaded.remoteFileRef).toBe('cache/part.gcode');

    const started = await adapter.startJob(uploaded);
    expect(started.ok).toBe(true);
    expect(mqtt.published.at(-1)).toMatchObject({
      topic: 'device/01P00A123456789/request',
      payload: { print: { command: 'gcode_file', param: 'cache/part.gcode' } },
      qos: 1,
    });
  });

  test('publishes Bambu LAN project_file, pause, resume, and stop commands', async () => {
    const mqtt = new FakeBambuMqttTransport({ print: { gcode_state: 'IDLE' } });
    const adapter = new BambuLanAdapter({
      id: 'bambu-1',
      host: '192.168.1.50',
      serial: '01P00A123456789',
      accessCode: '12345678',
      mqtt: () => mqtt,
      ftp: () => new FakeBambuFtpTransport(),
      sequence: () => 'seq-2',
    });

    await adapter.startJob({
      adapterJobId: 'bambu-lan:cache/build.3mf',
      remoteFileRef: 'cache/build.3mf',
      raw: { metadata: { bambu: { md5: 'abc123', param: 'Metadata/plate_2.gcode', useAms: true, amsMapping: [0, 1] } } },
    });
    await adapter.pauseJob('job-1');
    await adapter.resumeJob('job-1');
    await adapter.cancelJob('job-1');

    expect(mqtt.published[0]?.payload).toMatchObject({
      print: {
        command: 'project_file',
        url: 'file:///sdcard/cache/build.3mf',
        param: 'Metadata/plate_2.gcode',
        md5: 'abc123',
        use_ams: true,
        ams_mapping: [0, 1],
      },
    });
    expect(mqtt.published.slice(1).map(entry => entry.payload.print.command)).toEqual(['pause', 'resume', 'stop']);
  });
});

class FakeBambuMqttTransport implements BambuMqttTransport {
  readonly published: Array<{ topic: string; payload: any; qos: 0 | 1 }> = [];

  constructor(private readonly report: unknown) {}

  async connect(): Promise<void> {}

  async publishJson(topic: string, payload: unknown, options: { qos?: 0 | 1 } = {}): Promise<void> {
    this.published.push({ topic, payload, qos: options.qos ?? 1 });
  }

  async requestReport(_reportTopic: string, requestTopic: string, payload: unknown, _timeoutMs: number): Promise<unknown> {
    await this.publishJson(requestTopic, payload, { qos: 1 });
    return this.report;
  }

  close(): void {}
}

class FakeBambuFtpTransport implements BambuFtpTransport {
  readonly uploads: Array<{ localPath: string; remotePath: string }> = [];

  async uploadFile(localPath: string, remotePath: string): Promise<unknown> {
    this.uploads.push({ localPath, remotePath });
    return { remotePath };
  }
}
