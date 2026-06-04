import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.svelte', import.meta.url), 'utf8');

describe('dashboard copy hygiene', () => {
  test('keeps guest session copy attendee-facing instead of naming API internals', () => {
    expect(appSource).not.toContain('`/api/session`');
    expect(appSource).toContain('Sign in as an attendee to unlock AP, GP, inbox, Embassy actions, and prints.');
    expect(appSource).toContain('This dashboard remains in guest mode until attendee login is connected.');
  });

  test('keeps admin bridge empty states command-free and endpoint-free', () => {
    expect(appSource).not.toContain('`NULLCITY_CITY_API_URL`');
    expect(appSource).not.toContain('`NULLCITY_CITY_API_TOKEN`');
    expect(appSource).not.toContain('`/api/nullcity/proposals`');
    expect(appSource).toContain('Connect the Null City control bridge on the dashboard server to approve, reject, or birth controller-backed proposals.');
    expect(appSource).toContain('Controller-backed proposals appear here once the bridge returns a proposal queue.');
  });

  test('keeps the legacy debug rail behind admin access', () => {
    expect(appSource).not.toContain("<button onclick={() => debugNav('/')}>DB Debug</button>");
    expect(appSource).toMatch(
      /{#if citySession\.admin}\s+<button class:active={route\.startsWith\('\/admin'\)} onclick={\(\) => cityNav\('\/admin'\)}>AD Admin<\/button>\s+<button onclick={\(\) => debugNav\('\/'\)}>Debug<\/button>\s+{\/if}/,
    );
  });

  test('keeps the public Storyteller route dispatch-first instead of operator-audit first', () => {
    expect(appSource).not.toContain('<h1>Digest Feed</h1>');
    expect(appSource).not.toContain('<div class="panel-title">Operator Review</div>');
    expect(appSource).toContain('<h1>Storyteller Dispatches</h1>');
    expect(appSource).toContain('<div class="panel-title">Public Dispatch Preview</div>');
    expect(appSource).toContain('<div class="panel-title">Latest Public Dispatch</div>');
    expect(appSource).toContain('storytellerDigestSafetyLine(digest)');
    expect(appSource).toContain('storytellerDigestSafetyLine(cityStoryDigest)');
    expect(appSource).toContain('<strong>Storyteller feed is unavailable</strong>');
  });

  test('uses human-facing live and chronicle route names instead of stale overview and story paths', () => {
    expect(appSource).not.toContain("route === '/overview'");
    expect(appSource).not.toContain("cityNav('/overview')");
    expect(appSource).not.toContain("route === '/story'");
    expect(appSource).not.toContain("cityNav('/story')");
    expect(appSource).toContain("route === '/live'");
    expect(appSource).toContain("cityNav('/live')");
    expect(appSource).toContain("route === '/chronicle'");
    expect(appSource).toContain("cityNav('/chronicle')");
  });

  test('keeps Story Canon events on myth copy instead of raw log notes', () => {
    expect(appSource).not.toContain('<strong>{event.note || event.ref}</strong>');
    expect(appSource).toContain('{@const myth = storytellerMythCard(event)}');
    expect(appSource).toContain('<strong>{myth.title}</strong>');
  });

  test('keeps guest login fallback from linking attendees back to the same unavailable route', () => {
    expect(appSource).not.toContain('<a class="city-link-button" href={citySession.loginUrl}>Open Login</a>');
    expect(appSource).toContain('Ask event staff for the attendee QR or staff login link.');
    expect(appSource).toContain('Open Onion DAO Login');
    expect(appSource).toContain('cityLoginUrlReady');
  });

  test('keeps the Embassy empty state visitor-facing instead of naming API internals', () => {
    expect(appSource).not.toContain('Embassy API');
    expect(appSource).toContain('Proposal filters will sort by Needs AP, Ready to birth, Born, and Mine once attendee proposals arrive.');
  });

  test('offers a resident fallback when the Embassy has no proposals to fund', () => {
    expect(appSource).toContain('Watch a resident while the Embassy queue is empty.');
    expect(appSource).toContain("onclick={() => cityNav(cityResidentDemoPick.path)}>Watch resident instead</button>");
  });

  test('explains AP GP and Soul terms on the economy route', () => {
    expect(appSource).toContain('<div class="panel-title">City Terms</div>');
    expect(appSource).toContain('AP keeps residents active and funds attendee support.');
    expect(appSource).toContain('GP means RuneScape coin evidence, trusted when coin-995 or accepted exchange proof appears.');
    expect(appSource).toContain('Souls are funded resident proposals that can become autonomous Null City residents.');
  });

  test('labels homepage economy activity as event-window activity, not resident liveness', () => {
    expect(appSource).not.toContain("active · GP Δ");
    expect(appSource).toContain("economy events · GP Δ");
  });

  test('explains quiet economy windows without implying residents are offline', () => {
    expect(appSource).toContain('The economy-event window is quiet; residents may still be online, acting, or waiting for AP/GP events.');
  });

  test('keeps resident Storyteller empty states visitor-facing instead of operator-commanding', () => {
    expect(appSource).not.toContain('Run Storyteller digest generation to capture grounded resident events.');
    expect(appSource).toContain('Once a Storyteller digest cites this resident, grounded public story evidence will appear here.');
  });

  test('keeps public profile empty states endpoint-free', () => {
    expect(appSource).not.toContain('public event endpoints are running');
    expect(appSource).toContain('This profile will appear after the attendee handle has public AP, resident, or letter history.');
  });

  test('keeps public profile inbox links in attendee routes instead of debug APIs', () => {
    expect(appSource).not.toContain('Public profile from `/v1/patron/*` and `/v1/inbox`');
    expect(appSource).not.toContain('/debug/inbox/?human=');
    expect(appSource).toContain('Public AP, Embassy standing, resident relationships, and inbox readiness.');
    expect(appSource).toContain("onclick={() => cityNav('/inbox')}>Open Your Inbox</button>");
  });

  test('keeps the projector overview rails public-readable instead of dashboard-internal', () => {
    expect(appSource).not.toContain("title: 'Leaderboard'");
    expect(appSource).not.toContain("title: 'Drama Radar'");
    expect(appSource).not.toContain("title: 'Resident Action Feed'");
    expect(appSource).not.toContain('<div class="panel-title">Key Facts</div>');
    expect(appSource).not.toContain('<div class="panel-title">Live Atlas</div>');
    expect(appSource).not.toContain('residents with live places');
    expect(appSource).not.toContain('aria-label="Null City leaderboards and drama"');
    expect(appSource).toContain("title: 'Who to Watch Now'");
    expect(appSource).toContain("title: 'Important Moments'");
    expect(appSource).toContain("title: 'What to Watch Next'");
    expect(appSource).toContain("title: 'What Residents Are Doing'");
    expect(appSource).toContain('<div class="panel-title">Why it matters</div>');
    expect(appSource).toContain('<div class="panel-title">Where residents are now</div>');
    expect(appSource).toContain('residents currently located');
    expect(appSource).toContain('aria-label="Null City public story rails"');
  });

  test('renders one primary public action before the long overview rails', () => {
    expect(appSource).toContain('{@render ProjectorPrimaryAction({ item: cityProjectorOverview.primaryAction })}');
    expect(appSource).toContain('{#snippet ProjectorPrimaryAction({ item }: { item: StoryOverviewListItem })}');
    expect(appSource).toContain('Do this now');
    expect(appSource).toContain('Primary Null City action');
    expect(appSource).not.toContain('grant_attention');
    expect(appSource).not.toContain('support floor');
  });

  test('shows a public recent-dispatch chronicle on the projector overview', () => {
    expect(appSource).toContain("title: 'Recent Dispatches'");
    expect(appSource).toContain('cityProjectorOverview.chronicleItems');
    expect(appSource).not.toContain('Dispatch History');
    expect(appSource).not.toContain('Run ID');
  });
});
