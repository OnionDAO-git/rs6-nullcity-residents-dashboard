// ObjType facade. The @runejs/filestore ItemStore already parses opcodes 23,
// 24, 25, 26, 78, 79, 90, 91, 92, 93 - which cover manwear/womanwear[0..2]
// and manhead/womanhead[0..1]. We just project those into the field names
// the client uses (manwear/manwear2/manwear3, etc.) for clarity.
//
// Source: rs6-nullcity-client-ts/src/config/ObjType.ts:43-54.
// Cross-check against runejs/rs6-filestore/src/filestore/stores/configs/item-store.ts:296-419.

import { getItems, type ItemConfigLike } from '../filestore/catalog.js';

export interface ObjTypeExtended {
  id: number;
  name: string | null;
  manwear: number; // model file id, or -1
  manwear2: number;
  manwear3: number;
  manwearOffset: number;
  womanwear: number;
  womanwear2: number;
  womanwear3: number;
  womanwearOffset: number;
  manhead: number;
  manhead2: number;
  womanhead: number;
  womanhead2: number;
  recolSrc: number[];
  recolDst: number[];
  retextureSrc: number[];
  retextureDst: number[];
}

function lift(item: ItemConfigLike): ObjTypeExtended {
  const m = item.model3d ?? ({} as any);
  const mw: number[] = m.maleModels ?? [-1, -1, -1];
  const ww: number[] = m.femaleModels ?? [-1, -1, -1];
  const mh: number[] = m.maleHeadModels ?? [-1, -1];
  const wh: number[] = m.femaleHeadModels ?? [-1, -1];
  const rc = item.replacedColors ?? [];
  const rt = item.replacedTextures ?? [];
  const mOff = (m as any).maleModelOffset ?? 0;
  const wOff = (m as any).femaleModelOffset ?? 0;
  return {
    id: item.gameId,
    name: item.name ?? null,
    manwear: mw[0] ?? -1,
    manwear2: mw[1] ?? -1,
    manwear3: mw[2] ?? -1,
    manwearOffset: mOff,
    womanwear: ww[0] ?? -1,
    womanwear2: ww[1] ?? -1,
    womanwear3: ww[2] ?? -1,
    womanwearOffset: wOff,
    manhead: mh[0] ?? -1,
    manhead2: mh[1] ?? -1,
    womanhead: wh[0] ?? -1,
    womanhead2: wh[1] ?? -1,
    recolSrc: rc.map((p) => p[0]),
    recolDst: rc.map((p) => p[1]),
    retextureSrc: rt.map((p) => p[0]),
    retextureDst: rt.map((p) => p[1]),
  };
}

export function getObjType(id: number): ObjTypeExtended | null {
  const items = getItems();
  const item = items[id];
  if (!item) return null;
  return lift(item);
}

export function pickWearModels(
  obj: ObjTypeExtended,
  gender: 'M' | 'F',
): number[] {
  const out: number[] = [];
  if (gender === 'F') {
    if (obj.womanwear !== -1) out.push(obj.womanwear);
    if (obj.womanwear2 !== -1) out.push(obj.womanwear2);
    if (obj.womanwear3 !== -1) out.push(obj.womanwear3);
  } else {
    if (obj.manwear !== -1) out.push(obj.manwear);
    if (obj.manwear2 !== -1) out.push(obj.manwear2);
    if (obj.manwear3 !== -1) out.push(obj.manwear3);
  }
  return out;
}

export function pickHeadModels(
  obj: ObjTypeExtended,
  gender: 'M' | 'F',
): number[] {
  const out: number[] = [];
  if (gender === 'F') {
    if (obj.womanhead !== -1) out.push(obj.womanhead);
    if (obj.womanhead2 !== -1) out.push(obj.womanhead2);
  } else {
    if (obj.manhead !== -1) out.push(obj.manhead);
    if (obj.manhead2 !== -1) out.push(obj.manhead2);
  }
  return out;
}

export function wearOffset(obj: ObjTypeExtended, gender: 'M' | 'F'): number {
  return gender === 'F' ? obj.womanwearOffset : obj.manwearOffset;
}
