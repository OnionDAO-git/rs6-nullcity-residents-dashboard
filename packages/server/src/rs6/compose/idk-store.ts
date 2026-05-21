// IdkType decoder. The @runejs/filestore package ships no IdkType decoder,
// so we re-implement it on top of the raw config archive (id 3 = "character").
// Source of opcodes: rs6-nullcity-client-ts/src/config/IdkType.ts:53-83.
//
// Opcode map:
//   1            part (u8)
//   2            count (u8) + count x u16 -> model[] (body-part model file ids)
//   3            disable = true
//   40..49       recol_s[code-40] = u16
//   50..59       recol_d[code-50] = u16
//   60..69       head[code-60]    = u16
//   0            terminator
//
// `part` encodes (gender x 7 + designerPartIndex): 0..6 male, 7..13 female.

import { getFilestore } from '../filestore/boot.js';

export interface IdkType {
  id: number;
  part: number; // 0..13; -1 if not set
  model: number[] | null; // body model ids
  head: number[]; // up to 5 head model ids (-1 = unset)
  recolSrc: number[]; // up to 6
  recolDst: number[];
  disable: boolean;
}

let _cache: Map<number, IdkType> | null = null;
let _allIds: number[] | null = null;
// Index from `part` value (0..13) -> ordered list of IdkType ids whose `part === key`.
let _byPart: Map<number, number[]> | null = null;

const CHARACTER_ARCHIVE_ID = 3;

function getArchive() {
  const store = getFilestore();
  return store.configStore.configIndex.getArchive(CHARACTER_ARCHIVE_ID);
}

function decode(id: number, content: any): IdkType {
  const idk: IdkType = {
    id,
    part: -1,
    model: null,
    head: [-1, -1, -1, -1, -1],
    recolSrc: [0, 0, 0, 0, 0, 0],
    recolDst: [0, 0, 0, 0, 0, 0],
    disable: false,
  };

  // content is a ByteBuffer (Uint8Array subclass with readerIndex).
  content.readerIndex = 0;

  while (true) {
    const code = content.get('BYTE', 'UNSIGNED');
    if (code === 0) break;

    if (code === 1) {
      idk.part = content.get('BYTE', 'UNSIGNED');
    } else if (code === 2) {
      const count = content.get('BYTE', 'UNSIGNED');
      const arr: number[] = new Array(count);
      for (let i = 0; i < count; i++) {
        arr[i] = content.get('SHORT', 'UNSIGNED');
      }
      idk.model = arr;
    } else if (code === 3) {
      idk.disable = true;
    } else if (code >= 40 && code < 50) {
      idk.recolSrc[code - 40] = content.get('SHORT', 'UNSIGNED');
    } else if (code >= 50 && code < 60) {
      idk.recolDst[code - 50] = content.get('SHORT', 'UNSIGNED');
    } else if (code >= 60 && code < 70) {
      idk.head[code - 60] = content.get('SHORT', 'UNSIGNED');
    }
  }

  content.readerIndex = 0;
  return idk;
}

function ensureLoaded(): void {
  if (_cache) return;
  _cache = new Map();
  _allIds = [];
  _byPart = new Map();
  const archive = getArchive();
  if (!archive) {
    console.warn('[idk-store] character archive (id 3) not found');
    return;
  }
  const start = performance.now();
  for (const [fileId, file] of archive.files) {
    if (!file || !(file as any).content) continue;
    const decoded = decode(fileId, (file as any).content);
    _cache.set(fileId, decoded);
    _allIds.push(fileId);
    if (decoded.part >= 0) {
      let list = _byPart.get(decoded.part);
      if (!list) {
        list = [];
        _byPart.set(decoded.part, list);
      }
      list.push(fileId);
    }
  }
  _allIds.sort((a, b) => a - b);
  for (const list of _byPart.values()) list.sort((a, b) => a - b);
  const elapsed = Math.round(performance.now() - start);
  console.log(`[idk-store] decoded ${_cache.size} IdkTypes in ${elapsed}ms`);
}

export function getIdkType(id: number): IdkType | null {
  ensureLoaded();
  return _cache!.get(id) ?? null;
}

export function listIdkIds(): number[] {
  ensureLoaded();
  return _allIds!.slice();
}

/**
 * Return all IdkType ids whose `part` matches the given key. `part` is the
 * (gender x 7 + designerPartIndex) value the client uses.
 */
export function getIdkIdsByPart(part: number): number[] {
  ensureLoaded();
  return (_byPart!.get(part) ?? []).slice();
}

/**
 * Mirrors `PlayerModel.setAppearance(null, gender, ...)` - find the first
 * non-disabled IdkType for each designer part 0..6 of the given gender.
 * Returns an array of 7 IdkType ids (designer index -> idk id), with -1 for
 * any missing slot.
 */
export function defaultIdkIdsForGender(gender: 'M' | 'F'): number[] {
  ensureLoaded();
  const out: number[] = new Array(7).fill(-1);
  const offset = gender === 'F' ? 7 : 0;
  for (let designerPart = 0; designerPart < 7; designerPart++) {
    const targetPart = designerPart + offset;
    const list = _byPart!.get(targetPart);
    if (!list) continue;
    // First non-disabled, in id order.
    for (const id of list) {
      const idk = _cache!.get(id);
      if (idk && !idk.disable) {
        out[designerPart] = id;
        break;
      }
    }
  }
  return out;
}
