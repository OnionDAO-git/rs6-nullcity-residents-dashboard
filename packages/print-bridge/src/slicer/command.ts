import fs from 'node:fs/promises';
import path from 'node:path';
import type { SlicedArtifact, SliceJobInput, SlicerRunner } from '../types';

export interface CommandSlicerOptions {
  id: 'orca' | 'prusa' | 'bambu' | string;
  command: string;
  args: string[];
  profile?: string | undefined;
  outputExtension?: string;
  env?: Record<string, string> | undefined;
  cwd?: string | undefined;
}

export class CommandSlicerRunner implements SlicerRunner {
  readonly id: string;
  private readonly options: CommandSlicerOptions;

  constructor(options: CommandSlicerOptions) {
    this.id = options.id;
    this.options = options;
  }

  async slice(input: SliceJobInput): Promise<SlicedArtifact> {
    await fs.mkdir(input.outputDir, { recursive: true });
    const outputName = `${basenameNoExt(input.sourcePath)}.${this.options.outputExtension || 'gcode'}`;
    const outputPath = path.join(input.outputDir, outputName);
    const args = this.options.args.map(arg => template(arg, {
      input: input.sourcePath,
      output: outputPath,
      outputDir: input.outputDir,
      profile: input.job.slicerProfile || this.options.profile || '',
      material: input.job.requestedMaterial || '',
      color: input.job.requestedColor || '',
      title: input.job.title,
      jobId: input.job.id,
    }));
    const spawnOptions: Parameters<typeof Bun.spawn>[1] = {
      env: { ...process.env, ...this.options.env },
      stdout: 'pipe',
      stderr: 'pipe',
    };
    if (this.options.cwd) spawnOptions.cwd = this.options.cwd;
    const proc = Bun.spawn([this.options.command, ...args], spawnOptions);
    const [stdout, stderr, exitCode] = await Promise.all([
      streamText(proc.stdout),
      streamText(proc.stderr),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      throw new Error(`slicer ${this.id} exited ${exitCode}: ${stderr || stdout}`);
    }
    return {
      path: outputPath,
      fileName: outputName,
      raw: { stdout: stdout.trim(), stderr: stderr.trim(), command: this.options.command, args },
    };
  }
}

function template(value: string, vars: Record<string, string>): string {
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => vars[key] ?? '');
}

function basenameNoExt(filePath: string): string {
  const parsed = path.parse(filePath);
  return parsed.name || 'print';
}

function streamText(stream: ReadableStream<Uint8Array> | number | undefined): Promise<string> {
  return stream instanceof ReadableStream ? new Response(stream).text() : Promise.resolve('');
}
