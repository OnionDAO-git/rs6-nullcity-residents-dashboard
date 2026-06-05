export interface SpectatorWorldTile {
    worldX: number;
    worldZ: number;
    level: number;
}

export interface SpectatorMapArea {
    baseX: number;
    baseZ: number;
    size: number;
}

export interface SpectatorLocalTile {
    localX: number;
    localZ: number;
    level: number;
}

export function spectatorLocalTile(tile: SpectatorWorldTile, area: SpectatorMapArea): SpectatorLocalTile | null {
    if (!Number.isFinite(tile.worldX) || !Number.isFinite(tile.worldZ) || !Number.isFinite(tile.level)) {
        return null;
    }
    if (!Number.isFinite(area.baseX) || !Number.isFinite(area.baseZ) || !Number.isFinite(area.size) || area.size <= 0) {
        return null;
    }

    const localX = Math.trunc(tile.worldX) - Math.trunc(area.baseX);
    const localZ = Math.trunc(tile.worldZ) - Math.trunc(area.baseZ);
    if (localX < 0 || localZ < 0 || localX >= area.size || localZ >= area.size) {
        return null;
    }

    const level = Math.trunc(tile.level);
    return {
        localX,
        localZ,
        level: level >= 0 && level < 4 ? level : 0,
    };
}
