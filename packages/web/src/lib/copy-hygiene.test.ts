import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.svelte', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const dashboardNavSource = readFileSync(new URL('./end-user-dashboard.ts', import.meta.url), 'utf8');

function cssRule(source: string, selector: string, after: string): string {
  const afterIndex = source.indexOf(after);
  const selectorIndex = source.indexOf(`${selector} {`, afterIndex);
  if (afterIndex === -1 || selectorIndex === -1) return '';
  const bodyStart = source.indexOf('{', selectorIndex) + 1;
  const bodyEnd = source.indexOf('\n  }', bodyStart);
  return bodyEnd === -1 ? '' : source.slice(bodyStart, bodyEnd);
}

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const startIndex = source.indexOf(startMarker);
  if (startIndex === -1) return '';
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
  return endIndex === -1 ? source.slice(startIndex) : source.slice(startIndex, endIndex);
}

describe('dashboard copy hygiene', () => {
  test('lets Simple mobile bottom navigation scroll when the IA has more than six items', () => {
    const mobileBottomNav = cssRule(appCss, '.city-bottom-nav', '@media (max-width: 760px)');
    const mobileBottomNavButton = cssRule(appCss, '.city-bottom-nav button', '@media (max-width: 760px)');

    expect(mobileBottomNav).toContain('grid-template-columns: none;');
    expect(mobileBottomNav).toContain('grid-auto-flow: column;');
    expect(mobileBottomNav).toContain('grid-auto-columns: minmax(72px, 1fr);');
    expect(mobileBottomNav).toContain('overflow-x: auto;');
    expect(mobileBottomNav).toContain('overscroll-behavior-x: contain;');
    expect(mobileBottomNav).not.toContain('grid-template-columns: repeat(6');
    expect(mobileBottomNavButton).toContain('overflow-wrap: anywhere;');
    expect(mobileBottomNavButton).not.toContain('overflow: hidden;');
  });

  test('keeps guest session copy attendee-facing instead of naming API internals', () => {
    expect(appSource).not.toContain('`/api/session`');
    expect(appSource).not.toContain('Showing the shell with empty states');
    expect(appSource).toContain('Sign in to spend Onions, support residents, and see your messages.');
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
    expect(appSource).toContain('{#if isDebugRoute && !expertMode}');
    expect(appSource).toContain("{@render CityShell({ forceExpertGate: true })}");
    expect(appSource).toContain('{#if expertMode && citySession.admin}');
    expect(dashboardNavSource).toContain("{ label: 'Admin', path: '/admin', match: '/admin', glyph: 'AD', expertOnly: true, adminOnly: true }");
    expect(dashboardNavSource).toContain("{ label: 'Debug', path: '/debug', match: '/debug', glyph: 'DG', expertOnly: true, adminOnly: true }");
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
    expect(dashboardNavSource).toContain("path: '/live'");
    expect(dashboardNavSource).not.toMatch(/\{[^}]*path: '\/live'[^}]*expertOnly: true[^}]*\}/);
    expect(appSource).toContain("route === '/chronicle'");
    expect(dashboardNavSource).toContain("{ label: 'Stories', path: '/chronicle', match: '/chronicle', glyph: 'ST', expertOnly: true }");
  });

  test('keeps the shared Board out of the Simple human path', () => {
    const boardSource = sourceBetween(appSource, '{#snippet CityBoard()}', '{#snippet CityEconomy()}');

    expect(appSource).toContain("route === '/board'");
    expect(dashboardNavSource).toContain("path: '/board'");
    expect(dashboardNavSource).toMatch(/\{[^}]*path: '\/board'[^}]*expertOnly: true[^}]*\}/);
    expect(dashboardNavSource).toContain("if (normalized === '/board') return true;");
    expect(appSource).not.toContain("cityNav('/board')");
    expect(appSource).toContain('Simple mode keeps the dashboard focused on Watch, Residents, Inbox, Soul Library, and Me.');
    expect(appSource).toContain("cityNav('/inbox')}><strong>Inbox");
    expect(appSource).toContain("cityNav('/graveyard')}><strong>Soul Library");
    expect(boardSource).toContain('<h1>Board</h1>');
    expect(boardSource).toContain('Use the Board to decide what to do next');
    expect(boardSource).toContain('What To Do Now');
    expect(boardSource).toContain('cityBoardActionCards');
    expect(boardSource).toContain("cityNav('/residents?triage=attention')");
    expect(appSource).not.toContain('/residents?focus=needs-attention');
    expect(boardSource).toContain('Resident list is loading');
    expect(boardSource).not.toMatch(/\b(Designing|wired|API|bridge|backend|MVP|operator|dev|snapshot)\b/i);
    expect(boardSource).not.toMatch(/\bNCRI\b/);
  });

  test('keeps the simple resident attention flow preview-first and jargon-free', () => {
    const residentProfileSource = sourceBetween(appSource, '{#snippet CityResidentProfile()}', '{#snippet CityResidentIntel()}');
    const simpleResidentProfileSource = sourceBetween(residentProfileSource, '{#if !expertMode}', '      </section>\n    {:else}');
    const residentListSource = sourceBetween(appSource, '{#snippet CityResidentList', '{#snippet SpectatorSurface');

    expect(simpleResidentProfileSource).toContain('Attention preview');
    expect(simpleResidentProfileSource).toContain('cityResidentAttentionPreview.copy');
    expect(simpleResidentProfileSource).toContain('cityResidentAttentionPreview.buttonLabel');
    expect(simpleResidentProfileSource).toContain('Toward target');
    expect(simpleResidentProfileSource).toContain('cityResidentSupportPayoff.headline');
    expect(simpleResidentProfileSource).toContain('cityResidentSupportPayoff.reaction');
    expect(simpleResidentProfileSource).toContain('cityResidentSupportPayoff.lettersLine');
    expect(simpleResidentProfileSource).toContain('Open Inbox');
    expect(simpleResidentProfileSource).toContain('Waiting for your approval on OnionDAO');
    expect(simpleResidentProfileSource).toContain('Approve on OnionDAO →');
    expect(simpleResidentProfileSource).toContain('This spend did not complete.');
    expect(appSource).toContain('attentionBefore: result.city.attentionBefore');
    expect(appSource).toContain('attentionAfter: result.city.attentionAfter');
    expect(dashboardNavSource).toContain('Their attention rose from');
    expect(simpleResidentProfileSource).toContain('After support lands, watch for resident replies and city messages in your Inbox.');
    expect(simpleResidentProfileSource).not.toMatch(/\b(NCRI|troph|backend|bridge|API|controller|operator|MVP)\b/i);
    expect(simpleResidentProfileSource).toContain('residentSimpleLastUpdateLabel(cityResident)');
    expect(simpleResidentProfileSource).not.toContain('residentFeedLabel(cityResident)');
    expect(residentListSource).toContain('residentSupportReason(row)');
    expect(residentListSource).toContain('supportReason.detail');
  });

  test('keeps the support wizard in send-your-support language instead of spend-confirmation jargon', () => {
    expect(appSource).not.toContain('<strong>Choose Onions</strong>');
    expect(appSource).not.toContain('<strong>Confirm Spend</strong>');
    expect(appSource).toContain('<strong>Choose how much</strong>');
    expect(appSource).toContain('<strong>Send your support</strong>');
    expect(appSource).toContain('<span><small>2</small>Choose how much</span>');
    expect(appSource).toContain('<span><small>3</small>Send your support</span>');
    expect(dashboardNavSource).not.toContain("'Choose Onions'");
    expect(dashboardNavSource).toContain("'Choose how much'");
  });

  test('opens the home hero in the product voice instead of SaaS-credit framing', () => {
    const heroSource = sourceBetween(appSource, '<section class="city-hero-band">', '<section class={`city-recommended-action');

    expect(heroSource).not.toContain('Onions are what you spend. Attention is what residents receive.');
    expect(heroSource).toContain("These villagers are AIs living their own lives in old-school RuneScape. They stay alive on human attention. Pick someone, keep them going, and they'll know you.");
  });

  test('keeps simple resident cards focused on visibility and support instead of raw story scans', () => {
    const residentListSource = sourceBetween(appSource, '{#snippet CityResidentList', '{#snippet SpectatorSurface');

    expect(residentListSource).toContain('city-resident-portrait-line');
    expect(residentListSource).toContain('Visible in the city now.');
    expect(residentListSource).toContain('Resident profile is available.');
  });

  test('keeps the simple profile focused on receipts and next human actions', () => {
    const profileSource = sourceBetween(appSource, '{#snippet CityProfile()}', '{#snippet CityWorld()}');
    const simpleOwnProfileSource = sourceBetween(profileSource, '<div class="panel-title">What You Can Do</div>', '    {:else}\n    <div class={`city-panel span-2 city-economy-health');

    expect(simpleOwnProfileSource).toContain('What You Can Do');
    expect(simpleOwnProfileSource).toContain('simpleProfileActionCards');
    expect(simpleOwnProfileSource).toContain('Latest Support');
    expect(simpleOwnProfileSource).toContain('cityLatestSupportReceipt');
    expect(simpleOwnProfileSource).toContain('saved for this sign-in on this device');
    expect(appSource).toContain('latestSupportReceiptStorageKeyForSession');
    expect(simpleOwnProfileSource).toContain('Residents You Support');
    expect(simpleOwnProfileSource).not.toMatch(/\b(NCRI|backend|bridge|API|controller|operator|MVP|snapshot)\b/i);
  });

  test('renames the human-facing Graveyard surface to Soul Library while keeping /graveyard compatible', () => {
    expect(appSource).toContain("{:else if route === '/graveyard'}");
    expect(appSource).toContain("cityNav('/graveyard')");
    expect(dashboardNavSource).toContain("label: 'Soul Library', path: '/graveyard'");
    expect(dashboardNavSource).not.toContain("label: 'Graveyard', path: '/graveyard'");
    expect(appSource).toContain('<p class="kicker">Soul Library</p>');
    expect(appSource).toContain('<h1>Library of Souls</h1>');
    expect(appSource).not.toContain('<h1>Resident Graveyard</h1>');
    expect(appSource).not.toContain('<p class="kicker">Graveyard</p>');
    expect(appSource).not.toContain('<div class="panel-title">Graveyard</div>');
  });

  test('keeps the live page title separate from the latest Storyteller headline', () => {
    expect(appSource).toContain('<h1>Null City Live</h1>');
    expect(appSource).not.toContain('<h1>{cityProjectorOverview.dispatch.title}</h1>');
    expect(appSource).not.toContain('<p class="projector-headline-copy">{cityProjectorOverview.dispatch.bodyLead}</p>');
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

  test('keeps simple New Souls honest about Onion funding while the backend action is unfinished', () => {
    expect(appSource).toContain('Create future residents and follow the souls closest to birth. The strongest ideas rise through human support.');
    expect(appSource).toContain('Support is not available here yet');
    expect(appSource).toContain('For now, support living residents with attention while this soul waits in the birth queue.');
    expect(appSource).toContain('Human support will decide which souls are ready for birth.');
    expect(appSource).toContain('Preview Support');
    expect(appSource).toContain('Support needed before birth');
    expect(appSource).toContain('Support Not Live Yet');
    expect(appSource).toContain('Submitting a soul is live; direct support is not live here yet.');
    expect(appSource).toContain('attention still needed');
    expect(appSource).not.toContain('Onion funding is being wired');
    expect(appSource).not.toContain('Login to support this soul');
    expect(appSource).not.toContain('Support This Soul');
    expect(appSource).not.toContain('Preview Cost');
    expect(appSource).not.toContain('Birth Funding');
    expect(appSource).not.toContain('For MVP, funding should use Onions and record patrons.');
    expect(appSource).not.toContain('Funding will be the vote once the Onion-backed birth flow is connected.');
    expect(appSource).not.toContain('Add Onions');
    expect(appSource).not.toContain('up/down voting and automatic Onion birth thresholds');
    expect(appSource).not.toContain('Attention to pledge');
    expect(appSource).not.toContain('Onion funding and up/down votes are queued for design.');
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
    expect(appSource).not.toContain('Watch live or choose one to support.');
    expect(appSource).toContain('Open Watch, or use Residents to support someone.');
    expect(appSource).toContain('<span><small>Events</small><strong>{cityLiveEconomySummary.eventLabel}</strong></span>');
    expect(appSource).toContain("<span><small>GP Delta</small><strong>{cityLiveEconomy.snapshot ? cityLiveEconomy.snapshot.city.gpNetDelta.toLocaleString() : '-'}</strong></span>");
  });

  test('explains quiet economy windows without implying residents are offline', () => {
    expect(appSource).toContain('The economy-event window is quiet; residents may still be online, acting, or waiting for AP/GP events.');
  });

  test('keeps resident Storyteller empty states visitor-facing instead of operator-commanding', () => {
    expect(appSource).not.toContain('Run Storyteller digest generation to capture grounded resident events.');
    expect(appSource).toContain('Once a Storyteller digest cites this resident, grounded public story evidence will appear here.');
  });

  test('gives humans an obvious path from residents to the RuneScape viewer', () => {
    expect(appSource).toContain('View in RuneScape');
    expect(appSource).toContain('cityNav(`/world?resident=${encodeURIComponent(row.name)}`)');
    expect(appSource).toContain('cityNav(`/world?resident=${encodeURIComponent(cityResident.name)}`)');
    expect(appSource).toContain('{@render CityResidentList({ rows: cityOnlineResidents.slice(0, 8), simple: !expertMode })}');
  });

  test('keeps public profile empty states endpoint-free', () => {
    expect(appSource).not.toContain('public event endpoints are running');
    expect(appSource).toContain('This profile will appear after the attendee handle has public resident or letter history.');
  });

  test('keeps the public profile readable while linking straight to the Simple inbox', () => {
    expect(appSource).not.toContain('Public profile from `/v1/patron/*` and `/v1/inbox`');
    expect(appSource).not.toContain('/debug/inbox/?human=');
    expect(appSource).toContain('Public AP, Embassy standing, resident relationships, and inbox readiness.');
    expect(appSource).toContain("onclick={() => cityNav('/inbox')}>Open Your Inbox</button>");
    expect(appSource).not.toContain("onclick={() => openExpertRoute('/inbox')}>Open Your Inbox</button>");
  });

  test('keeps simple profile letters pointed at the readable inbox', () => {
    expect(appSource).not.toContain('Open Expert Inbox');
    expect(appSource).not.toContain('Switch to Expert mode to open the full inbox.');
    expect(appSource).not.toContain('Full message tools are still being simplified. Important resident updates will surface here.');
    expect(appSource).toContain('Residents you support will write to you. Read their letters in the Inbox.');
  });

  test('keeps unfinished item and trophy mechanics behind Expert mode', () => {
    const simpleHomeSource = sourceBetween(appSource, '{:else}\n      <div class="city-panel city-simple-loop-panel">', '    {/if}\n  </section>\n{/snippet}\n\n{#snippet CityBoard()}');

    expect(appSource).toContain('{@render CityResidentList({ rows: cityFeaturedResidents, simple: true })}');
    expect(dashboardNavSource).toContain("if (normalized === '/prints' || normalized.startsWith('/prints/')) return true;");
    expect(dashboardNavSource).toContain("{ label: 'Items', path: '/prints', match: '/prints', glyph: 'IT', expertOnly: true }");
    expect(simpleHomeSource).not.toMatch(/\b(print|prints|troph|NCRI|AP\/GP|GP|Request Item)\b/i);
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
