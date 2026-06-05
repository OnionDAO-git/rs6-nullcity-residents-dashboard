import { describe, expect, test } from 'bun:test';
import { MapFlag } from '../dash3d/MapFlag';
import { hasMapFlag } from './SafeMapFlags';

describe('hasMapFlag', () => {
    test('returns false instead of throwing when spectator replay is missing tile rows', () => {
        const mapLevels = [
            [
                [0, 0],
                [0, MapFlag.RemoveRoof],
            ],
        ];

        expect(hasMapFlag(mapLevels, 0, 1, 1, MapFlag.RemoveRoof)).toBe(true);
        expect(hasMapFlag(mapLevels, 0, 1, 0, MapFlag.RemoveRoof)).toBe(false);
        expect(hasMapFlag(mapLevels, 0, -8, 1, MapFlag.RemoveRoof)).toBe(false);
        expect(hasMapFlag(mapLevels, 0, 1, -8, MapFlag.RemoveRoof)).toBe(false);
        expect(hasMapFlag(mapLevels, 3, 1, 1, MapFlag.RemoveRoof)).toBe(false);
    });
});
