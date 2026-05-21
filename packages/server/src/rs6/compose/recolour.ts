// In-place color swap on a face-colours array.
// Mirrors rs6-nullcity-client-ts/src/dash3d/Model.ts:1464 (recolour).
// RS face colours are packed HSB shorts; replacement is exact-match.

export function recolour(
  faceColours: Uint32Array,
  src: number,
  dst: number,
): void {
  if (src === dst) return;
  for (let i = 0; i < faceColours.length; i++) {
    if (faceColours[i] === src) {
      faceColours[i] = dst;
    }
  }
}

// Player-color palette tables ported from
// rs6-nullcity-client-ts/src/dash3d/PlayerModel.ts:16-23.
// recol1d[ch][colourIndex] - channels: 0=hair, 1=jaw/beard, 2=torso, 3=legs/feet (?), 4=skin
// recol1s is the 16-entry secondary palette for channel 1 (jaw/beard).
export const RECOL_1D: ReadonlyArray<ReadonlyArray<number>> = [
  [6798, 107, 10283, 16, 4797, 7744, 5799, 4634, 33697, 22433, 2983, 54193],
  [8741, 12, 64030, 43162, 7735, 8404, 1701, 38430, 24094, 10153, 56621, 4783, 1341, 16578, 35003, 25239],
  [25238, 8742, 12, 64030, 43162, 7735, 8404, 1701, 38430, 24094, 10153, 56621, 4783, 1341, 16578, 35003],
  [4626, 11146, 6439, 12, 4758, 10270],
  [4550, 4537, 5681, 5673, 5790, 6806, 8076, 4574],
];

export const RECOL_1S: ReadonlyArray<number> = [
  9104, 10275, 7595, 3610, 7975, 8526, 918, 38802, 24466, 10145, 58654, 5027,
  1457, 16565, 34991, 25486,
];
