import { BambuLanAdapter, type BambuLanAdapterOptions } from './bambu-lan';
import { DryRunPrinterAdapter, type DryRunPrinterAdapterOptions } from './dry-run';
import { FdmMonsterAdapter, type FdmMonsterAdapterOptions } from './fdm-monster';
import { MoonrakerAdapter, type MoonrakerAdapterOptions } from './moonraker';
import type { PrinterAdapter, PrinterAdapterKind } from '../types';

export type PrinterAdapterConfig =
  | ({ kind: 'dry-run' } & DryRunPrinterAdapterOptions)
  | ({ kind: 'fdm-monster' } & FdmMonsterAdapterOptions)
  | ({ kind: 'moonraker' } & MoonrakerAdapterOptions)
  | ({ kind: 'snapmaker-u1' } & Omit<MoonrakerAdapterOptions, 'kind'>)
  | ({ kind: 'bambu-lan' } & BambuLanAdapterOptions);

export function createPrinterAdapter(config: PrinterAdapterConfig): PrinterAdapter {
  switch (config.kind) {
    case 'dry-run':
      return new DryRunPrinterAdapter(config);
    case 'fdm-monster':
      return new FdmMonsterAdapter(config);
    case 'moonraker':
      return new MoonrakerAdapter(config);
    case 'snapmaker-u1':
      return new MoonrakerAdapter({ ...config, kind: 'snapmaker-u1' });
    case 'bambu-lan':
      return new BambuLanAdapter(config);
  }
}

export function adapterKind(value: string | undefined): PrinterAdapterKind {
  if (value === 'fdm-monster' || value === 'moonraker' || value === 'snapmaker-u1' || value === 'bambu-lan') return value;
  return 'dry-run';
}

export { BambuLanAdapter, bambuLanState } from './bambu-lan';
export type { BambuFtpTransport, BambuMqttTransport } from './bambu-lan';
export { DryRunPrinterAdapter } from './dry-run';
export { FdmMonsterAdapter, fdmMonsterState } from './fdm-monster';
export { MoonrakerAdapter, moonrakerState } from './moonraker';
