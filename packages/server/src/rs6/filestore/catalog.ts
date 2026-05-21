import { getFilestore } from './boot.js';

// Use loose types here - pulling the concrete classes in would force a long
// import chain through the filestore package internals. We only touch the
// fields we actually need.
export type ItemConfigLike = {
  gameId: number;
  name: string | null;
  model3d: {
    maleModels: number[];
    maleHeadModels: number[];
    femaleModels: number[];
    femaleHeadModels: number[];
  };
  replacedColors?: [number, number][];
  replacedTextures?: [number, number][];
};

export type NpcConfigLike = {
  gameId: number;
  name: string | null;
  combatLevel: number;
  animations: { stand: number; walk: number };
  model: { models?: number[]; headModels?: number[] };
};

let _items: ItemConfigLike[] | null = null;
let _npcs: NpcConfigLike[] | null = null;

export function getItems(): ItemConfigLike[] {
  if (_items) return _items;
  const start = performance.now();
  const store = getFilestore();
  const decoded = store.configStore.itemStore.decodeItemStore() as unknown as ItemConfigLike[];
  _items = decoded;
  const elapsed = Math.round(performance.now() - start);
  console.log(`[catalog] decoded ${decoded.length} items in ${elapsed}ms`);
  return _items;
}

export function getNpcs(): NpcConfigLike[] {
  if (_npcs) return _npcs;
  const start = performance.now();
  const store = getFilestore();
  const decoded = store.configStore.npcStore.decodeNpcStore() as unknown as NpcConfigLike[];
  _npcs = decoded;
  const elapsed = Math.round(performance.now() - start);
  console.log(`[catalog] decoded ${decoded.length} npcs in ${elapsed}ms`);
  return _npcs;
}

export function itemHasModel(item: ItemConfigLike): boolean {
  const m = item.model3d;
  if (!m) return false;
  const lists = [m.maleModels, m.femaleModels, m.maleHeadModels, m.femaleHeadModels];
  for (const list of lists) {
    if (!list) continue;
    for (const id of list) {
      if (id !== -1 && id !== undefined && id !== null) return true;
    }
  }
  return false;
}

export function npcHasModel(npc: NpcConfigLike): boolean {
  const ids = npc.model?.models;
  if (!ids || ids.length === 0) return false;
  for (const id of ids) {
    if (id !== -1 && id !== undefined && id !== null) return true;
  }
  return false;
}

export function getModelIds(): number[] {
  const store = getFilestore();
  // modelStore.modelFileIndex is private; reach in for the file id list.
  // The FileIndex `files` map is keyed by id (Archive | FileData).
  const ms = (store as unknown as { modelStore: { modelFileIndex: { files: Map<number, unknown> } } })
    .modelStore;
  const fileIndex = (ms as unknown as { modelFileIndex: { files: Map<number, unknown> } }).modelFileIndex;
  if (!fileIndex || !fileIndex.files) return [];
  return Array.from(fileIndex.files.keys()).sort((a, b) => a - b);
}

const _modelMetaCache = new Map<number, { id: number; vertexCount: number; faceCount: number } | null>();

export function getModelMeta(id: number): { id: number; vertexCount: number; faceCount: number } | null {
  if (_modelMetaCache.has(id)) return _modelMetaCache.get(id) ?? null;
  const store = getFilestore();
  try {
    const m = store.modelStore.getModel(id);
    if (!m) {
      _modelMetaCache.set(id, null);
      return null;
    }
    const meta = { id, vertexCount: m.vertexCount, faceCount: m.faceCount };
    _modelMetaCache.set(id, meta);
    return meta;
  } catch {
    _modelMetaCache.set(id, null);
    return null;
  }
}
