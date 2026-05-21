// Minimal RsModel -> GLB converter.
//
// RS face colors are HSB-packed shorts. We resolve them to RGB using the
// `RsModel.hsbToRgb` static table from `@runejs/filestore`. Per-vertex colors
// are produced by duplicating vertices for each triangle (flat shading) and
// computing a flat normal per face. Coordinate convention: negate Y to flip
// RS's Y-down system to a Y-up gltf convention; X and Z pass through.

import { ColorUtils, type RsModel } from '@runejs/filestore';

type RsModelLike = {
  verticesX: ArrayLike<number>;
  verticesY: ArrayLike<number>;
  verticesZ: ArrayLike<number>;
  faceIndicesA: ArrayLike<number>;
  faceIndicesB: ArrayLike<number>;
  faceIndicesC: ArrayLike<number>;
  faceColors: ArrayLike<number>;
  faceAlphas?: ArrayLike<number> | null;
  faceCount: number;
};

function hsbToRgb(hsb: number): number {
  return ColorUtils.hsbToRgb(hsb);
}

interface FlatMesh {
  positions: Float32Array; // 3 * vertexCount
  normals: Float32Array; // 3 * vertexCount
  colors: Float32Array; // 4 * vertexCount (RGBA, 0..1)
  indices: Uint32Array; // 3 * triCount
}

export function rsModelToFlatMesh(model: RsModelLike): FlatMesh {
  const triCount = model.faceCount;
  const vertCount = triCount * 3;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 4);
  const indices = new Uint32Array(vertCount);

  for (let f = 0; f < triCount; f++) {
    const ia = model.faceIndicesA[f] ?? 0;
    const ib = model.faceIndicesB[f] ?? 0;
    const ic = model.faceIndicesC[f] ?? 0;

    // Y-down -> Y-up: negate Y on each vertex.
    const ax = model.verticesX[ia] ?? 0;
    const ay = -(model.verticesY[ia] ?? 0);
    const az = model.verticesZ[ia] ?? 0;
    const bx = model.verticesX[ib] ?? 0;
    const by = -(model.verticesY[ib] ?? 0);
    const bz = model.verticesZ[ib] ?? 0;
    const cx = model.verticesX[ic] ?? 0;
    const cy = -(model.verticesY[ic] ?? 0);
    const cz = model.verticesZ[ic] ?? 0;

    // Flat normal. Note Y was negated, so winding flips - recompute from the
    // flipped positions directly so it stays consistent.
    let ux = bx - ax,
      uy = by - ay,
      uz = bz - az;
    let vx = cx - ax,
      vy = cy - ay,
      vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    const rgb = hsbToRgb((model.faceColors[f] ?? 0) & 0xffff);
    const r = ((rgb >> 16) & 0xff) / 255;
    const g = ((rgb >> 8) & 0xff) / 255;
    const b = (rgb & 0xff) / 255;
    const alphaByte = model.faceAlphas ? model.faceAlphas[f] ?? 0 : 0;
    // Filestore stores alpha as the "subtract from 255" delta; treat 0 as opaque.
    const a = alphaByte === 0 ? 1 : 1 - alphaByte / 255;

    const base = f * 3;
    const writeVert = (slot: number, x: number, y: number, z: number) => {
      const off = (base + slot) * 3;
      positions[off] = x;
      positions[off + 1] = y;
      positions[off + 2] = z;
      normals[off] = nx;
      normals[off + 1] = ny;
      normals[off + 2] = nz;
      const coff = (base + slot) * 4;
      colors[coff] = r;
      colors[coff + 1] = g;
      colors[coff + 2] = b;
      colors[coff + 3] = a;
      indices[base + slot] = base + slot;
    };
    // Reverse winding because the Y flip mirrored the geometry.
    writeVert(0, ax, ay, az);
    writeVert(1, cx, cy, cz);
    writeVert(2, bx, by, bz);
  }

  return { positions, normals, colors, indices };
}

function alignTo(n: number, align: number): number {
  return (n + align - 1) & ~(align - 1);
}

export function flatMeshToGlb(mesh: FlatMesh): Uint8Array {
  const vertCount = mesh.positions.length / 3;
  const triCount = mesh.indices.length / 3;
  if (vertCount === 0 || triCount === 0) {
    // Produce a degenerate-but-valid empty mesh as a single point cloud-like
    // primitive - slicer/viewer tolerant.
    const empty = new Uint8Array(0);
    return buildEmptyGlb(empty);
  }

  // Compute bounding box for POSITION accessor min/max (required for indexed
  // primitives per glTF 2.0 spec).
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < vertCount; i++) {
    const x = mesh.positions[i * 3] ?? 0;
    const y = mesh.positions[i * 3 + 1] ?? 0;
    const z = mesh.positions[i * 3 + 2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  // Binary layout: positions | normals | colors | indices (each aligned to 4).
  const posBytes = mesh.positions.byteLength;
  const nrmBytes = mesh.normals.byteLength;
  const colBytes = mesh.colors.byteLength;
  const idxBytes = mesh.indices.byteLength;

  const posOffset = 0;
  const nrmOffset = alignTo(posOffset + posBytes, 4);
  const colOffset = alignTo(nrmOffset + nrmBytes, 4);
  const idxOffset = alignTo(colOffset + colBytes, 4);
  const binSize = alignTo(idxOffset + idxBytes, 4);

  const bin = new Uint8Array(binSize);
  new Uint8Array(mesh.positions.buffer, mesh.positions.byteOffset, posBytes).forEach(
    (b, i) => (bin[posOffset + i] = b),
  );
  new Uint8Array(mesh.normals.buffer, mesh.normals.byteOffset, nrmBytes).forEach(
    (b, i) => (bin[nrmOffset + i] = b),
  );
  new Uint8Array(mesh.colors.buffer, mesh.colors.byteOffset, colBytes).forEach(
    (b, i) => (bin[colOffset + i] = b),
  );
  new Uint8Array(mesh.indices.buffer, mesh.indices.byteOffset, idxBytes).forEach(
    (b, i) => (bin[idxOffset + i] = b),
  );

  const gltf = {
    asset: { version: '2.0', generator: 'rs6-3d-viewer' },
    extensionsUsed: ['KHR_materials_unlit'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    materials: [
      {
        name: 'RS flat vertex colors',
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
        doubleSided: true,
        extensions: { KHR_materials_unlit: {} },
      },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
            indices: 3,
            material: 0,
            mode: 4, // TRIANGLES
          },
        ],
      },
    ],
    buffers: [{ byteLength: binSize }],
    bufferViews: [
      { buffer: 0, byteOffset: posOffset, byteLength: posBytes, target: 34962 }, // ARRAY_BUFFER
      { buffer: 0, byteOffset: nrmOffset, byteLength: nrmBytes, target: 34962 },
      { buffer: 0, byteOffset: colOffset, byteLength: colBytes, target: 34962 },
      { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes, target: 34963 }, // ELEMENT_ARRAY_BUFFER
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: vertCount,
        type: 'VEC3',
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: vertCount,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        componentType: 5126,
        count: vertCount,
        type: 'VEC4',
      },
      {
        bufferView: 3,
        componentType: 5125, // UNSIGNED_INT
        count: mesh.indices.length,
        type: 'SCALAR',
      },
    ],
  };

  return packGlb(gltf, bin);
}

function buildEmptyGlb(_unused: Uint8Array): Uint8Array {
  const gltf = {
    asset: { version: '2.0', generator: 'rs6-3d-viewer' },
    scenes: [{ nodes: [] }],
    scene: 0,
    nodes: [],
    meshes: [],
  };
  return packGlb(gltf, new Uint8Array(0));
}

function packGlb(gltf: object, bin: Uint8Array): Uint8Array {
  const jsonStr = JSON.stringify(gltf);
  // JSON chunk must be padded with spaces to 4 bytes.
  const jsonBytes = new TextEncoder().encode(jsonStr);
  const jsonPadLen = alignTo(jsonBytes.length, 4) - jsonBytes.length;
  const jsonChunkLen = jsonBytes.length + jsonPadLen;

  // BIN chunk padded with zeros.
  const binPadLen = alignTo(bin.length, 4) - bin.length;
  const binChunkLen = bin.length + binPadLen;

  const hasBin = bin.length > 0;
  const headerLen = 12;
  const chunkHeaderLen = 8;
  const totalLen =
    headerLen + chunkHeaderLen + jsonChunkLen + (hasBin ? chunkHeaderLen + binChunkLen : 0);

  const out = new Uint8Array(totalLen);
  const dv = new DataView(out.buffer);
  // GLB header: magic 'glTF', version 2, total length.
  dv.setUint32(0, 0x46546c67, true); // 'glTF'
  dv.setUint32(4, 2, true);
  dv.setUint32(8, totalLen, true);

  // JSON chunk header.
  let cursor = 12;
  dv.setUint32(cursor, jsonChunkLen, true);
  dv.setUint32(cursor + 4, 0x4e4f534a, true); // 'JSON'
  cursor += 8;
  out.set(jsonBytes, cursor);
  // pad with spaces (0x20).
  for (let i = 0; i < jsonPadLen; i++) out[cursor + jsonBytes.length + i] = 0x20;
  cursor += jsonChunkLen;

  if (hasBin) {
    dv.setUint32(cursor, binChunkLen, true);
    dv.setUint32(cursor + 4, 0x004e4942, true); // 'BIN\0'
    cursor += 8;
    out.set(bin, cursor);
    // bin is already zero-padded by Uint8Array allocation.
  }

  return out;
}

export function rsModelToGlb(model: RsModel | RsModelLike): Uint8Array {
  const mesh = rsModelToFlatMesh(model as RsModelLike);
  return flatMeshToGlb(mesh);
}

// MergedMesh from compose/merge.ts shares the same shape as RsModelLike
// (verticesX/Y/Z + faceIndicesA/B/C + faceColours + faceAlphas). The only
// difference is the casing on the colour array (faceColours vs faceColors).
// Adapt + reuse.
export interface MergedMeshLike {
  verticesX: ArrayLike<number>;
  verticesY: ArrayLike<number>;
  verticesZ: ArrayLike<number>;
  faceIndicesA: ArrayLike<number>;
  faceIndicesB: ArrayLike<number>;
  faceIndicesC: ArrayLike<number>;
  faceColours: ArrayLike<number>;
  faceAlphas?: ArrayLike<number> | null;
}

export function mergedMeshToGlb(mesh: MergedMeshLike): Uint8Array {
  const faceCount = mesh.faceColours.length;
  const adapter: RsModelLike = {
    verticesX: mesh.verticesX,
    verticesY: mesh.verticesY,
    verticesZ: mesh.verticesZ,
    faceIndicesA: mesh.faceIndicesA,
    faceIndicesB: mesh.faceIndicesB,
    faceIndicesC: mesh.faceIndicesC,
    faceColors: mesh.faceColours,
    faceAlphas: mesh.faceAlphas ?? null,
    faceCount,
  };
  return rsModelToGlb(adapter);
}
