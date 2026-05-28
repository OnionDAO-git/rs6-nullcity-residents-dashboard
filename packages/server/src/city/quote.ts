import type { CityConfig } from './config';
import type { SoulQuote } from './types';

export interface SoulQuoteInput {
  startingLevels?: Record<string, number>;
  startingEquipment?: unknown[];
  startingInventory?: unknown[];
  complexity?: number;
}

export function quoteSoulProposal(input: SoulQuoteInput, config: CityConfig): SoulQuote {
  const levelCost = Object.values(input.startingLevels || {}).reduce((total, rawLevel) => {
    const level = Number(rawLevel);
    if (!Number.isFinite(level) || level <= 1) return total;
    return total + Math.floor(level) * config.skillLevelApCost;
  }, 0);
  const equipmentCost = estimateItemAp(input.startingEquipment, config.equipmentGpPerAp);
  const inventoryCost = estimateItemAp(input.startingInventory, config.inventoryGpPerAp);
  const complexityCost = Math.max(0, Math.floor(Number(input.complexity || 0) + config.complexityApCost));
  const threshold = config.baseBirthApCost + levelCost + equipmentCost + inventoryCost + complexityCost;

  return {
    threshold,
    breakdown: {
      base: config.baseBirthApCost,
      levels: levelCost,
      equipment: equipmentCost,
      inventory: inventoryCost,
      complexity: complexityCost,
    },
  };
}

function estimateItemAp(items: unknown[] | undefined, gpPerAp: number): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce<number>((total, item) => total + estimateOneItemAp(item, gpPerAp), 0);
}

function estimateOneItemAp(item: unknown, gpPerAp: number): number {
  if (typeof item !== 'object' || item === null) return 0;
  const record = item as Record<string, unknown>;
  const gpValue = Number(record.gpValue ?? record.value ?? record.gp_cost ?? 0);
  const quantity = Math.max(1, Math.floor(Number(record.quantity ?? 1)));
  if (!Number.isFinite(gpValue) || gpValue <= 0 || gpPerAp <= 0) return 0;
  return Math.ceil((gpValue * quantity) / gpPerAp);
}
