import type { Appearance, Gender } from '../types';
import { BASE_PART_MAP } from '../types';
import { getFilestore } from '../filestore/boot';
import { getIdkType, type IdkType } from './idk-store';
import {
  getObjType,
  pickWearModels,
  wearOffset,
  type ObjTypeExtended,
} from './objtype-extra';
import { mergeMeshes, translateY, type MergedMesh, type SubMesh } from './merge';
import { recolour, RECOL_1D, RECOL_1S } from './recolour';
import { getEquipmentType } from '../equipment/item-config-store';

export interface BuildOptions {
  hiddenFaceCulling?: boolean;
}

function loadModelAsSubMesh(modelId: number): SubMesh | null {
  if (modelId === undefined || modelId === null || modelId < 0) return null;
  const store = getFilestore();
  let rs;
  try {
    rs = store.modelStore.getModel(modelId);
  } catch {
    return null;
  }
  if (!rs) return null;
  return {
    verticesX: (rs.verticesX as number[]).slice(),
    verticesY: (rs.verticesY as number[]).slice(),
    verticesZ: (rs.verticesZ as number[]).slice(),
    faceIndicesA: new Uint32Array(rs.faceIndicesA),
    faceIndicesB: new Uint32Array(rs.faceIndicesB),
    faceIndicesC: new Uint32Array(rs.faceIndicesC),
    faceColours: new Uint32Array(rs.faceColors),
    faceAlphas: rs.faceAlphas ? new Uint8Array(rs.faceAlphas) : null,
    vertexLabel: rs.vertexSkins ? Int32Array.from(rs.vertexSkins) : null,
    faceLabel: rs.faceSkins ? Int32Array.from(rs.faceSkins) : null,
  };
}

function applyObjRecolours(parts: SubMesh[], obj: ObjTypeExtended): void {
  if (!obj.recolSrc.length) return;
  for (const part of parts) {
    for (let i = 0; i < obj.recolSrc.length; i++) {
      recolour(part.faceColours, obj.recolSrc[i] ?? 0, obj.recolDst[i] ?? 0);
    }
  }
}

function applyIdkRecolours(parts: SubMesh[], idk: IdkType): void {
  for (const part of parts) {
    for (let i = 0; i < 6 && idk.recolSrc[i] !== 0; i++) {
      recolour(part.faceColours, idk.recolSrc[i] ?? 0, idk.recolDst[i] ?? 0);
    }
  }
}

function shouldCullByCross(appearance: Appearance, idkSlot: number): boolean {
  if (idkSlot === 11 && appearance.gender === 'F') return true;

  if (idkSlot === 8 || idkSlot === 11) {
    const head = appearance.parts[0] ?? 0;
    if (head >= 512 && getEquipmentType(head - 512) === 'helmet') return true;
  }

  if (idkSlot === 6) {
    const torso = appearance.parts[4] ?? 0;
    if (torso >= 512 && getEquipmentType(torso - 512) === 'full_top') return true;
  }

  return false;
}

function applyPlayerColours(parts: SubMesh[], colours: number[]): void {
  for (let ch = 0; ch < 5; ch++) {
    const v = colours[ch] ?? 0;
    if (v === 0) continue;
    const palette = RECOL_1D[ch];
    if (!palette || v >= palette.length) continue;
    const src = palette[0] ?? 0;
    const dst = palette[v] ?? src;
    for (const part of parts) recolour(part.faceColours, src, dst);
    if (ch === 1 && v < RECOL_1S.length) {
      const sSrc = RECOL_1S[0] ?? 0;
      const sDst = RECOL_1S[v] ?? sSrc;
      for (const part of parts) recolour(part.faceColours, sSrc, sDst);
    }
  }
}

export function buildPlayerMesh(appearance: Appearance, opts: BuildOptions = {}): MergedMesh {
  const hiddenFaceCulling = opts.hiddenFaceCulling ?? true;
  const parts: SubMesh[] = [];

  for (let slot = 0; slot < appearance.parts.length; slot++) {
    const v = appearance.parts[slot] ?? 0;

    if (v >= 256 && v < 512) {
      if (hiddenFaceCulling && shouldCullByCross(appearance, slot)) continue;
      const idk = getIdkType(v - 256);
      if (!idk || !idk.model) continue;
      const idkParts: SubMesh[] = [];
      for (const mid of idk.model) {
        const sub = loadModelAsSubMesh(mid);
        if (sub) idkParts.push(sub);
      }
      applyIdkRecolours(idkParts, idk);
      parts.push(...idkParts);
      continue;
    }

    if (v >= 512) {
      const obj = getObjType(v - 512);
      if (!obj) continue;
      const wearIds = pickWearModels(obj, appearance.gender);
      const objParts: SubMesh[] = [];
      for (const mid of wearIds) {
        const sub = loadModelAsSubMesh(mid);
        if (sub) objParts.push(sub);
      }
      const off = wearOffset(obj, appearance.gender);
      if (off !== 0) {
        for (const p of objParts) translateY(p, off);
      }
      applyObjRecolours(objParts, obj);
      parts.push(...objParts);
    }
  }

  applyPlayerColours(parts, appearance.colors);
  return mergeMeshes(parts);
}

export function defaultAppearance(gender: Gender, idkIds: number[]): Appearance {
  const parts = new Array<number>(12).fill(0);
  for (let designerPart = 0; designerPart < 7 && designerPart < idkIds.length; designerPart++) {
    const idkId = idkIds[designerPart];
    const slot = BASE_PART_MAP[designerPart];
    if (idkId !== undefined && slot !== undefined && idkId >= 0) parts[slot] = idkId + 256;
  }
  return {
    gender,
    parts,
    colors: [0, 0, 0, 0, 0],
  };
}
