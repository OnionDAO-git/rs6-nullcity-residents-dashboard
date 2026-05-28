import { describe, expect, test } from 'bun:test';
import { estimatePrintQuoteGp } from './slicer';

describe('print quote estimates', () => {
  test('combines material, machine, setup, quantity, and minimum GP', () => {
    expect(estimatePrintQuoteGp(
      { filamentGrams: 10, printTimeSeconds: 7200 },
      { materialGpPerGram: 2, machineGpPerHour: 5, setupGp: 3, minimumGp: 1 },
      2,
    )).toMatchObject({
      filamentGrams: 20,
      printTimeSeconds: 14400,
      materialCostGp: 40,
      machineCostGp: 20,
      setupCostGp: 3,
      totalGp: 63,
    });
  });
});
