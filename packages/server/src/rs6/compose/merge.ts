// Pure mesh merger. Mirrors rs6-nullcity-client-ts/src/dash3d/Model.ts:392-537
// (Model.combineForAnim). Concatenates vertices/faces and propagates
// per-vertex / per-face bone labels (vertexSkins / faceSkins on RsModel) so
// the pose kernel can be applied to the merged result.

export interface SubMesh {
  verticesX: number[]; // length = vertex count
  verticesY: number[];
  verticesZ: number[];
  faceIndicesA: Uint16Array | Uint32Array | number[]; // length = face count
  faceIndicesB: Uint16Array | Uint32Array | number[];
  faceIndicesC: Uint16Array | Uint32Array | number[];
  faceColours: Uint32Array; // RS HSB-packed
  faceAlphas?: Uint8Array | null; // 0 = opaque, 255 = fully transparent
  /** Per-vertex bone label (RsModel.vertexSkins). null if model has none. */
  vertexLabel?: Int32Array | null;
  /** Per-face bone label (RsModel.faceSkins). null if model has none. */
  faceLabel?: Int32Array | null;
}

export interface MergedMesh {
  verticesX: number[];
  verticesY: number[];
  verticesZ: number[];
  faceIndicesA: Uint32Array;
  faceIndicesB: Uint32Array;
  faceIndicesC: Uint32Array;
  faceColours: Uint32Array;
  faceAlphas: Uint8Array; // always populated (0 if originals had none)
  /** -1 where no label; otherwise the bone label for that vertex. */
  vertexLabel: Int32Array;
  /** -1 where no label; otherwise the bone label for that face. */
  faceLabel: Int32Array;
}

export function mergeMeshes(parts: SubMesh[]): MergedMesh {
  let totalFaces = 0;
  for (const p of parts) {
    totalFaces += p.faceColours.length;
  }

  if (parts.length <= 1) {
    const p = parts[0];
    const vertexCount = p?.verticesX.length ?? 0;
    const faceCount = p?.faceColours.length ?? 0;
    const vertexLabel = new Int32Array(vertexCount).fill(-1);
    const faceLabel = new Int32Array(faceCount).fill(-1);
    if (p?.vertexLabel) vertexLabel.set(p.vertexLabel);
    if (p?.faceLabel) faceLabel.set(p.faceLabel);
    return {
      verticesX: p ? p.verticesX.slice() : [],
      verticesY: p ? p.verticesY.slice() : [],
      verticesZ: p ? p.verticesZ.slice() : [],
      faceIndicesA: p ? new Uint32Array(p.faceIndicesA) : new Uint32Array(0),
      faceIndicesB: p ? new Uint32Array(p.faceIndicesB) : new Uint32Array(0),
      faceIndicesC: p ? new Uint32Array(p.faceIndicesC) : new Uint32Array(0),
      faceColours: p ? new Uint32Array(p.faceColours) : new Uint32Array(0),
      faceAlphas: p?.faceAlphas ? new Uint8Array(p.faceAlphas) : new Uint8Array(faceCount),
      vertexLabel,
      faceLabel,
    };
  }

  const verticesX: number[] = [];
  const verticesY: number[] = [];
  const verticesZ: number[] = [];
  const vertexLabels: number[] = [];
  const vertexByCoord = new Map<string, number>();

  const addPoint = (p: SubMesh, vertex: number): number => {
    const x = p.verticesX[vertex] ?? 0;
    const y = p.verticesY[vertex] ?? 0;
    const z = p.verticesZ[vertex] ?? 0;
    const key = `${x},${y},${z}`;
    const existing = vertexByCoord.get(key);
    if (existing !== undefined) return existing;

    const next = verticesX.length;
    verticesX.push(x);
    verticesY.push(y);
    verticesZ.push(z);
    vertexLabels.push(p.vertexLabel ? p.vertexLabel[vertex] ?? -1 : -1);
    vertexByCoord.set(key, next);
    return next;
  };

  const faceIndicesA = new Uint32Array(totalFaces);
  const faceIndicesB = new Uint32Array(totalFaces);
  const faceIndicesC = new Uint32Array(totalFaces);
  const faceColours = new Uint32Array(totalFaces);
  const faceAlphas = new Uint8Array(totalFaces);
  const faceLabel = new Int32Array(totalFaces).fill(-1);

  let fBase = 0;
  for (const p of parts) {
    const fCount = p.faceColours.length;
    for (let f = 0; f < fCount; f++) {
      faceIndicesA[fBase + f] = addPoint(p, p.faceIndicesA[f] ?? 0);
      faceIndicesB[fBase + f] = addPoint(p, p.faceIndicesB[f] ?? 0);
      faceIndicesC[fBase + f] = addPoint(p, p.faceIndicesC[f] ?? 0);
      faceColours[fBase + f] = p.faceColours[f] ?? 0;
      faceAlphas[fBase + f] = p.faceAlphas ? p.faceAlphas[f] ?? 0 : 0;
      if (p.faceLabel) faceLabel[fBase + f] = p.faceLabel[f] ?? -1;
    }
    fBase += fCount;
  }

  return {
    verticesX,
    verticesY,
    verticesZ,
    faceIndicesA,
    faceIndicesB,
    faceIndicesC,
    faceColours,
    faceAlphas,
    vertexLabel: Int32Array.from(vertexLabels),
    faceLabel,
  };
}

/** Translate vertices in-place along the Y axis (RS convention: Y points down). */
export function translateY(mesh: SubMesh, dy: number): void {
  if (dy === 0) return;
  for (let i = 0; i < mesh.verticesY.length; i++) {
    mesh.verticesY[i] = (mesh.verticesY[i] ?? 0) + dy;
  }
}
