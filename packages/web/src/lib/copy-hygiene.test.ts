import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.svelte', import.meta.url), 'utf8');

describe('dashboard copy hygiene', () => {
  test('keeps guest session copy attendee-facing instead of naming API internals', () => {
    expect(appSource).not.toContain('`/api/session`');
    expect(appSource).toContain('Sign in as an attendee to unlock AP, GP, inbox, Embassy actions, and prints.');
    expect(appSource).toContain('The shell switches from guest mode after attendee login succeeds.');
  });

  test('keeps admin bridge empty states command-free and endpoint-free', () => {
    expect(appSource).not.toContain('`NULLCITY_CITY_API_URL`');
    expect(appSource).not.toContain('`NULLCITY_CITY_API_TOKEN`');
    expect(appSource).not.toContain('`/api/nullcity/proposals`');
    expect(appSource).toContain('Connect the Null City control bridge on the dashboard server to approve, reject, or birth controller-backed proposals.');
    expect(appSource).toContain('Controller-backed proposals appear here once the bridge returns a proposal queue.');
  });
});
