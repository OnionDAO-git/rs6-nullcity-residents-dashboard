import fs from 'node:fs/promises';
import path from 'node:path';
import type { SlicedArtifact, SliceJobInput, SlicerRunner } from '../types';
import { estimatePrintQuoteGp, type PrintQuoteRates } from './quote';

export interface DryRunSlicerOptions {
  id?: string;
  rates?: PrintQuoteRates;
}

const defaultRates: PrintQuoteRates = {
  materialGpPerGram: 1,
  machineGpPerHour: 4,
  setupGp: 5,
  minimumGp: 10,
};

export class DryRunSlicerRunner implements SlicerRunner {
  readonly id: string;
  private readonly rates: PrintQuoteRates;

  constructor(options: DryRunSlicerOptions = {}) {
    this.id = options.id || 'dry-run';
    this.rates = options.rates || defaultRates;
  }

  async slice(input: SliceJobInput): Promise<SlicedArtifact> {
    await fs.mkdir(input.outputDir, { recursive: true });
    const outputName = `${slug(input.job.title || input.job.id)}.gcode`;
    const outputPath = path.join(input.outputDir, outputName);
    const sourceStats = await fileStats(input.sourcePath);
    const filamentGrams = Math.max(1, Math.round((sourceStats.size / 1024 / 1024) * 12 * 10) / 10);
    const printTimeSeconds = Math.max(15 * 60, Math.round(filamentGrams * 8 * 60));
    const estimate = estimatePrintQuoteGp({ filamentGrams, printTimeSeconds }, this.rates, input.job.quantity);
    await fs.writeFile(
      outputPath,
      [
        '; Null City dry-run slicer output',
        `; job=${input.job.id}`,
        `; source=${input.sourcePath}`,
        `; filament_grams=${estimate.filamentGrams}`,
        `; print_time_seconds=${estimate.printTimeSeconds}`,
        'G28',
        'M84',
        '',
      ].join('\n'),
      'utf8',
    );
    return { path: outputPath, fileName: outputName, estimate };
  }
}

async function fileStats(filePath: string): Promise<{ size: number }> {
  try {
    return await fs.stat(filePath);
  } catch {
    return { size: 1024 * 1024 };
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'print';
}
