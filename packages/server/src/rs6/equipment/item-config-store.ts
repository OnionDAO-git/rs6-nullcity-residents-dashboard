// Equipment item-config store.
//
// Loads the JSON item config tree at `packages/server/data/item-config/`
// (mirrored from `rs6-nullcity-server/data/config/items/`) and indexes the
// `equipment_data` block by `game_id`. The dashboard's compose + save-load
// pipelines consult this store to mirror the server's wire packet behavior
// in `rs6-nullcity-server/src/engine/world/actor/player/sync/player-sync-task.ts`
// (the cross-slot hide rules at lines 255-297).
//
// Mirrors the loader at `rs6-nullcity-server/src/engine/config/item-config.ts:279`
// (`loadItemConfigurations`): supports `presets` + `extends`, plus `variations`
// where each variation inherits the parent's fields and contributes its own
// `game_id`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type EquipmentType =
    | 'hat'
    | 'helmet'
    | 'torso'
    | 'full_top'
    | 'one_handed'
    | 'two_handed';

export type EquipmentSlotName =
    | 'head'
    | 'back'
    | 'neck'
    | 'main_hand'
    | 'off_hand'
    | 'torso'
    | 'legs'
    | 'hands'
    | 'feet'
    | 'ring'
    | 'quiver'
    | '2h';

interface EquipmentDataJson {
    equipment_slot?: EquipmentSlotName;
    equipment_type?: EquipmentType;
    [k: string]: unknown;
}

interface ItemConfigJson {
    extends?: string | string[];
    game_id?: number;
    equipment_data?: EquipmentDataJson;
    variations?: Array<
        ItemConfigJson & {
            suffix?: string;
            game_id?: number;
        }
    >;
    [k: string]: unknown;
}

interface EquipmentEntry {
    equipmentSlot: EquipmentSlotName | null;
    equipmentType: EquipmentType | null;
}

interface ItemConfigIndex {
    byGameId: Map<number, EquipmentEntry>;
}

// ---------------------------------------------------------------------------
// Lazy singleton - same pattern as filestore/idk catalogs in this package.
// ---------------------------------------------------------------------------

let cached: ItemConfigIndex | null = null;

function configRoot(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    // packages/server/src/rs6/equipment/ -> ../data/item-config
    return path.resolve(here, '..', 'data', 'item-config');
}

function walkJsonFiles(root: string, out: string[] = []): string[] {
    let entries: string[];
    try {
        entries = readdirSync(root);
    } catch {
        return out;
    }
    for (const entry of entries) {
        const full = path.join(root, entry);
        let st;
        try {
            st = statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) {
            walkJsonFiles(full, out);
        } else if (st.isFile() && entry.toLowerCase().endsWith('.json')) {
            out.push(full);
        }
    }
    return out;
}

// Subset of the server's deepMerge sufficient for our needs (`equipment_data`
// is a flat-ish object - preset has slot/requirements/bonuses, item overrides
// or adds the missing pieces). Mirrors objectA-takes-priority semantics from
// `rs6-nullcity-server/src/engine/util/objects.ts`.
function deepMerge<T>(a: T, b: T): T {
    if (a === undefined || a === null) return b;
    if (b === undefined || b === null) return a;
    if (Array.isArray(a) && Array.isArray(b)) {
        return Array.from(new Set([...(a as unknown[]), ...(b as unknown[])])) as unknown as T;
    }
    if (typeof a !== 'object' || typeof b !== 'object') return a;
    const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
    const keys = new Set([
        ...Object.keys(a as Record<string, unknown>),
        ...Object.keys(b as Record<string, unknown>),
    ]);
    for (const k of keys) {
        const av = (a as Record<string, unknown>)[k];
        const bv = (b as Record<string, unknown>)[k];
        if (av === undefined || av === null) {
            out[k] = bv;
            continue;
        }
        if (bv === undefined || bv === null) {
            out[k] = av;
            continue;
        }
        if (typeof av === 'object' && typeof bv === 'object' && !Array.isArray(av) && !Array.isArray(bv)) {
            out[k] = deepMerge(av, bv);
            continue;
        }
        // a wins.
        out[k] = av;
    }
    return out as T;
}

function extractEntry(cfg: ItemConfigJson): EquipmentEntry {
    const eq = cfg.equipment_data;
    if (!eq) return { equipmentSlot: null, equipmentType: null };
    return {
        equipmentSlot: eq.equipment_slot ?? null,
        equipmentType: eq.equipment_type ?? null,
    };
}

function loadIndex(): ItemConfigIndex {
    const t0 = Date.now();
    const root = configRoot();
    const files = walkJsonFiles(root);

    // First pass - collect presets and configurations separately.
    const presets: Record<string, ItemConfigJson> = {};
    const items: Record<string, ItemConfigJson> = {};

    for (const file of files) {
        let json: Record<string, unknown>;
        try {
            json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
        } catch (err) {
            console.warn(`[item-config] failed to parse ${file}: ${String(err)}`);
            continue;
        }
        for (const [key, value] of Object.entries(json)) {
            if (key === 'presets' && value && typeof value === 'object') {
                for (const [pk, pv] of Object.entries(value as Record<string, unknown>)) {
                    presets[pk] = pv as ItemConfigJson;
                }
            } else if (value && typeof value === 'object') {
                items[key] = value as ItemConfigJson;
            }
        }
    }

    const byGameId = new Map<number, EquipmentEntry>();

    function resolveExtends(item: ItemConfigJson): ItemConfigJson {
        if (!item.extends) return item;
        const extKeys = Array.isArray(item.extends) ? item.extends : [item.extends];
        let merged: ItemConfigJson = item;
        for (const k of extKeys) {
            const preset = presets[k];
            if (preset) merged = deepMerge(merged, preset);
        }
        return merged;
    }

    for (const [, cfg] of Object.entries(items)) {
        const resolved = resolveExtends(cfg);
        if (typeof resolved.game_id === 'number' && Number.isFinite(resolved.game_id)) {
            byGameId.set(resolved.game_id, extractEntry(resolved));
        }
        if (Array.isArray(resolved.variations)) {
            for (const sub of resolved.variations) {
                if (typeof sub.game_id !== 'number' || !Number.isFinite(sub.game_id)) continue;
                // Variations inherit the parent (excluding the `variations` field
                // itself); each sub carries its own game_id and may override
                // equipment_data.
                const parent: ItemConfigJson = { ...resolved };
                delete parent.variations;
                const subResolved = resolveExtends(sub);
                const merged = deepMerge(subResolved, parent);
                byGameId.set(sub.game_id, extractEntry(merged));
            }
        }
    }

    const elapsed = Date.now() - t0;
    console.log(`[item-config] indexed ${byGameId.size} equippable items in ${elapsed}ms`);

    return { byGameId };
}

function ensureLoaded(): ItemConfigIndex {
    if (!cached) cached = loadIndex();
    return cached;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Eagerly load (or reload) the item-config index. Optional - the lookup
 * helpers will lazy-load on first call.
 */
export function loadItemConfigs(): void {
    cached = loadIndex();
}

/**
 * Returns the `equipment_type` field for the given game item id, or null if
 * the item is unknown or has no equipment_type declared in its config.
 */
export function getEquipmentType(itemId: number): EquipmentType | null {
    const idx = ensureLoaded();
    const entry = idx.byGameId.get(itemId);
    return entry ? entry.equipmentType : null;
}

/**
 * Returns the `equipment_slot` field for the given game item id, or null if
 * unknown.
 */
export function getEquipmentSlotName(itemId: number): EquipmentSlotName | null {
    const idx = ensureLoaded();
    const entry = idx.byGameId.get(itemId);
    return entry ? entry.equipmentSlot : null;
}

/** Total number of items indexed (game_id-keyed). For diagnostics + tests. */
export function getIndexedItemCount(): number {
    return ensureLoaded().byGameId.size;
}
