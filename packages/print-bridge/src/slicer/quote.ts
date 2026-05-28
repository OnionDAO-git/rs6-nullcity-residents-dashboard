import type { SlicedArtifactEstimate } from '../types';

export interface PrintQuoteRates {
  materialGpPerGram: number;
  machineGpPerHour: number;
  setupGp: number;
  minimumGp?: number;
}

export function estimatePrintQuoteGp(
  estimate: Pick<SlicedArtifactEstimate, 'filamentGrams' | 'printTimeSeconds'>,
  rates: PrintQuoteRates,
  quantity = 1,
): SlicedArtifactEstimate {
  const copies = Math.max(1, Math.floor(quantity));
  const filamentGrams = Math.max(0, estimate.filamentGrams || 0);
  const printTimeSeconds = Math.max(0, estimate.printTimeSeconds || 0);
  const materialCostGp = filamentGrams * rates.materialGpPerGram * copies;
  const machineCostGp = (printTimeSeconds / 3600) * rates.machineGpPerHour * copies;
  const setupCostGp = rates.setupGp;
  const totalGp = Math.max(rates.minimumGp || 0, Math.ceil(materialCostGp + machineCostGp + setupCostGp));
  return {
    filamentGrams: filamentGrams * copies,
    printTimeSeconds: printTimeSeconds * copies,
    materialCostGp,
    machineCostGp,
    setupCostGp,
    totalGp,
  };
}
