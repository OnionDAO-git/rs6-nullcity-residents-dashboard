import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const source = readFileSync(new URL('./tinymidipcm.js', import.meta.url), 'utf8');

describe('tinymidipcm browser bridge', () => {
    test('keeps missing soundfont playback failures out of the observe console', () => {
        expect(source).toContain('let soundfontReady = false');
        expect(source).toContain('/* @vite-ignore */');
        expect(source).toContain('if (!soundfontReady)');
        expect(source).toContain('const result = window._tinyMidiPlay');
        expect(source).toContain('typeof result.catch ===');
        expect(source).toContain('midi playback unavailable');
    });
});
