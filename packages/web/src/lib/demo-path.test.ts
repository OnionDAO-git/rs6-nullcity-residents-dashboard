import { describe, expect, test } from 'bun:test';
import { cityDemoPathSteps } from './demo-path';

describe('cityDemoPathSteps', () => {
  test('builds a four-stop Monday demo path from live resident and story signals', () => {
    expect(cityDemoPathSteps({
      authenticated: true,
      residentCount: 23,
      onlineResidents: 21,
      lowApResidents: 0,
      demoResident: {
        tone: 'ok',
        name: 'res:agent',
        path: '/residents/agent',
        action: 'Open demo-ready resident',
        detail: 'agent has 6/6 loop proofs live.',
      },
      story: {
        tone: 'ok',
        label: 'ready',
        title: 'Morning dispatch',
        summary: 'Dispatch is grounded and ready for public review.',
      },
    })).toEqual([
      {
        id: 'city-alive',
        tone: 'ok',
        label: 'City alive',
        metric: '21 / 23 online',
        action: 'Open resident directory',
        path: '/residents',
        detail: 'Live residents are visible; use the directory to confirm names, AP/GP, qmd memory, model, endpoint, and loop proof.',
      },
      {
        id: 'ap-support',
        tone: 'ok',
        label: 'Support with AP',
        metric: '0 AP needs',
        action: 'Open Embassy',
        path: '/embassy',
        detail: 'Embassy funding is ready; profile AP/GP balances are available for support flows.',
      },
      {
        id: 'resident-proof',
        tone: 'ok',
        label: 'Watch resident react',
        metric: 'agent',
        action: 'Open demo-ready resident',
        path: '/residents/agent',
        detail: 'agent has 6/6 loop proofs live.',
      },
      {
        id: 'grounded-story',
        tone: 'ok',
        label: 'Read grounded story',
        metric: 'Morning dispatch',
        action: 'Open Storyteller',
        path: '/story',
        detail: 'Dispatch is grounded and ready for public review.',
      },
    ]);
  });

  test('keeps guest and empty-state demo steps honest instead of implying support is ready', () => {
    const steps = cityDemoPathSteps({
      authenticated: false,
      residentCount: 0,
      onlineResidents: 0,
      lowApResidents: 3,
      demoResident: {
        tone: 'warn',
        action: 'Wait for residents',
        detail: 'No resident roster loaded yet.',
      },
      story: {
        tone: 'warn',
        label: 'dry-run',
        summary: 'No public dispatch exists yet; showing deterministic digest evidence only.',
      },
    });

    expect(steps.map(step => step.path)).toEqual(['/residents', '/login', '/residents', '/story']);
    expect(steps[0]).toMatchObject({ tone: 'warn', metric: '0 / 0 online' });
    expect(steps[1]).toMatchObject({
      tone: 'warn',
      metric: 'guest',
      action: 'Login for AP support',
      detail: 'Sign in before demonstrating AP funding, resident grants, or AP/GP balances.',
    });
    expect(steps[2]).toMatchObject({
      tone: 'warn',
      metric: 'directory',
      action: 'Wait for residents',
    });
  });

  test('routes authenticated AP support to a resident grant recommendation when available', () => {
    const steps = cityDemoPathSteps({
      authenticated: true,
      residentCount: 23,
      onlineResidents: 21,
      lowApResidents: 1,
      apSupport: {
        tone: 'warn',
        metric: '32 AP suggested',
        action: 'Open AP grant recommendation',
        path: '/residents/watch',
        detail: 'Grant 32 AP to restore runway. watch has 18 AP; this restores the resident to the 50 AP stable runway target.',
      },
      demoResident: {
        tone: 'warn',
        name: 'res:watch',
        path: '/residents/watch',
        action: 'Open resident needing AP',
        detail: 'watch needs AP support before the demo.',
      },
      story: {
        tone: 'ok',
        label: 'ready',
        summary: 'Dispatch is grounded and ready for public review.',
      },
    });

    expect(steps[1]).toEqual({
      id: 'ap-support',
      tone: 'warn',
      label: 'Support with AP',
      metric: '32 AP suggested',
      action: 'Open AP grant recommendation',
      path: '/residents/watch',
      detail: 'Grant 32 AP to restore runway. watch has 18 AP; this restores the resident to the 50 AP stable runway target.',
    });
  });

  test('labels warning resident proof stops as review work instead of a live reaction', () => {
    const steps = cityDemoPathSteps({
      authenticated: true,
      residentCount: 23,
      onlineResidents: 21,
      lowApResidents: 0,
      demoResident: {
        tone: 'warn',
        name: 'res:unlinked-ready',
        path: '/residents?triage=goal-link',
        action: 'Review goal-action link',
        detail: 'unlinked-ready is otherwise demo-ready; goal/action link needs review.',
      },
      story: {
        tone: 'ok',
        label: 'ready',
        summary: 'Dispatch is grounded and ready for public review.',
      },
    });

    expect(steps[2]).toMatchObject({
      id: 'resident-proof',
      tone: 'warn',
      label: 'Review resident proof',
      metric: 'unlinked-ready',
      action: 'Review goal-action link',
      path: '/residents?triage=goal-link',
    });
  });

  test('keeps dynamic demo destinations on known city routes', () => {
    const steps = cityDemoPathSteps({
      authenticated: true,
      residentCount: 4,
      onlineResidents: 4,
      lowApResidents: 1,
      apSupport: {
        tone: 'warn',
        metric: '32 AP suggested',
        action: 'Open AP grant recommendation',
        path: '/debug/logs',
        detail: 'Grant AP from a safe city route.',
      },
      demoResident: {
        tone: 'warn',
        name: 'res:watch',
        path: '/api/runtime/res%3Awatch',
        action: 'Open resident needing AP',
        detail: 'watch needs AP support before the demo.',
      },
      story: {
        tone: 'ok',
        label: 'ready',
        summary: 'Dispatch is grounded and ready for public review.',
      },
    });

    expect(steps.map(step => step.path)).toEqual(['/residents', '/embassy', '/residents', '/story']);
  });
});
