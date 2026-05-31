import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.svelte', import.meta.url), 'utf8');

describe('dashboard copy hygiene', () => {
  test('keeps guest session copy attendee-facing instead of naming API internals', () => {
    expect(appSource).not.toContain('`/api/session`');
    expect(appSource).toContain('Sign in as an attendee to unlock AP, GP, inbox, Embassy actions, and prints.');
    expect(appSource).toContain('The shell switches from guest mode after attendee login succeeds.');
  });
});
