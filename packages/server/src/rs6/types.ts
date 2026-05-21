export const BASE_PART_MAP = [8, 11, 4, 6, 9, 7, 10] as const;
export const APPEARANCE_SLOTS = 12;
export const COLOR_CHANNELS = 5;

export type Gender = 'M' | 'F';

export interface Appearance {
  gender: Gender;
  parts: number[];
  colors: number[];
}

