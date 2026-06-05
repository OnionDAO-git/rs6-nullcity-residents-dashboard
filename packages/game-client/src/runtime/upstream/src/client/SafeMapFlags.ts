export type MapFlagLevels =
    | readonly (readonly (ArrayLike<number> | undefined)[] | undefined)[]
    | null
    | undefined;

export function hasMapFlag(mapLevels: MapFlagLevels, level: number, tileX: number, tileZ: number, flag: number): boolean {
    const levelRows = mapLevels?.[level];
    const tileRow = levelRows?.[tileX];
    const tileFlags = tileRow?.[tileZ] ?? 0;
    return (tileFlags & flag) !== 0;
}
