import { describe, expect, test } from 'bun:test';
import {
  DEBUG_PREFIX,
  cityPath,
  cityRouteNeedsSnapshot,
  debugPath,
  isDebugInternalRoute,
  isDebugPath,
  isKnownCityRoute,
  observeResidentDebugRoute,
  publicEventPath,
  residentDebugRoute,
  residentRuntimeApiPath,
  isStoryRoute,
  isProtectedCityRoute,
  toDebugInternalRoute,
} from './routes';

describe('dashboard route helpers', () => {
  test('recognizes debug browser paths', () => {
    expect(DEBUG_PREFIX).toBe('/debug');
    expect(isDebugPath('/debug')).toBe(true);
    expect(isDebugPath('/debug/residents/res-a')).toBe(true);
    expect(isDebugPath('/residents/res-a')).toBe(false);
  });

  test('converts debug browser paths into old internal routes', () => {
    expect(toDebugInternalRoute('/debug')).toBe('/');
    expect(toDebugInternalRoute('/debug/residents')).toBe('/residents');
    expect(toDebugInternalRoute('/debug/residents/?filter=all')).toBe('/residents');
    expect(toDebugInternalRoute('/debug/observe/resident/res-a')).toBe('/observe/resident/res-a');
  });

  test('builds debug and city paths without double-prefixing', () => {
    expect(debugPath('/')).toBe('/debug');
    expect(debugPath('/residents')).toBe('/debug/residents');
    expect(debugPath('/debug/logs')).toBe('/debug/logs');
    expect(cityPath('embassy')).toBe('/embassy');
    expect(cityPath('residents?triage=attention')).toBe('/residents?triage=attention');
    expect(cityPath('/residents#resident-triage-attention')).toBe('/residents#resident-triage-attention');
  });

  test('points public event pages at the dashboard server during Vite dev', () => {
    expect(publicEventPath('/wall/', 'http://127.0.0.1:5174')).toBe('http://127.0.0.1:8787/debug/wall');
    expect(publicEventPath('/inbox/', 'http://localhost:5174')).toBe('http://localhost:8787/debug/inbox');
    expect(publicEventPath('/library/', 'http://127.0.0.1:8787')).toBe('/debug/library');
  });

  test('identifies old operations routes that should be prefixed while inside debug', () => {
    expect(isDebugInternalRoute('/')).toBe(true);
    expect(isDebugInternalRoute('/residents/res-a')).toBe(true);
    expect(isDebugInternalRoute('/observe/player/test')).toBe(true);
    expect(isDebugInternalRoute('/world')).toBe(false);
  });

  test('builds resident browsing routes from canonical resident ids', () => {
    expect(residentDebugRoute('res:qa-scout')).toBe('/residents/res%3Aqa-scout');
    expect(observeResidentDebugRoute('res:hans')).toBe('/observe/resident/res%3Ahans');
    expect(residentRuntimeApiPath('res:qa-scout')).toBe('/api/runtime/res%3Aqa-scout');
    expect(residentRuntimeApiPath('res:qa-scout', 'inference')).toBe('/api/runtime/res%3Aqa-scout/inference');
    expect(residentRuntimeApiPath(' res:hans ', 'memory/index')).toBe('/api/runtime/res%3Ahans/memory/index');
  });

  test('marks the RuneScape world route as protected attendee UI', () => {
    expect(isProtectedCityRoute('/world')).toBe(true);
    expect(isProtectedCityRoute('/profile')).toBe(true);
    expect(isProtectedCityRoute('/inbox/thread-1')).toBe(true);
    expect(isProtectedCityRoute('/prints/new')).toBe(true);
    expect(isProtectedCityRoute('/')).toBe(false);
    expect(isProtectedCityRoute('/residents')).toBe(false);
  });

  test('keeps Storyteller routes public and independent from the heavy city snapshot', () => {
    expect(isStoryRoute('/story')).toBe(true);
    expect(isStoryRoute('/story/run-2026-05-30')).toBe(true);
    expect(isKnownCityRoute('/story')).toBe(true);
    expect(isKnownCityRoute('/story/run-2026-05-30')).toBe(true);
    expect(cityRouteNeedsSnapshot('/story')).toBe(false);
    expect(cityRouteNeedsSnapshot('/story/run-2026-05-30')).toBe(false);
    expect(cityRouteNeedsSnapshot('/residents/res%3Aagent')).toBe(true);
  });

  test('keeps the live economy route public while loading city state', () => {
    expect(isKnownCityRoute('/economy')).toBe(true);
    expect(isProtectedCityRoute('/economy')).toBe(false);
    expect(cityRouteNeedsSnapshot('/economy')).toBe(true);
  });
});
