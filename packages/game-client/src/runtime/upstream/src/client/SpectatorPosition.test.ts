import { describe, expect, test } from 'bun:test';
import { spectatorLocalTile } from './SpectatorPosition';

describe('spectatorLocalTile', () => {
    test('converts a world tile into the loaded local map tile', () => {
        expect(spectatorLocalTile({ worldX: 3220, worldZ: 3218, level: 0 }, { baseX: 3136, baseZ: 3136, size: 104 })).toEqual({
            localX: 84,
            localZ: 82,
            level: 0,
        });
    });

    test('rejects tiles outside the loaded map area', () => {
        expect(spectatorLocalTile({ worldX: 3220, worldZ: 3218, level: 0 }, { baseX: 0, baseZ: 0, size: 104 })).toBeNull();
        expect(spectatorLocalTile({ worldX: 3240, worldZ: 3218, level: 0 }, { baseX: 3136, baseZ: 3136, size: 104 })).toBeNull();
    });

    test('clamps invalid levels to the ground plane', () => {
        expect(spectatorLocalTile({ worldX: 3220, worldZ: 3218, level: 99 }, { baseX: 3136, baseZ: 3136, size: 104 })?.level).toBe(0);
        expect(spectatorLocalTile({ worldX: 3220, worldZ: 3218, level: -1 }, { baseX: 3136, baseZ: 3136, size: 104 })?.level).toBe(0);
    });
});
