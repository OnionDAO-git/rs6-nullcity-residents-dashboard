<script lang="ts">
  import { onMount } from 'svelte';
  import type { BenchmarkArtifact, BenchmarkArtifactSummary, BenchmarkLeaderboardRow, DashboardOverview, EventReadinessSummary, GatewayStatus, ObservableSubjectSummary, PatronActivitySummary, PatronDashboardSummary, PatronStandingSummary, Position, ReadinessCheckSummary, ReadinessLevel, RecentLetterSummary, RelationshipActivitySummary, ResidentAppearance, ResidentDashboardRow, ResidentRelationshipSummary, RuntimeReadModel, SoulSummary, SpectatorMode, SpectatorSession, SpectatorSubject } from '@nullcity-dashboard/shared';
  import { NullCitySpectatorBridge, type SpectatorDisplayFilters } from '@nullcity-dashboard/observer';
  import { createDomCanvasAdapter, createForkedRuntimeLifecycleAdapter, createGameClient, createHttpSessionTicketAdapter, type GameClientController, type GameClientStatus } from '@nullcity-dashboard/game-client';
  import { api, routeTo, type ResidentEconomy, type StorytellerDigestEventSummary, type StorytellerDigestSummary } from './lib/api';
  import { buildActivitySnapshot } from './lib/activity';
  import { benchmarkActionRows } from './lib/benchmarks';
  import { CityApiError, cityApi, residentTradeSummary, residentTradeTone, setCityCsrfToken, type CityProfile as CityProfileData, type InboxThread, type InboxThreadDetail, type LibrarySoulLife, type NullCityApGpExchangeRecord, type NullCityEconomyHeartbeatBridgeResponse, type NullCityEconomyListingsBridgeResponse, type NullCityLiveEconomyBridgeResponse, type NullCityLiveEconomyStreamSnapshot, type NullCityNcriPrintQueueBridgeResponse, type NullCityNcriPrintQueueEntry, type NullCityNcriRecord, type NullCitySoulProposal, type PointLedgerEntry, type PointResource, type PrintQueueEntry, type PrintRequest, type Printer, type ResidentPost, type ResidentReadModel, type ResidentTrade, type SoulProposal, type SoulProposalInput, type SoulQuote } from './lib/city-api';
  import { compactJson, timeAgo } from './lib/format';
  import { cityDemoPathSteps, type CityDemoApSupportSignal } from './lib/demo-path';
  import { buildEconomyProofSummary, economyProofNextActions, type EconomyProofSummary } from './lib/economy-proof';
  import { economyEventDisplay, economyResidentDisplay, economyStreamStatusAfterTimeout, selfFundedApResidentRows, summarizeEconomyHeartbeat, summarizeEconomyListings, summarizeEconomyTransport, summarizeLiveEconomy, type EconomyHeartbeatSummary, type EconomyListingsSummary, type EconomyTransportStatus, type EconomyTransportSummary, type LiveEconomySummary, type SelfFundedApResidentRow } from './lib/live-economy';
  import { latestBenchmarkForResident, residentBenchmarkSignal } from './lib/resident-benchmark';
  import { residentEconomyGpEvidence, residentEconomyReceiptTrail, residentLiveEconomyGpEvidence, residentLiveEconomyMoment, type ResidentEconomyGpEvidence, type ResidentEconomyMoment, type ResidentEconomyReceipt } from './lib/resident-economy-evidence';
  import { applyResidentHealthControls, residentHealthSummary, type ResidentHealthFilter, type ResidentSortMode } from './lib/resident-health';
  import {
    residentAgencyCue,
    residentApSupportRecommendation,
    residentAttentionRunway,
    residentCauseSignal,
    residentDemoPickCue,
    residentGuestTrailFacts,
    residentGuestTrailGuideCopy,
    residentGuestTrailPulse,
    residentIntelligenceFacts,
    residentIntentFacts,
    residentLivenessDetail,
    residentLivenessLedger,
    residentLiveMoment,
    residentLoopCheckpoints,
    residentLoopSignal,
    residentLoopSummaryLine,
    residentMemoryEvidenceFacts,
    residentMemoryFreshness,
    residentNeedsApSupportSoon,
    residentNextStepCue,
    residentNormalLifeAuditSignal,
    residentOperatorWarnings,
    residentProofPulse,
    residentProofRollup,
    residentPrimaryWarning,
    residentPublicStateTiles,
    residentRosterScanLines,
    residentStackSummary,
    residentTriageFocusFromSearch,
    residentTriageSummary,
    visibleResidentTriageBuckets,
    type ResidentApSupportRecommendation,
    type ResidentLoopFact,
    type ResidentProofPulseSignals,
    type ResidentProofRollup,
    type ResidentGuestTrailPulse,
    type ResidentTriageBucketKey,
    type ResidentTriageSummary,
  } from './lib/resident-loop';
  import { residentStoryDigestSignal, residentStoryEvents, storytellerDigestRunList, storytellerDigestStatus, storytellerGroundingAudit, storytellerLatestPreview, storytellerLibraryPreview, storytellerMythCard, storytellerReviewDensity, storytellerRunListPressureLine, type ResidentStoryEvent, type StorytellerDigestRunList } from './lib/resident-story';
  import { residentIsOnline as isResidentOnline } from './lib/resident-status';
  import { DEBUG_PREFIX, cityPath, cityRouteNeedsSnapshot, cityRouteNeedsStoryDigests, debugPath, isDebugPath, isKnownCityRoute, isProtectedCityRoute, isStoryRoute, observeResidentDebugRoute, publicEventPath, residentDebugRoute, residentRuntimeApiPath, toDebugInternalRoute } from './lib/routes';
  import { printQueueInsights } from './lib/print-queue-insights';
  import { printResidentProofSignal } from './lib/print-resident-proof';
  import { printResidentSignals, type PrintResidentSignal } from './lib/print-resident-signals';
  import { printStoryDigestSignal, type PrintStoryDigestSignal } from './lib/print-story-digest';
  import { buildProfileEconomySummary, type ProfileEconomySummary } from './lib/profile-economy';
  import { fetchPublicPatronProfile, publicPatronHandleFromSearch, publicPatronInitials, publicPatronStandingLabel, type PublicPatronProfile } from './lib/public-patron';
  import { residentGoalContractSignal, type ResidentGoalContractSignal } from './lib/resident-goal-contract';
  import { cityDataNoticeCopy, findResidentReadModel, loadCitySnapshotWithLiveFallback, residentDetailEmptyState, residentLoopAvailabilityState, residentRosterEmptyState, residentRouteSlug, residentRowsForCityDirectory, resolveResidentRouteId } from './lib/resident-route';
  import { buildReleaseReadiness, releaseReadinessActionQueue, releaseReadinessDemoProofRail, releaseReadinessFirstFiveSteps, releaseReadinessMetricTiles, type ReleaseReadinessActionQueueItem, type ReleaseReadinessStatus, type ReleaseReadinessSummary } from './lib/release-readiness';
  import { buildWorldReadiness, type WorldReadinessSummary } from './lib/world-readiness';
  import ModelViewer from './lib/rs6/ModelViewer.svelte';
  import EconomyPanel from './lib/EconomyPanel.svelte';

  type CitySession = {
    authenticated: boolean;
    name: string;
    handle: string;
    email: string;
    avatarUrl: string;
    ap: number;
    gp: number;
    admin: boolean;
    loginUrl: string;
    logoutUrl: string;
    csrfToken: string;
    cityUserId: string;
  };

  type CityEntry = {
    label: string;
    path: string;
    tone: string;
    metric: string;
    detail: string;
  };

  type CityNavItem = {
    label: string;
    path: string;
    match: string;
    glyph: string;
  };

  type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  };

  type FullscreenCapableDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
  };

  type FullscreenCapableElement = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };

  const guestSession: CitySession = {
    authenticated: false,
    name: 'Guest attendee',
    handle: 'not signed in',
    email: '',
    avatarUrl: '',
    ap: 0,
    gp: 0,
    admin: false,
    loginUrl: '/login',
    logoutUrl: '',
    csrfToken: '',
    cityUserId: '',
  };

  const browserOrigin = window.location.origin;
  let browserPath = window.location.pathname;
  let browserSearch = window.location.search;
  let route = toRouteForShell(browserPath);
  let loading = false;
  let actionBusy = false;
  let error = '';
  let actionError = '';
  let cityDataError = '';
  let sessionLoading = true;
  let citySession: CitySession = guestSession;
  let publicProfileHandle = '';
  let notificationPermission: NotificationPermission | 'unsupported' = notificationStatus();
  let notificationsEnabled = false;
  let inboxNotificationReady = false;
  let pwaInstallPrompt: BeforeInstallPromptEvent | undefined;
  let appInstalled = window.matchMedia('(display-mode: standalone)').matches;
  let overview: DashboardOverview | undefined;
  let gatewayStatus: GatewayStatus | undefined;
  let residents: ResidentDashboardRow[] = [];
  let selectedRuntime: RuntimeReadModel | undefined;
  let subjects: ObservableSubjectSummary[] = [];
  let sessions: SpectatorSession[] = [];
  let souls: SoulSummary[] = [];
  let logs: { actions: unknown[]; inference: unknown[] } = { actions: [], inference: [] };
  let benchmarkRuns: BenchmarkArtifactSummary[] = [];
  let cityBenchmarkRuns: BenchmarkArtifactSummary[] = [];
  let selectedBenchmark: BenchmarkArtifact | undefined;
  let benchmarkLeaderboard: BenchmarkLeaderboardRow[] = [];
  let rawVisibleResidents: ResidentDashboardRow[] = [];
  let visibleResidents: ResidentDashboardRow[] = [];
  let cityResidents: ResidentDashboardRow[] = [];
  let cityOnlineResidents: ResidentDashboardRow[] = [];
  let cityLowAttentionResidents: ResidentDashboardRow[] = [];
  let cityFeaturedResidents: ResidentDashboardRow[] = [];
  let cityEntries: CityEntry[] = [];
  let cityResident: ResidentDashboardRow | undefined;
  let cityProfileData: CityProfileData | undefined;
  let cityPublicPatronProfile: PublicPatronProfile | undefined;
  let cityLedger: PointLedgerEntry[] = [];
  let cityLedgerFilter: PointResource | 'all' = 'all';
  let cityProposals: SoulProposal[] = [];
  let citySelectedProposal: SoulProposal | undefined;
  let cityNullcityBridgeAvailable = false;
  let cityNullcityBridgeError = '';
  let cityNullcityProposals: NullCitySoulProposal[] = [];
  let cityNullcityNcriRecords: NullCityNcriRecord[] = [];
  let cityNullcityNcriPrintQueue: NullCityNcriPrintQueueBridgeResponse = { available: false, items: [], error: 'not_loaded' };
  let cityProposalQuote: SoulQuote | undefined;
  let cityInboxThreads: InboxThread[] = [];
  let citySelectedThread: InboxThreadDetail | undefined;
  let cityTrades: ResidentTrade[] = [];
  let cityResidentTrades: ResidentTrade[] = [];
  let cityPrintRequests: PrintRequest[] = [];
  let citySelectedPrint: PrintRequest | undefined;
  let cityPrinters: Printer[] = [];
  let cityPrintQueue: PrintQueueEntry[] = [];
  let cityDirectoryResidents: ResidentReadModel[] = [];
  let cityResidentReadModel: ResidentReadModel | undefined;
  let cityResidentPosts: ResidentPost[] = [];
  let cityResidentEconomy: ResidentEconomy | undefined;
  let cityResidentGoalContracts: Record<string, ResidentGoalContractSignal> = {};
  let cityLibraryLives: LibrarySoulLife[] = [];
  let cityStoryDigests: StorytellerDigestSummary[] = [];
  let cityStoryRunList: StorytellerDigestRunList = storytellerDigestRunList([]);
  let cityStoryRunId = '';
  let cityStoryDigest: StorytellerDigestSummary | undefined;
  let cityLibraryStoryPreview = storytellerLibraryPreview(undefined);
  let cityPrintInsights = printQueueInsights([], [], []);
  let cityPrintResidentSignals: PrintResidentSignal[] = [];
  let cityPrintStorySignal: PrintStoryDigestSignal = printStoryDigestSignal({
    digests: [],
    printInsights: cityPrintInsights,
    ncriRecords: [],
  });
  let cityProfileEconomy: ProfileEconomySummary = buildProfileEconomySummary({
    apBalance: 0,
    gpBalance: 0,
    ledger: [],
    residents: [],
  });
  let cityEconomyProofs: EconomyProofSummary = buildEconomyProofSummary([]);
  let cityLiveEconomy: NullCityLiveEconomyBridgeResponse = { available: false, error: 'not_loaded' };
  let cityEconomyHeartbeat: NullCityEconomyHeartbeatBridgeResponse = { available: false, error: 'not_loaded' };
  let cityEconomyListings: NullCityEconomyListingsBridgeResponse = { available: false, listings: [], error: 'not_loaded' };
  let cityEconomyStream: EventSource | undefined;
  let cityEconomyStreamKey = '';
  let cityEconomyStreamTimeout: ReturnType<typeof setTimeout> | undefined;
  let cityEconomyStreamStatus: EconomyTransportStatus = 'polling';
  let cityLiveEconomySummary: LiveEconomySummary = summarizeLiveEconomy(cityLiveEconomy);
  let citySelfFundedApRows: SelfFundedApResidentRow[] = [];
  let cityEconomyHeartbeatSummary: EconomyHeartbeatSummary = summarizeEconomyHeartbeat(cityEconomyHeartbeat);
  let cityEconomyListingsSummary: EconomyListingsSummary = summarizeEconomyListings(cityEconomyListings);
  let cityEconomyTransportSummary: EconomyTransportSummary = summarizeEconomyTransport(cityEconomyStreamStatus, cityLiveEconomy, cityEconomyHeartbeat);
  let cityReleaseReadiness: ReleaseReadinessSummary = buildReleaseReadiness({
    residents: [],
    storyDigests: [],
    printInsights: cityPrintInsights,
    economyTransport: cityEconomyTransportSummary,
  });
  let cityReleaseReadinessActions: ReleaseReadinessActionQueueItem[] = releaseReadinessActionQueue(cityReleaseReadiness);
  let cityWorldReadiness: WorldReadinessSummary = buildWorldReadiness({
    authenticated: false,
    onlineResidents: [],
    gameClientStatus: 'idle',
  });
  let cityResidentStoryEvents: ResidentStoryEvent[] = [];
  let cityResidentStorySignal = residentStoryDigestSignal(undefined, []);
  let cityResidentBenchmarkStatus = residentBenchmarkSignal(undefined);
  let cityResidentGoalContract: ResidentGoalContractSignal = residentGoalContractSignal(undefined);
  let cityResidentEconomyGpEvidence: ResidentEconomyGpEvidence | undefined;
  let cityResidentEconomyMoment: ResidentEconomyMoment | undefined;
  let cityResidentEconomyReceipts: ResidentEconomyReceipt[] = [];
  let cityResidentProofPulse = residentProofPulse(undefined);
  let cityResidentApSupport = residentApSupportRecommendation(undefined);
  let cityResidentProofRollup: ResidentProofRollup = residentProofRollup([]);
  let cityResidentTriage: ResidentTriageSummary = residentTriageSummary([]);
  let cityResidentTriageFocus: ResidentTriageBucketKey | '' = '';
  let cityResidentDemoPick = residentDemoPickCue([]);
  let cityDemoApSupport: CityDemoApSupportSignal | undefined;
  let cityResidentLoopAvailability = residentLoopAvailabilityState({ hasLiveResident: false, hasProjectedResident: false });
  let cityLoopPulse: ResidentGuestTrailPulse = {
    online: 0,
    lowAp: 0,
    planPublished: 0,
    recentAction: 0,
    recentSpeech: 0,
    storyEvidence: 0,
    observedGp: 0,
  };
  let cityGuestTrailGuide = residentGuestTrailGuideCopy(cityLoopPulse);
  let cityNormalLifeAudit = residentNormalLifeAuditSignal(cityBenchmarkRuns);
  let activeSession: SpectatorSession | undefined;
  let activeObserveSession: SpectatorSession | undefined;
  let activeResidentSession: SpectatorSession | undefined;
  let liveSelectedRuntime: RuntimeReadModel | undefined;
  let sessionStream: EventSource | undefined;
  let sessionStreamId = '';
  let runtimeStream: EventSource | undefined;
  let runtimeStreamResident = '';
  let showSpectatorPlayers = true;
  let showSpectatorNpcs = true;
  let showSpectatorObjects = false;
  let showSpectatorItems = true;
  let spectatorZoom = 1;
  let spectatorModalOpen = false;
  let perceptionFeedLoadingResident = '';
  let sparkActivityTab: 'activity' | 'stats' = 'activity';
  let residentHealthFilter: ResidentHealthFilter = 'all';
  let residentSortMode: ResidentSortMode = 'health';
  let residentModelQuery = '';
  let statsModelBytes: ArrayBuffer | null = null;
  let statsModelStatus = '';
  let statsModelKey = '';

  const defaultSpawnX = '3225';
  const defaultSpawnY = '3217';
  const defaultSpawnLevel = '0';
  const defaultInferenceEndpoint = 'default';
  const defaultInferenceTemperature = '0.6';
  const spawnInferenceStorageKey = 'nullcity.spawnInference';
  const inboxNotificationEnabledKey = 'nullcity.inboxNotifications.enabled';
  const inboxNotificationSeenKeyPrefix = 'nullcity.inboxNotifications.seen';
  const spectatorZoomMin = 0.5;
  const spectatorZoomMax = 3;
  const spectatorZoomStep = 0.25;
  const namePrefixes = ['ash', 'brim', 'cove', 'dusk', 'fern', 'glen', 'mire', 'rune', 'vale', 'west'];
  const nameRoles = ['adept', 'baker', 'mason', 'miner', 'scribe', 'smith', 'weaver', 'walker'];
  const appearanceParts = {
    head: [0, 1, 2, 3, 4, 5, 6, 7],
    facialHair: [10, 11, 12, 13, 14, 15, 16, 17],
    torso: [18, 19, 20, 21, 22, 23, 24, 25],
    arms: [26, 27, 28, 29, 30, 31],
    hands: [33, 34, 35],
    legs: [36, 37, 38, 39, 40],
    feet: [42, 43, 44],
  };

  let filter = 'all';
  let newName = randomResidentName();
  let newAppearance: ResidentAppearance = randomAppearance();
  let spawnX = defaultSpawnX;
  let spawnY = defaultSpawnY;
  let spawnLevel = defaultSpawnLevel;
  let selectedSoulFile = '';
  let inferenceEndpoint = defaultInferenceEndpoint;
  let inferenceModel = '';
  let inferenceTemperature = defaultInferenceTemperature;
  let autonomousSpawn = true;
  let spawnInferenceDefaultsLoaded = false;
  let spawnDraftRoute = '';
  let disconnectPolicy = 'idle';
  let profileDisplayName = '';
  let profileHandle = '';
  let profileAvatarUrl = '';
  let proposalResidentName = '';
  let proposalDisplayName = '';
  let proposalGoal = '';
  let proposalPersonality = '';
  let proposalVirtues = '';
  let proposalVices = '';
  let proposalFears = '';
  let proposalVoice = '';
  let proposalFirstMemory = '';
  let proposalSecret = '';
  let proposalLevels = 'hitpoints:10';
  let proposalEquipment = '';
  let proposalInventory = '';
  let contributionAp = '100';
  let grantAttentionAp = '100';
  let grantAttentionMemo = '';
  let tradeOfferResource: PointResource = 'AP';
  let tradeOfferAmount = '25';
  let tradeRequestedItem = 'coin-995 GP';
  let printTitle = '';
  let printDescription = '';
  let printMaterial = 'PLA';
  let printColor = '';
  let printQuantity = '1';
  let printUserNotes = '';
  let printFileName = '';
  let printFileMime = 'model/stl';
  let printFileSize = '';
  let printerName = '';
  let printerKind: Printer['kind'] = 'generic';
  let printerAdapter: Printer['adapter'] = 'manual';
  let printerBridgeId = '';
  let printerEnabled = true;
  let printerNotes = '';
  let printQuoteGp = '40';
  let printQuoteNotes = '';
  let nullcityProposalAdminNotes: Record<string, string> = {};
  let adminGrantCityUserId = '';
  let adminGrantResource: PointResource = 'AP';
  let adminGrantAmount = '100';
  let adminGrantMemo = '';
  let exchangeResidentId = 'res:qa-angler';
  let exchangeApAmount = '50';
  let exchangeGpAmount = '25';
  let exchangeCityUserId = '';
  let exchangeResult: NullCityApGpExchangeRecord | undefined;
  let cityActionNotice = '';
  let gameClientMount: HTMLElement | undefined;
  let gameClientCanvas: HTMLCanvasElement | undefined;
  let gameClientController: GameClientController | undefined;
  let gameClientStatus: GameClientStatus = 'idle';
  let gameClientTicketUser = '';
  let cityGameFullscreen = false;
  let cityGameFullscreenFallback = false;

  const cityGameFullscreenAvailable =
    'requestFullscreen' in document.documentElement || 'webkitRequestFullscreen' in document.documentElement;

  const basePartMap = [8, 11, 4, 6, 9, 7, 10] as const;
  const defaultIdkIdsByGender = {
    M: [0, 10, 18, 26, 33, 36, 42],
    F: [45, -1, 56, 61, 67, 70, 79],
  } as const;
  const skillOrder = ['attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving', 'slayer', 'farming', 'runecrafting', 'construction'];
  const cityNavItems: CityNavItem[] = [
    { label: 'Overview', path: '/', match: '/', glyph: 'OV' },
    { label: 'World', path: '/world', match: '/world', glyph: 'WO' },
    { label: 'Story', path: '/story', match: '/story', glyph: 'ST' },
    { label: 'Economy', path: '/economy', match: '/economy', glyph: 'EC' },
    { label: 'Embassy', path: '/embassy', match: '/embassy', glyph: 'EM' },
    { label: 'Residents', path: '/residents', match: '/residents', glyph: 'RE' },
    { label: 'Inbox', path: '/inbox', match: '/inbox', glyph: 'IN' },
    { label: 'Prints', path: '/prints', match: '/prints', glyph: 'PR' },
    { label: 'Profile', path: '/profile', match: '/profile', glyph: 'PF' },
  ];

  $: embassyPages = [
    { label: 'Embassy Index', path: publicEventPath('/index.html', browserOrigin) },
    { label: 'Wall', path: publicEventPath('/wall/', browserOrigin) },
    { label: 'Inbox', path: publicEventPath('/inbox/', browserOrigin) },
    { label: 'Patron', path: publicEventPath('/patron/', browserOrigin) },
    { label: 'Graveyard', path: publicEventPath('/graveyard/', browserOrigin) },
    { label: 'Library', path: publicEventPath('/library/', browserOrigin) },
  ];

  $: isDebugRoute = isDebugPath(browserPath);
  $: route = toRouteForShell(browserPath);
  $: publicProfileHandle = !isDebugRoute && route === '/profile' ? publicPatronHandleFromSearch(browserSearch) : '';
  $: parts = route.split('/').filter(Boolean);
  $: residentName = isDebugRoute && parts[0] === 'residents' && parts[1] && parts[1] !== 'new' ? decodeURIComponent(parts[1]) : '';
  $: benchmarkRunId = isDebugRoute && parts[0] === 'benchmarks' && parts[1] ? decodeURIComponent(parts[1]) : '';
  $: cityParts = browserPath.split('/').filter(Boolean);
  $: cityResidentId = !isDebugRoute && cityParts[0] === 'residents' && cityParts[1] && cityParts[1] !== 'new' ? decodeURIComponent(cityParts[1]) : '';
  $: cityProposalId = !isDebugRoute && cityParts[0] === 'embassy' && cityParts[1] && cityParts[1] !== 'new' ? decodeURIComponent(cityParts[1]) : '';
  $: cityInboxThreadId = !isDebugRoute && cityParts[0] === 'inbox' && cityParts[1] ? decodeURIComponent(cityParts[1]) : '';
  $: cityPrintId = !isDebugRoute && cityParts[0] === 'prints' && cityParts[1] && cityParts[1] !== 'new' ? decodeURIComponent(cityParts[1]) : '';
  $: cityStoryRunId = !isDebugRoute && cityParts[0] === 'story' && cityParts[1] ? decodeURIComponent(cityParts[1]) : '';
  $: cityStoryDigest = cityStoryRunId
    ? cityStoryDigests.find(digest => digest.runId === cityStoryRunId || digest.digestId === cityStoryRunId)
    : cityStoryDigests[0];
  $: cityStoryRunList = storytellerDigestRunList(cityStoryDigests, cityStoryRunId);
  $: cityLibraryStoryPreview = storytellerLibraryPreview(cityStoryDigests[0]);
  $: cityLoginUrlReady = loginUrlIsReady(citySession.loginUrl);
  $: cityResident = cityResidentId ? cityResidents.find(row => residentSlug(row.name) === residentSlug(cityResidentId) || row.name.toLowerCase() === cityResidentId.toLowerCase()) : undefined;
  $: cityResidentStoryEvents = residentStoryEvents(cityResident, cityStoryDigests, 5);
  $: cityResidentStorySignal = residentStoryDigestSignal(cityResident, cityStoryDigests);
  $: cityResidentBenchmarkStatus = residentBenchmarkLabel(cityResident);
  $: cityResidentGoalContract = residentGoalContractSignal(cityResidentEconomy);
  $: cityResidentEconomyGpEvidence = residentEconomyGpEvidence(cityResidentEconomy);
  $: cityResidentEconomyMoment = cityResident ? residentLiveEconomyMoment(cityLiveEconomy, cityResident.name) : undefined;
  $: cityResidentEconomyReceipts = residentEconomyReceiptTrail({
    economy: cityResidentEconomy,
    liveEconomy: cityLiveEconomy,
    residentName: cityResident?.name || cityResidentId,
    limit: 4,
  });
  $: cityResidentProofPulse = residentProofPulse(cityResident, {
    benchmark: cityResidentBenchmarkStatus,
    economyGp: cityResidentEconomyGpEvidence,
    goalContract: cityResidentGoalContract,
    storyteller: cityResidentStorySignal,
  });
  $: cityResidentApSupport = residentApSupportRecommendation(cityResident);
  $: cityPrintInsights = printQueueInsights(cityPrintRequests, cityPrintQueue, cityTrades);
  $: cityPrintResidentSignals = printResidentSignals(cityResidents, cityNullcityNcriRecords, cityTrades, 5);
  $: cityPrintStorySignal = printStoryDigestSignal({
    digests: cityStoryDigests,
    printInsights: cityPrintInsights,
    ncriRecords: cityNullcityNcriRecords,
  });
  $: cityResidents = residentRowsForCityDirectory(overview?.residents, residents);
  $: cityEconomyProofs = buildEconomyProofSummary(cityBenchmarkRuns);
  $: cityLiveEconomySummary = summarizeLiveEconomy(cityLiveEconomy);
  $: citySelfFundedApRows = selfFundedApResidentRows(cityLiveEconomy);
  $: cityEconomyHeartbeatSummary = summarizeEconomyHeartbeat(cityEconomyHeartbeat);
  $: cityEconomyListingsSummary = summarizeEconomyListings(cityEconomyListings);
  $: cityEconomyTransportSummary = summarizeEconomyTransport(cityEconomyStreamStatus, cityLiveEconomy, cityEconomyHeartbeat);
  $: cityReleaseReadiness = buildReleaseReadiness({
    residents: cityResidents,
    storyDigests: cityStoryDigests,
    printInsights: cityPrintInsights,
    economyTransport: cityEconomyTransportSummary,
    benchmarkRuns: cityBenchmarkRuns,
  });
  $: cityReleaseReadinessActions = releaseReadinessActionQueue(cityReleaseReadiness);
  $: cityWorldReadiness = buildWorldReadiness({
    authenticated: citySession.authenticated,
    gateway: gatewayStatus,
    onlineResidents: cityOnlineResidents,
    gameClientStatus,
    ticketUser: gameClientTicketUser,
  });
  $: cityOnlineResidents = cityResidents.filter(row => row.online);
  $: cityLowAttentionResidents = cityResidents.filter(row => (row.attention ?? 999) <= 2);
  $: cityFeaturedResidents = [...cityOnlineResidents, ...cityResidents.filter(row => !row.online)].slice(0, 6);
  $: cityEntries = cityEntryPoints(citySession, cityResidents);
  $: cityLoopPulse = residentGuestTrailPulse(cityResidents);
  $: cityGuestTrailGuide = residentGuestTrailGuideCopy(cityLoopPulse);
  $: cityNormalLifeAudit = residentNormalLifeAuditSignal(cityBenchmarkRuns);
  $: cityResidentProofRollup = residentProofRollup(cityResidents, cityResidentRosterSignals);
  $: cityResidentTriage = residentTriageSummary(cityResidents, cityResidentRosterSignals);
  $: cityResidentTriageFocus = !isDebugRoute && route === '/residents' ? residentTriageFocusFromSearch(browserSearch) : '';
  $: cityResidentLivenessLedger = residentLivenessLedger(cityResidents, cityResidentRosterSignals, 8);
  $: cityResidentDemoPick = residentDemoPickCue(cityResidents, cityResidentRosterSignals);

  function cityResidentRosterSignals(row: ResidentDashboardRow): ResidentProofPulseSignals {
    const goalContract = cityResidentGoalContracts[row.name];
    return {
      benchmark: residentBenchmarkLabel(row),
      economyGp: residentLiveEconomyGpEvidence(cityLiveEconomy, row.name),
      ...(goalContract ? { goalContract } : {}),
      storyteller: residentStoryDigestSignal(row, cityStoryDigests),
    };
  }
  $: cityDemoApSupport = cityDemoApSupportSignal();
  $: cityLatestStoryStatus = cityStoryDigests[0] ? storytellerDigestStatus(cityStoryDigests[0]) : undefined;
  $: cityDemoPath = cityDemoPathSteps({
    authenticated: citySession.authenticated,
    residentCount: cityResidents.length,
    onlineResidents: cityOnlineResidents.length,
    lowApResidents: cityLowAttentionResidents.length,
    ...(cityDemoApSupport ? { apSupport: cityDemoApSupport } : {}),
    demoResident: {
      tone: cityResidentDemoPick.tone,
      ...(cityResidentDemoPick.residentName ? { name: cityResidentDemoPick.residentName } : {}),
      ...(cityResidentDemoPick.residentName ? { path: `/residents/${encodeURIComponent(residentSlug(cityResidentDemoPick.residentName))}` } : {}),
      action: cityResidentDemoPick.action,
      detail: cityResidentDemoPick.detail,
    },
    story: {
      tone: cityLatestStoryStatus?.tone || 'warn',
      label: cityLatestStoryStatus?.label || 'waiting',
      ...((cityStoryDigests[0]?.dispatch?.publicTitle || cityStoryDigests[0]?.digestId)
        ? { title: cityStoryDigests[0]?.dispatch?.publicTitle || cityStoryDigests[0]?.digestId }
        : {}),
      summary: cityLatestStoryStatus?.summary || 'No Storyteller run is loaded yet; open the feed to inspect digest availability.',
    },
  });
  $: cityProfileEconomy = buildProfileEconomySummary({
    apBalance: citySession.ap,
    gpBalance: citySession.gp,
    ledger: cityLedger,
    residents: cityResidents,
  });
  $: cityResidentTrades = tradesForResident(cityResident?.name || cityResidentReadModel?.nullcityResidentId || cityResidentId, cityTrades);
  $: cityResidentLoopAvailability = residentLoopAvailabilityState({
    hasLiveResident: Boolean(cityResident),
    hasProjectedResident: Boolean(cityResidentReadModel),
    ...((cityResidentReadModel?.latestSeenAt || cityResidentReadModel?.updatedAt)
      ? { latestSeenAt: cityResidentReadModel.latestSeenAt || cityResidentReadModel.updatedAt }
      : {}),
    ...(cityResidentPosts[0]?.createdAt ? { latestPostAt: cityResidentPosts[0].createdAt } : {}),
  });
  $: embassyPageActive = isDebugRoute && embassyPages.some(page => browserPath === page.path || browserPath === page.path.replace(/\/$/, ''));
  $: rawVisibleResidents = isDebugRoute && route === '/' ? overview?.residents || [] : residents;
  $: visibleResidents = applyResidentHealthControls(rawVisibleResidents, {
    filter: residentHealthFilter,
    sort: residentSortMode,
    modelQuery: residentModelQuery,
  });
  $: canDeleteResidents = Boolean(gatewayStatus?.allowDelete);
  $: activeObserveSession = findObserveRouteSession(activeSession, sessions);
  $: activeResidentSession = findResidentSession(activeSession, sessions, residentName);
  $: {
    if (
      perceptionFeedLoadingResident &&
      (!residentName ||
        perceptionFeedLoadingResident.toLowerCase() !== residentName.toLowerCase() ||
        activeResidentSession?.latestPerception)
    ) {
      perceptionFeedLoadingResident = '';
    }
  }
  $: perceptionFeedLoading = Boolean(
    perceptionFeedLoadingResident &&
      residentName &&
      perceptionFeedLoadingResident.toLowerCase() === residentName.toLowerCase() &&
      !activeResidentSession?.latestPerception,
  );
  $: liveSelectedRuntime = withLiveResidentBody(selectedRuntime, activeResidentSession);
  $: statsAppearance = buildResidentAppearance(liveSelectedRuntime);
  $: currentStatsModelKey = statsAppearance ? JSON.stringify(statsAppearance) : '';
  $: if (sparkActivityTab === 'stats' && currentStatsModelKey && currentStatsModelKey !== statsModelKey) {
    void loadStatsModel(statsAppearance, currentStatsModelKey);
  }
  $: spectatorFilters = {
    players: showSpectatorPlayers,
    npcs: showSpectatorNpcs,
    objects: showSpectatorObjects,
    items: showSpectatorItems,
    zoom: spectatorZoom,
  };
  $: {
    if (isDebugRoute && route === '/residents/new' && spawnDraftRoute !== route) {
      seedSpawnDraft();
      spawnDraftRoute = route;
    } else if (!isDebugRoute || route !== '/residents/new') {
      spawnDraftRoute = '';
    }
  }

  onMount(() => {
    const listener = () => {
      browserPath = window.location.pathname;
      browserSearch = window.location.search;
      void loadRoute();
    };
    const beforeInstallPromptListener = (event: Event) => {
      event.preventDefault();
      pwaInstallPrompt = event as BeforeInstallPromptEvent;
    };
    const appInstalledListener = () => {
      appInstalled = true;
      pwaInstallPrompt = undefined;
    };
    const fullscreenChangeListener = () => updateCityGameFullscreenState();
    const fullscreenKeyListener = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && cityGameFullscreenFallback) {
        cityGameFullscreenFallback = false;
        updateCityGameFullscreenState();
      }
    };
    const gameErrorListener = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: string }>).detail;
      gameClientStatus = 'error';
      actionError = detail?.page ? `Game client failed: ${detail.page}` : 'Game client failed.';
    };
    notificationsEnabled = window.localStorage.getItem(inboxNotificationEnabledKey) === 'true';
    notificationPermission = notificationStatus();
    window.addEventListener('popstate', listener);
    window.addEventListener('beforeinstallprompt', beforeInstallPromptListener);
    window.addEventListener('appinstalled', appInstalledListener);
    window.addEventListener('nullcity:game-error', gameErrorListener);
    document.addEventListener('fullscreenchange', fullscreenChangeListener);
    document.addEventListener('webkitfullscreenchange', fullscreenChangeListener);
    document.addEventListener('keydown', fullscreenKeyListener);
    void bootstrapSession();
    void loadRoute();
    const timer = setInterval(() => void refreshQuietly(), 5000);
    return () => {
      window.removeEventListener('popstate', listener);
      window.removeEventListener('beforeinstallprompt', beforeInstallPromptListener);
      window.removeEventListener('appinstalled', appInstalledListener);
      window.removeEventListener('nullcity:game-error', gameErrorListener);
      document.removeEventListener('fullscreenchange', fullscreenChangeListener);
      document.removeEventListener('webkitfullscreenchange', fullscreenChangeListener);
      document.removeEventListener('keydown', fullscreenKeyListener);
      clearInterval(timer);
      closeRuntimeStream();
      closeSessionStream();
      closeCityEconomyStream();
      void stopCityGameClient();
    };
  });

  async function refreshQuietly() {
    try {
      await loadRoute(false);
    } catch {
      // Keep stale data visible during reconnects.
    }
  }

  function normalizeRoutePath(pathname: string): string {
    const [pathOnly = '/'] = pathname.split(/[?#]/);
    const withSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
    return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : '/';
  }

  function toRouteForShell(pathname: string): string {
    return isDebugPath(pathname) ? toDebugInternalRoute(pathname) : normalizeRoutePath(pathname);
  }

  function debugNav(path: string) {
    routeTo(debugPath(path));
  }

  function cityNav(path: string) {
    routeTo(cityPath(path));
  }

  async function bootstrapSession() {
    sessionLoading = true;
    try {
      citySession = normalizeCitySession(await cityApi.session());
    } catch {
      citySession = guestSession;
    } finally {
      setCityCsrfToken(citySession.csrfToken);
      if (!citySession.authenticated) inboxNotificationReady = false;
      sessionLoading = false;
    }
  }

  async function loadRoute(showSpinner = true) {
    const currentBrowserPath = window.location.pathname;
    browserPath = currentBrowserPath;
    browserSearch = window.location.search;
    const currentIsDebug = isDebugPath(currentBrowserPath);
    const currentRoute = toRouteForShell(currentBrowserPath);
    if (showSpinner) loading = true;
    error = '';
    try {
      if (currentIsDebug) await loadDebugRoute(currentRoute);
      else await loadCityRoute(currentRoute);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Request failed';
    } finally {
      loading = false;
    }
  }

  async function loadDebugRoute(activeRoute: string) {
    cityDataError = '';
    const activeResidentName = residentNameFromDebugRoute(activeRoute);
    const activeBenchmarkRunId = benchmarkRunIdFromDebugRoute(activeRoute);
    const activeObserve = observePartsFromDebugRoute(activeRoute);
    if (activeRoute === '/') {
      overview = await api.overview();
      gatewayStatus = overview.gateway;
    }
    else if (activeRoute === '/residents') {
      [residents, gatewayStatus] = await Promise.all([api.residents(filter), api.gatewayStatus()]);
    }
    else if (activeRoute === '/residents/new') {
      seedSpawnDefaults();
      souls = await api.souls();
    }
    else if (activeResidentName) {
      [selectedRuntime, sessions, gatewayStatus] = await Promise.all([api.runtime(activeResidentName), api.sessions(), api.gatewayStatus()]);
      openRuntimeStream(activeResidentName);
      syncResidentStream(activeResidentName);
    }
    else if (activeRoute === '/observe' || activeRoute.startsWith('/observe/')) {
      const observedResident = activeObserve.kind === 'resident' && activeObserve.id ? decodeURIComponent(activeObserve.id) : '';
      const observedRuntime = observedResident ? api.runtime(observedResident).catch(() => undefined) : Promise.resolve(undefined);
      [subjects, sessions, selectedRuntime, gatewayStatus] = await Promise.all([api.subjects(), api.sessions(), observedRuntime, api.gatewayStatus()]);
      await ensureObserveRouteSession(activeRoute);
      syncObserveStream(activeRoute);
    }
    else if (activeRoute === '/souls') souls = await api.souls();
    else if (activeRoute === '/logs') logs = await api.logs();
    else if (activeRoute === '/benchmarks') [benchmarkRuns, benchmarkLeaderboard] = await Promise.all([api.benchmarks(), api.benchmarkLeaderboard()]);
    else if (activeBenchmarkRunId) [selectedBenchmark, benchmarkRuns, benchmarkLeaderboard] = await Promise.all([api.benchmark(activeBenchmarkRunId), api.benchmarks(), api.benchmarkLeaderboard()]);
    if (!activeResidentName) {
      closeRuntimeStream();
    }
    if (!activeResidentName && !activeRoute.startsWith('/observe/')) closeSessionStream();
  }

  async function loadCityRoute(activeRoute: string) {
    closeRuntimeStream();
    closeSessionStream();
    const routePublicProfileHandle = activeRoute === '/profile' ? publicPatronHandleFromSearch(browserSearch) : '';
    if (isStoryRoute(activeRoute)) {
      closeCityEconomyStream();
      cityStoryDigests = (await cityLoad(api.storytellerDigests(20), { items: [] })).items;
      return;
    }
    if (!cityRouteNeedsSnapshot(activeRoute)) {
      closeCityEconomyStream();
      return;
    }
    await loadCitySnapshot();
    if (sessionLoading) await bootstrapSession();
    if (!citySession.authenticated && cityRouteRequiresLogin(activeRoute)) {
      clearProtectedCityData();
      closeCityEconomyStream();
      return;
    }
    if (cityRouteNeedsStoryDigests(activeRoute)) {
      cityStoryDigests = (await cityLoad(api.storytellerDigests(20), { items: [] })).items;
    }
    if (activeRoute === '/') {
      const [proposalsPayload, printsPayload, inboxPayload, benchmarkPayload, liveEconomyPayload, heartbeatPayload] = await Promise.all([
        cityLoad(cityApi.proposals(), { proposals: [] }),
        citySession.authenticated ? cityLoad(cityApi.prints(), { requests: [] }) : Promise.resolve({ requests: [] }),
        citySession.authenticated ? cityLoad(cityApi.inbox(), { threads: [] }) : Promise.resolve({ threads: [] }),
        cityLoad(api.benchmarks(200), []),
        cityLoad(cityApi.nullcityEconomyLive({ limit: 8, residentLimit: 6 }), { available: false, error: 'not_configured' }),
        cityLoad(cityApi.nullcityEconomyHeartbeat(), { available: false, error: 'not_configured' }),
      ]);
      cityProposals = proposalsPayload.proposals;
      cityPrintRequests = printsPayload.requests;
      cityInboxThreads = inboxPayload.threads;
      cityBenchmarkRuns = benchmarkPayload;
      cityLiveEconomy = liveEconomyPayload;
      cityEconomyHeartbeat = heartbeatPayload;
    }
    if (activeRoute === '/profile') {
      if (routePublicProfileHandle) {
        cityProfileData = undefined;
        cityLedger = [];
        cityPublicPatronProfile = await cityLoad(fetchPublicPatronProfile(routePublicProfileHandle), undefined);
      } else {
        cityPublicPatronProfile = undefined;
        const [profilePayload, ledgerPayload] = await Promise.all([
          cityLoad(cityApi.profile(), undefined),
          cityLoad(cityApi.ledger(cityLedgerFilter === 'all' ? undefined : cityLedgerFilter), { entries: [] }),
        ]);
        cityProfileData = profilePayload?.profile;
        cityLedger = ledgerPayload.entries;
        seedProfileDraft();
      }
    } else {
      cityPublicPatronProfile = undefined;
    }
    if (activeRoute === '/embassy') {
      cityProposals = (await cityLoad(cityApi.proposals(), { proposals: [] })).proposals;
      citySelectedProposal = undefined;
    }
    if (activeRoute === '/economy') {
      const liveEconomyResidentLimit = Math.max(50, (overview?.residents || residents).length);
      const [liveEconomyPayload, heartbeatPayload, listingsPayload] = await Promise.all([
        cityLoad(cityApi.nullcityEconomyLive({ limit: 200, residentLimit: liveEconomyResidentLimit }), { available: false, error: 'not_configured' }),
        cityLoad(cityApi.nullcityEconomyHeartbeat(), { available: false, error: 'not_configured' }),
        citySession.admin
          ? cityLoad(cityApi.adminNullcityEconomyListings(), { available: false, listings: [], error: 'not_configured' })
          : Promise.resolve({ available: false, listings: [], error: 'admin_only' } as NullCityEconomyListingsBridgeResponse),
      ]);
      cityLiveEconomy = liveEconomyPayload;
      cityEconomyHeartbeat = heartbeatPayload;
      cityEconomyListings = listingsPayload;
    }
    if (activeRoute === '/embassy/new') {
      cityProposals = (await cityLoad(cityApi.proposals(), { proposals: [] })).proposals;
      citySelectedProposal = undefined;
      await refreshProposalQuote();
    }
    if (cityProposalId) {
      const [proposalPayload, proposalsPayload] = await Promise.all([
        cityLoad(cityApi.proposal(cityProposalId), undefined),
        cityLoad(cityApi.proposals(), { proposals: [] }),
      ]);
      citySelectedProposal = proposalPayload?.proposal;
      cityProposals = proposalsPayload.proposals;
    }
    if (activeRoute === '/residents' || cityResidentId) {
      const liveEconomyResidentLimit = Math.max(25, (overview?.residents || residents).length);
      const [directoryPayload, benchmarkPayload, liveEconomyPayload] = await Promise.all([
        cityLoad(cityApi.residents(), { residents: [] }),
        cityLoad(api.benchmarks(200), []),
        cityLoad(cityApi.nullcityEconomyLive({ limit: 20, residentLimit: liveEconomyResidentLimit }), { available: false, error: 'not_configured' }),
      ]);
      cityDirectoryResidents = directoryPayload.residents;
      cityBenchmarkRuns = benchmarkPayload;
      cityLiveEconomy = liveEconomyPayload;
      if (activeRoute === '/residents') {
        cityResidentGoalContracts = await loadResidentGoalContracts(residentRowsForCityDirectory(overview?.residents, residents));
      }
    } else if (activeRoute !== '/') {
      cityBenchmarkRuns = [];
      cityResidentGoalContracts = {};
    }
    if (cityResidentId) {
      const cityResidentApiId = resolveResidentRouteId(cityResidentId, overview?.residents || residents);
      const projectedResident = findResidentReadModel(cityDirectoryResidents, cityResidentApiId);
      const [postsPayload, economyPayload] = await Promise.all([
        cityLoad(cityApi.residentPosts(cityResidentApiId), { posts: [] }),
        cityLoad(api.residentEconomy(cityResidentApiId), undefined),
      ]);
      cityResidentReadModel = projectedResident;
      cityResidentPosts = postsPayload.posts;
      cityResidentEconomy = economyPayload;
      cityResidentGoalContracts = {
        ...cityResidentGoalContracts,
        [cityResidentApiId]: residentGoalContractSignal(economyPayload),
      };
    } else {
      cityResidentReadModel = undefined;
      cityResidentPosts = [];
      cityResidentEconomy = undefined;
    }
    if (activeRoute === '/inbox' || cityInboxThreadId) {
      cityInboxThreads = (await cityLoad(cityApi.inbox(), { threads: [] })).threads;
      citySelectedThread = cityInboxThreadId ? await cityLoad(cityApi.inboxThread(cityInboxThreadId), undefined) : undefined;
    }
    if (activeRoute === '/prints' || activeRoute === '/prints/new' || cityPrintId) {
      if (citySession.admin) {
        const [queuePayload, ncriPayload, ncriPrintQueuePayload, storyPayload] = await Promise.all([
          cityLoad(cityApi.adminPrintQueue(), { queue: [] }),
          cityLoad(cityApi.adminNullcityNcri(), { available: false, records: [], error: 'not_configured' }),
          cityLoad(cityApi.adminNullcityNcriPrintQueue({ status: 'all' }), { available: false, items: [], error: 'not_configured' }),
          cityLoad(api.storytellerDigests(6), { items: [] }),
        ]);
        cityPrintQueue = queuePayload.queue;
        cityNullcityNcriRecords = ncriPayload.records;
        cityNullcityNcriPrintQueue = ncriPrintQueuePayload;
        cityStoryDigests = storyPayload.items;
        if (!ncriPayload.available || !ncriPrintQueuePayload.available) {
          cityNullcityBridgeError = ncriPayload.error || ncriPrintQueuePayload.error || cityNullcityBridgeError;
        }
      } else {
        cityNullcityNcriRecords = [];
        cityNullcityNcriPrintQueue = { available: false, items: [], error: 'admin_only' };
        cityStoryDigests = (await cityLoad(api.storytellerDigests(6), { items: [] })).items;
      }
      cityPrintRequests = (await cityLoad(cityApi.prints(), { requests: [] })).requests;
      citySelectedPrint = cityPrintId ? (await cityLoad(cityApi.print(cityPrintId), undefined))?.request : undefined;
    }
    if (activeRoute.startsWith('/admin')) {
      const [printersPayload, queuePayload, proposalsPayload, nullcityPayload, ncriPayload, ncriPrintQueuePayload, printsPayload, ledgerPayload, heartbeatPayload, listingsPayload] = await Promise.all([
        cityLoad(cityApi.adminPrinters(), { printers: [] }),
        cityLoad(cityApi.adminPrintQueue(), { queue: [] }),
        cityLoad(cityApi.proposals(), { proposals: [] }),
        cityLoad(cityApi.adminNullcityProposals(), { available: false, proposals: [], error: 'not_configured' }),
        cityLoad(cityApi.adminNullcityNcri(), { available: false, records: [], error: 'not_configured' }),
        cityLoad(cityApi.adminNullcityNcriPrintQueue({ status: 'all' }), { available: false, items: [], error: 'not_configured' }),
        cityLoad(cityApi.prints(), { requests: [] }),
        cityLoad(cityApi.ledger(), { entries: [] }),
        cityLoad(cityApi.nullcityEconomyHeartbeat(), { available: false, error: 'not_configured' }),
        cityLoad(cityApi.adminNullcityEconomyListings(), { available: false, listings: [], error: 'not_configured' }),
      ]);
      cityPrinters = printersPayload.printers;
      cityPrintQueue = queuePayload.queue;
      cityProposals = proposalsPayload.proposals;
      cityNullcityBridgeAvailable = nullcityPayload.available && ncriPayload.available && ncriPrintQueuePayload.available;
      cityNullcityBridgeError = nullcityPayload.error || ncriPayload.error || ncriPrintQueuePayload.error || '';
      cityNullcityProposals = nullcityPayload.proposals;
      cityNullcityNcriRecords = ncriPayload.records;
      cityNullcityNcriPrintQueue = ncriPrintQueuePayload;
      cityPrintRequests = printsPayload.requests;
      cityLedger = ledgerPayload.entries;
      cityEconomyHeartbeat = heartbeatPayload;
      cityEconomyListings = listingsPayload;
    }
    if (activeRoute === '/library') {
      cityLibraryLives = (await cityLoad(cityApi.library(), { lives: [] })).lives;
    }
    if (activeRoute === '/library') souls = await api.souls().catch(() => []);
    if (citySession.authenticated && cityRouteShowsTrades(activeRoute)) {
      cityTrades = (await cityLoad(cityApi.trades(), { trades: [] })).trades;
    } else if (!citySession.authenticated) {
      cityTrades = [];
    }
    syncCityEconomyStream(activeRoute);
    await refreshInboxNotifications(activeRoute);
  }

  async function refreshInboxNotifications(activeRoute: string) {
    if (!citySession.authenticated || !notificationsEnabled || notificationPermission !== 'granted') return;
    const routeHasInbox = activeRoute === '/' || activeRoute === '/inbox' || activeRoute.startsWith('/inbox/');
    const threads = routeHasInbox ? cityInboxThreads : (await cityLoad(cityApi.inbox(), { threads: [] })).threads;
    await processInboxNotifications(threads);
  }

  async function loadCitySnapshot() {
    const snapshot = await loadCitySnapshotWithLiveFallback({
      overview: api.overview,
      residents: () => api.residents('all'),
      gatewayStatus: api.gatewayStatus,
    });
    overview = snapshot.overview;
    if (snapshot.gatewayStatus) gatewayStatus = snapshot.gatewayStatus;
    residents = snapshot.residents;
    cityDataError = snapshot.error;
  }

  async function loadResidentGoalContracts(rows: ResidentDashboardRow[]): Promise<Record<string, ResidentGoalContractSignal>> {
    const entries = await Promise.all(rows.map(async row => {
      try {
        const economy = await api.residentEconomy(row.name);
        return [row.name, residentGoalContractSignal(economy)] as const;
      } catch {
        return [row.name, residentGoalContractSignal(undefined)] as const;
      }
    }));
    return Object.fromEntries(entries);
  }

  function cityRouteRequiresLogin(activeRoute: string): boolean {
    return isProtectedCityRoute(activeRoute) && !(activeRoute === '/profile' && publicPatronHandleFromSearch(browserSearch));
  }

  function loginUrlIsReady(loginUrl: string): boolean {
    const trimmed = loginUrl.trim();
    if (!trimmed) return false;

    try {
      const url = new URL(trimmed, browserOrigin);
      const path = url.pathname.replace(/\/+$/, '') || '/';
      return !(url.origin === browserOrigin && path === '/login');
    } catch {
      return trimmed !== '/login';
    }
  }

  function cityRouteShowsTrades(activeRoute: string): boolean {
    return activeRoute === '/' ||
      activeRoute === '/profile' ||
      activeRoute === '/inbox' ||
      activeRoute.startsWith('/inbox/') ||
      activeRoute === '/prints' ||
      activeRoute.startsWith('/prints/') ||
      activeRoute.startsWith('/residents/') ||
      activeRoute.startsWith('/admin');
  }

  function clearProtectedCityData() {
    cityProfileData = undefined;
    cityPublicPatronProfile = undefined;
    cityLedger = [];
    cityInboxThreads = [];
    citySelectedThread = undefined;
    cityTrades = [];
    cityPrintRequests = [];
    citySelectedPrint = undefined;
    cityStoryDigests = [];
    cityPrinters = [];
    cityPrintQueue = [];
    cityNullcityNcriRecords = [];
    cityNullcityNcriPrintQueue = { available: false, items: [], error: 'not_loaded' };
  }

  async function cityLoad<T>(promise: Promise<T>, fallback: T): Promise<T>;
  async function cityLoad<T>(promise: Promise<T>, fallback: T | undefined): Promise<T | undefined>;
  async function cityLoad<T>(promise: Promise<T>, fallback: T | undefined): Promise<T | undefined> {
    try {
      return await promise;
    } catch (err) {
      handleCityApiError(err);
      return fallback;
    }
  }

  function handleCityApiError(err: unknown) {
    if (err instanceof CityApiError && err.status === 401) {
      citySession = { ...guestSession, loginUrl: err.loginUrl || citySession.loginUrl || guestSession.loginUrl };
      setCityCsrfToken(undefined);
      cityDataError = '';
      return;
    }
    cityDataError = err instanceof Error ? err.message : 'City API request failed';
  }

  function residentNameFromDebugRoute(activeRoute: string): string {
    const activeParts = activeRoute.split('/').filter(Boolean);
    return activeParts[0] === 'residents' && activeParts[1] && activeParts[1] !== 'new' ? decodeURIComponent(activeParts[1]) : '';
  }

  function benchmarkRunIdFromDebugRoute(activeRoute: string): string {
    const activeParts = activeRoute.split('/').filter(Boolean);
    return activeParts[0] === 'benchmarks' && activeParts[1] ? decodeURIComponent(activeParts[1]) : '';
  }

  function observePartsFromDebugRoute(activeRoute: string): { kind: string; id: string } {
    const activeParts = activeRoute.split('/').filter(Boolean);
    return activeParts[0] === 'observe' ? { kind: activeParts[1] || '', id: activeParts[2] || '' } : { kind: '', id: '' };
  }

  function normalizeCitySession(value: unknown): CitySession {
    const root = asRecord(value);
    const user = asRecord(root.user || root.profile || root.attendee);
    const balances = asRecord(root.balances || root.points || root.wallet);
    const pointBalances = Array.isArray(root.points) ? root.points : Array.isArray(root.balances) ? root.balances : [];
    const roles = arrayStrings(root.roles).concat(arrayStrings(user.roles));
    const authenticated = booleanField(root, 'authenticated') ?? Boolean(Object.keys(user).length || stringField(root, 'userId'));
    const name =
      stringField(user, 'displayName') ||
      stringField(user, 'name') ||
      stringField(root, 'displayName') ||
      stringField(root, 'name') ||
      (authenticated ? 'Onion DAO attendee' : guestSession.name);
    const handle =
      stringField(user, 'handle') ||
      stringField(root, 'handle') ||
      stringField(user, 'username') ||
      stringField(root, 'username') ||
      (authenticated ? 'attendee' : guestSession.handle);
    return {
      authenticated,
      name,
      handle: authenticated && !handle.startsWith('@') ? `@${handle}` : handle,
      email: stringField(user, 'email') || stringField(root, 'email') || '',
      avatarUrl: stringField(user, 'avatarUrl') || stringField(user, 'avatar') || stringField(root, 'avatarUrl') || '',
      ap: pointBalance(pointBalances, 'AP') ?? numberField(balances, 'ap') ?? numberField(balances, 'AP') ?? numberField(root, 'ap') ?? numberField(root, 'AP') ?? 0,
      gp: pointBalance(pointBalances, 'GP') ?? numberField(balances, 'gp') ?? numberField(balances, 'GP') ?? numberField(root, 'gp') ?? numberField(root, 'GP') ?? 0,
      admin:
        booleanField(root, 'admin') ??
        booleanField(root, 'isAdmin') ??
        booleanField(user, 'admin') ??
        booleanField(user, 'isAdmin') ??
        roles.includes('admin'),
      loginUrl: stringField(root, 'loginUrl') || guestSession.loginUrl,
      logoutUrl: stringField(root, 'logoutUrl') || '',
      csrfToken: stringField(root, 'csrfToken') || stringField(root, 'csrf') || '',
      cityUserId: stringField(user, 'id') || stringField(root, 'cityUserId') || '',
    };
  }

  function pointBalance(values: unknown[], resource: 'AP' | 'GP'): number | undefined {
    for (const value of values) {
      const record = asRecord(value);
      if (String(record.resource || '').toUpperCase() === resource) return numberField(record, 'balance') ?? 0;
    }
    return undefined;
  }

  function arrayStrings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  }

  function cityEntryPoints(session: CitySession, rows: ResidentDashboardRow[]): CityEntry[] {
    const online = rows.filter(row => row.online).length;
    const lowAp = rows.filter(row => (row.attention ?? 999) <= 2).length;
    const readyProposals = cityProposals.filter(proposal => proposal.status === 'ready_to_birth').length;
    const activePrints = cityPrintRequests.filter(request => !['completed', 'cancelled', 'refunded'].includes(request.status)).length;
    const unreadThreads = cityInboxThreads.filter(thread => !thread.latestMessage?.readAt).length;
    return [
      {
        label: 'Profile / AP / GP',
        path: '/profile',
        tone: 'gold',
        metric: `${session.ap.toLocaleString()} AP / ${session.gp.toLocaleString()} GP`,
        detail: session.authenticated ? `${session.handle} ledger ready` : 'Sign in to load attendee balances',
      },
      {
        label: 'Enter City',
        path: '/world',
        tone: 'teal',
        metric: gatewayStatus?.connected ? 'gateway online' : 'gateway quiet',
        detail: `${online.toLocaleString()} resident${online === 1 ? '' : 's'} online`,
      },
      {
        label: 'Embassy',
        path: '/embassy',
        tone: 'green',
        metric: `${readyProposals.toLocaleString()} ready`,
        detail: `${cityProposals.length.toLocaleString()} soul proposal${cityProposals.length === 1 ? '' : 's'}`,
      },
      {
        label: 'Residents',
        path: '/residents',
        tone: 'blue',
        metric: rows.length.toLocaleString(),
        detail: `${lowAp.toLocaleString()} need attention`,
      },
      {
        label: 'AP/GP Economy',
        path: '/economy',
        tone: 'teal',
        metric: cityLiveEconomy.snapshot ? `${cityLiveEconomy.snapshot.city.attentionTotal.toLocaleString()} AP` : cityEconomyHeartbeat.available ? 'heartbeat' : 'bridge',
        detail: cityLiveEconomy.snapshot
          ? `${cityLiveEconomy.snapshot.city.activeResidentCount.toLocaleString()} active · GP Δ ${cityLiveEconomy.snapshot.city.gpNetDelta.toLocaleString()}`
          : 'Live point flow and resident economy status',
      },
      {
        label: 'Inbox',
        path: '/inbox',
        tone: 'mauve',
        metric: `${unreadThreads.toLocaleString()} unread`,
        detail: 'Resident conversations and AP requests',
      },
      {
        label: 'Print Queue',
        path: '/prints',
        tone: 'amber',
        metric: `${activePrints.toLocaleString()} active`,
        detail:
          cityPrintInsights.ncriTrades.pending > 0
            ? `${cityPrintInsights.ncriTrades.pending.toLocaleString()} NCRI trade${cityPrintInsights.ncriTrades.pending === 1 ? '' : 's'} pending`
            : 'GP burn and printer queue status',
      },
    ];
  }

  function residentRosterHasLiveHints(): boolean {
    const heartbeat = cityEconomyHeartbeat.heartbeat;
    return Boolean(
      gatewayStatus?.connected ||
      overview?.controller.available ||
      (overview?.controller.residentsWithRuntime || 0) > 0 ||
      (heartbeat?.residentCount || 0) > 0 ||
      cityEconomyHeartbeat.available ||
      cityLiveEconomy.available ||
      cityDataError,
    );
  }

  function residentLoopLine(signal: string, limit = 78): string {
    if (!signal || signal === '-') return '-';
    if (signal.length <= limit) return signal;
    return `${signal.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
  }

  function readinessStatusTone(status: ReleaseReadinessStatus): 'ok' | 'warn' | 'fail' {
    if (status === 'ready') return 'ok';
    if (status === 'blocked') return 'fail';
    return 'warn';
  }

  function cityNavActive(item: CityNavItem): boolean {
    const current = normalizeRoutePath(browserPath);
    return item.path === '/' ? current === '/' : current === item.match || current.startsWith(`${item.match}/`);
  }

  function notificationStatus(): NotificationPermission | 'unsupported' {
    return 'Notification' in window ? Notification.permission : 'unsupported';
  }

  function notificationButtonLabel(): string {
    if (!citySession.authenticated) return 'Login for notifications';
    if (notificationPermission === 'unsupported') return 'Notifications unavailable';
    if (notificationPermission === 'denied') return 'Notifications blocked';
    return notificationsEnabled && notificationPermission === 'granted' ? 'Notifications on' : 'Enable notifications';
  }

  function canRequestInboxNotifications(): boolean {
    return citySession.authenticated && notificationPermission !== 'unsupported' && notificationPermission !== 'denied';
  }

  async function enableInboxNotifications() {
    if (!canRequestInboxNotifications()) return;
    if (notificationPermission !== 'granted') {
      notificationPermission = await Notification.requestPermission();
    }
    if (notificationPermission !== 'granted') return;
    notificationsEnabled = true;
    window.localStorage.setItem(inboxNotificationEnabledKey, 'true');
    await seedInboxNotificationState();
    cityActionNotice = 'Notifications enabled';
  }

  function disableInboxNotifications() {
    notificationsEnabled = false;
    inboxNotificationReady = false;
    window.localStorage.removeItem(inboxNotificationEnabledKey);
    cityActionNotice = 'Notifications disabled';
  }

  async function toggleInboxNotifications() {
    if (notificationsEnabled && notificationPermission === 'granted') {
      disableInboxNotifications();
    } else {
      await enableInboxNotifications();
    }
  }

  async function installPwa() {
    const promptEvent = pwaInstallPrompt;
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => undefined);
    pwaInstallPrompt = undefined;
  }

  async function seedInboxNotificationState() {
    const threads = cityInboxThreads.length ? cityInboxThreads : (await cityLoad(cityApi.inbox(), { threads: [] })).threads;
    saveSeenInboxMessageIds(new Set(threads.map(thread => thread.latestMessage?.id).filter((id): id is string => Boolean(id))));
    inboxNotificationReady = true;
  }

  async function processInboxNotifications(threads: InboxThread[]) {
    let seen = loadSeenInboxMessageIds();
    if (!inboxNotificationReady) {
      if (!seen.size) {
        seen = new Set(threads.map(thread => thread.latestMessage?.id).filter((id): id is string => Boolean(id)));
        saveSeenInboxMessageIds(seen);
        inboxNotificationReady = true;
        return;
      }
      inboxNotificationReady = true;
    }

    const nextSeen = new Set(seen);
    for (const thread of threads) {
      const message = thread.latestMessage;
      if (!message?.id) continue;
      if (message.senderType !== 'resident' || message.readAt || seen.has(message.id)) {
        nextSeen.add(message.id);
        continue;
      }
      await showInboxNotification(thread);
      nextSeen.add(message.id);
    }
    saveSeenInboxMessageIds(nextSeen);
  }

  function loadSeenInboxMessageIds(): Set<string> {
    try {
      const value = JSON.parse(window.localStorage.getItem(inboxNotificationSeenKey()) || '[]');
      return new Set(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function saveSeenInboxMessageIds(ids: Set<string>) {
    const recent = Array.from(ids).slice(-80);
    window.localStorage.setItem(inboxNotificationSeenKey(), JSON.stringify(recent));
  }

  function inboxNotificationSeenKey(): string {
    return `${inboxNotificationSeenKeyPrefix}.${citySession.cityUserId || citySession.email || 'guest'}`;
  }

  async function showInboxNotification(thread: InboxThread) {
    const message = thread.latestMessage;
    if (!message || notificationPermission !== 'granted') return;
    const resident = cityResidentLabelFromId(thread.residentId);
    const url = `/inbox/${encodeURIComponent(thread.id)}`;
    const options: NotificationOptions = {
      body: message.body,
      tag: `nullcity-inbox-${thread.id}`,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      data: { url },
    };
    const registration = await navigator.serviceWorker?.ready.catch(() => undefined);
    if (registration?.showNotification) {
      await registration.showNotification(`${resident} emailed you`, options);
    } else {
      const notification = new Notification(`${resident} emailed you`, options);
      notification.onclick = () => {
        window.focus();
        cityNav(url);
        notification.close();
      };
    }
  }

  function legacyDebugEquivalent(activeRoute: string): string {
    return debugPath(activeRoute);
  }

  function isLegacyOperationalRoute(activeRoute: string): boolean {
    return activeRoute === '/observe' ||
      activeRoute.startsWith('/observe/') ||
      activeRoute === '/benchmarks' ||
      activeRoute.startsWith('/benchmarks/') ||
      activeRoute === '/souls' ||
      activeRoute === '/logs' ||
      activeRoute === '/residents/new';
  }

  function seedSpawnDefaults() {
    if (!spawnX.trim()) spawnX = defaultSpawnX;
    if (!spawnY.trim()) spawnY = defaultSpawnY;
    if (!spawnLevel.trim()) spawnLevel = defaultSpawnLevel;
    if (spawnInferenceDefaultsLoaded) return;
    const saved = loadSpawnInferenceDefaults();
    if (!inferenceEndpoint.trim()) inferenceEndpoint = saved.endpoint || defaultInferenceEndpoint;
    if (!inferenceModel.trim()) inferenceModel = saved.model || '';
    if (!inferenceTemperature.trim()) inferenceTemperature = saved.temperature || defaultInferenceTemperature;
    autonomousSpawn = saved.autonomous ?? true;
    spawnInferenceDefaultsLoaded = true;
  }

  function seedSpawnDraft() {
    seedSpawnDefaults();
    randomizeSpawnName();
    randomizeSpawnModel();
  }

  function randomizeSpawnName() {
    newName = randomResidentName();
  }

  function randomizeSpawnModel() {
    newAppearance = randomAppearance();
  }

  function randomResidentName(): string {
    const prefix = pick(namePrefixes);
    const role = pick(nameRoles);
    const suffix = Math.floor(Math.random() * 90) + 10;
    return `${prefix}${role}${suffix}`;
  }

  function residentSlug(name: string): string {
    return residentRouteSlug(name);
  }

  function residentDisplayName(name: string): string {
    return residentSlug(name);
  }

  function cityDemoApSupportSignal(): CityDemoApSupportSignal | undefined {
    if (!cityResidentDemoPick.residentName) return undefined;
    const row = cityResidents.find(candidate => candidate.name === cityResidentDemoPick.residentName);
    if (!row) return undefined;
    const recommendation = residentApSupportRecommendation(row);
    const suggested = recommendation.suggestedAp > 0;
    return {
      tone: recommendation.tone,
      metric: suggested ? `${recommendation.suggestedAp.toLocaleString()} AP suggested` : `${cityLowAttentionResidents.length.toLocaleString()} AP needs`,
      action: suggested ? 'Open AP grant recommendation' : 'Review AP runway',
      path: `/residents/${encodeURIComponent(residentSlug(row.name))}`,
      detail: `${recommendation.title}. ${recommendation.detail}`,
    };
  }

  function residentIdFromInput(input: string): string {
    const slug = residentSlug(input);
    if (!/^[a-z0-9_]{1,20}$/.test(slug)) throw new Error('Resident names must use 1-20 lowercase letters, numbers, or underscores');
    return `res:${slug}`;
  }

  function randomAppearance(): ResidentAppearance {
    return {
      gender: 0,
      head: pick(appearanceParts.head),
      torso: pick(appearanceParts.torso),
      arms: pick(appearanceParts.arms),
      legs: pick(appearanceParts.legs),
      hands: pick(appearanceParts.hands),
      feet: pick(appearanceParts.feet),
      facialHair: pick(appearanceParts.facialHair),
      hairColor: rand(0, 11),
      torsoColor: rand(0, 15),
      legColor: rand(0, 15),
      feetColor: rand(0, 5),
      skinColor: rand(0, 4),
    };
  }

  function pick<T>(values: T[]): T {
    return values[Math.floor(Math.random() * values.length)] as T;
  }

  function rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async function createResident() {
    await runAction(async () => {
      const name = residentIdFromInput(newName);
      const body: Record<string, unknown> = { name, appearance: newAppearance };
      const x = Number(spawnX);
      const y = Number(spawnY);
      const level = Number(spawnLevel);
      if (Number.isInteger(x) && Number.isInteger(y)) body.spawnPosition = { x, y, level: Number.isInteger(level) ? level : 0 };
      const temperature = Number(inferenceTemperature);
      body.soul = {
        autonomous: autonomousSpawn,
        ...(selectedSoulFile ? { sourceSoulFile: selectedSoulFile } : {}),
        ...(inferenceEndpoint.trim() ? { endpoint: inferenceEndpoint.trim() } : {}),
        ...(inferenceModel.trim() ? { model: inferenceModel.trim() } : {}),
        ...(Number.isFinite(temperature) ? { temperature } : {}),
      };
      saveSpawnInferenceDefaults();
      await api.createResident(body);
      await api.residentCommand(name, 'connect', { observe: true, control: false, onDisconnect: disconnectPolicy });
      debugNav(`/residents/${encodeURIComponent(name)}`);
    });
  }

  function loadSpawnInferenceDefaults(): { endpoint?: string; model?: string; temperature?: string; autonomous?: boolean } {
    try {
      return JSON.parse(window.localStorage.getItem(spawnInferenceStorageKey) || '{}');
    } catch {
      return {};
    }
  }

  function saveSpawnInferenceDefaults() {
    window.localStorage.setItem(
      spawnInferenceStorageKey,
      JSON.stringify({
        endpoint: inferenceEndpoint.trim() || defaultInferenceEndpoint,
        model: inferenceModel.trim(),
        temperature: inferenceTemperature.trim() || defaultInferenceTemperature,
        autonomous: autonomousSpawn,
      }),
    );
  }

  async function logoutResident() {
    if (!residentName) return;
    await runAction(async () => {
      await api.residentCommand(residentName, 'pause', { cause: 'dashboard_logout' });
      await loadRoute();
    });
  }

  async function deleteResident() {
    if (!residentName) return;
    await deleteResidentByName(residentName);
  }

  async function deleteResidentByName(name: string) {
    if (!canDeleteResidents) {
      actionError = 'Resident delete is disabled by the game server. Set agentGateway.allowDelete to true and restart the server to enable it.';
      return;
    }
    if (!confirmDeleteResident(name)) return;
    await runAction(async () => {
      const deletingCurrentResident = residentName.toLowerCase() === name.toLowerCase();
      await api.deleteResident(name);
      if (deletingCurrentResident) {
        debugNav('/residents');
      }
      await loadRoute(false);
    });
  }

  function confirmDeleteResident(name: string): boolean {
    const displayName = residentDisplayName(name);
    const residentId = name.trim().toLowerCase();
    const typed = window.prompt(`Delete ${displayName}? Type "${displayName}" to confirm.`);
    if (typed === null) return false;
    const normalized = typed.trim().toLowerCase();
    const confirmed = normalized === displayName || normalized === residentId;
    if (!confirmed) actionError = `Delete cancelled: typed "${typed.trim()}", expected "${displayName}".`;
    return confirmed;
  }

  async function loginResident() {
    if (!residentName) return;
    await connectResidentSpectator();
  }

  async function observeResident() {
    if (!residentName) return;
    await connectResidentSpectator();
  }

  async function startObserve(subject: ObservableSubjectSummary, mode: SpectatorMode = 'follow') {
    await observeSubject(subject.subject, mode);
  }

  async function observeSubject(subject: SpectatorSubject, mode: SpectatorMode = 'follow') {
    await runAction(async () => openObserveSubject(subject, mode));
  }

  async function openObserveSubject(subject: SpectatorSubject, mode: SpectatorMode = 'follow') {
    const session = await api.observe(subject, mode);
    upsertSession(session);
    activeSession = session;
    debugNav(`/observe/${subjectPath(subject)}`);
    openSessionStream(session);
  }

  async function connectResidentSpectator() {
    perceptionFeedLoadingResident = residentName;
    let openedSession: SpectatorSession | undefined;
    await runAction(async () => {
      await api.residentCommand(residentName, 'connect', { observe: false, control: false, onDisconnect: disconnectPolicy });
      openedSession = await openResidentSpectator();
    });
    if (actionError || !openedSession) perceptionFeedLoadingResident = '';
  }

  async function openResidentSpectator(): Promise<SpectatorSession | undefined> {
    if (!residentName) return undefined;
    const subject: SpectatorSubject = { kind: 'resident', name: residentName };
    const session = await api.observe(subject, 'follow');
    upsertSession(session);
    activeSession = session;
    openSessionStream(session);
    return session;
  }

  function residentIsOnline(): boolean {
    return isResidentOnline(selectedRuntime, activeResidentSession);
  }

  async function ensureObserveRouteSession(activeRoute = route) {
    if (!activeRoute.startsWith('/observe/') || findObserveRouteSession(activeSession, sessions, activeRoute)) return;
    const subject = subjectFromObserveRoute(activeRoute);
    if (!subject) return;
    if (!subjectIsKnownOnline(subject)) return;
    const session = await api.observe(subject, 'follow');
    upsertSession(session);
    activeSession = session;
    openSessionStream(session);
  }

  function subjectFromObserveRoute(activeRoute = route): SpectatorSubject | undefined {
    const activeObserve = observePartsFromDebugRoute(activeRoute);
    if (!activeObserve.kind || !activeObserve.id) return undefined;
    const id = decodeURIComponent(activeObserve.id);
    if (activeObserve.kind === 'resident') return { kind: 'resident', name: id };
    if (activeObserve.kind === 'player') return { kind: 'player', username: id };
    return undefined;
  }

  function findObserveRouteSession(active: SpectatorSession | undefined, available: SpectatorSession[], activeRoute = route): SpectatorSession | undefined {
    const subject = subjectFromObserveRoute(activeRoute);
    if (!subject || !subjectIsKnownOnline(subject)) return undefined;
    return [active, ...available].find(session => session?.connected && subjectMatches(session.subject, subject.kind, subjectId(subject)));
  }

  function findResidentSession(active: SpectatorSession | undefined, available: SpectatorSession[], name: string): SpectatorSession | undefined {
    if (!name) return undefined;
    return [active, ...available].find(session => session?.subject.kind === 'resident' && session.subject.name.toLowerCase() === name.toLowerCase());
  }

  function subjectIsKnownOnline(subject: SpectatorSubject): boolean {
    return subjects.some(candidate => candidate.online && subjectMatches(candidate.subject, subject.kind, subjectId(subject)));
  }

  function subjectId(subject: SpectatorSubject): string {
    return subject.kind === 'resident' ? subject.name : subject.username;
  }

  function subjectMatches(subject: SpectatorSubject, kind: string, id: string): boolean {
    return subject.kind === kind && (subject.kind === 'resident' ? subject.name.toLowerCase() === id.toLowerCase() : subject.username.toLowerCase() === id.toLowerCase());
  }

  function subjectLabel(subject: SpectatorSubject): string {
    return subject.kind === 'resident' ? subject.name : subject.username;
  }

  function subjectPath(subject: SpectatorSubject): string {
    return subject.kind === 'resident' ? `resident/${encodeURIComponent(subject.name)}` : `player/${encodeURIComponent(subject.username)}`;
  }

  function withLiveResidentBody(runtime: RuntimeReadModel | undefined, session: SpectatorSession | undefined): RuntimeReadModel | undefined {
    if (!runtime || !session?.latestPerception) return runtime;
    const sessionTime = timestampMs(session.lastEventAt);
    const runtimeTime = timestampMs(runtime.body.lastFeedAt);
    if (runtime.body.latestPerception && sessionTime !== undefined && runtimeTime !== undefined && sessionTime < runtimeTime) return runtime;
    const lastFeedAt = session.lastEventAt || runtime.body.lastFeedAt;
    const perceptionTick = numberField(session.latestPerception, 'tick') ?? runtime.body.perceptionTick;
    const position = session.position || livePositionFromPerception(session.latestPerception) || runtime.body.position;
    const perceptionAgeMs = ageMsFromTimestamp(lastFeedAt) ?? runtime.body.perceptionAgeMs;
    const body: RuntimeReadModel['body'] = {
      ...runtime.body,
      latestPerception: session.latestPerception,
      gatewayHealthy: runtime.body.gatewayHealthy ?? session.connected,
    };
    if (position) body.position = position;
    if (perceptionTick !== undefined) body.perceptionTick = perceptionTick;
    if (lastFeedAt) body.lastFeedAt = lastFeedAt;
    if (perceptionAgeMs !== undefined) body.perceptionAgeMs = perceptionAgeMs;
    return {
      ...runtime,
      body,
    };
  }

  function livePositionFromPerception(perception: unknown): Position | undefined {
    const root = asRecord(perception);
    return positionFromRecord(asRecord(root.resident).position) || positionFromRecord(root.position);
  }

  function positionFromRecord(value: unknown): Position | undefined {
    const record = asRecord(value);
    const x = numberField(record, 'x');
    const y = numberField(record, 'y');
    if (x === undefined || y === undefined) return undefined;
    return { x, y, level: numberField(record, 'level') ?? 0 };
  }

  function upsertSession(session: SpectatorSession) {
    sessions = [session, ...sessions.filter(candidate => candidate.id !== session.id)];
  }

  function syncObserveStream(activeRoute = route) {
    const session = findObserveRouteSession(activeSession, sessions, activeRoute);
    if (session) openSessionStream(session);
    else closeSessionStream();
  }

  function syncResidentStream(name = residentName) {
    const session = findResidentSession(activeSession, sessions, name);
    if (session) openSessionStream(session);
    else closeSessionStream();
  }

  function openRuntimeStream(name: string) {
    if (runtimeStreamResident.toLowerCase() === name.toLowerCase() && runtimeStream) return;
    closeRuntimeStream();
    runtimeStreamResident = name;
    runtimeStream = api.streamRuntime(name);
    runtimeStream.addEventListener('runtime', event => {
      if (runtimeStreamResident.toLowerCase() !== residentName.toLowerCase()) return;
      selectedRuntime = JSON.parse((event as MessageEvent).data) as RuntimeReadModel;
    });
    runtimeStream.onerror = () => {
      closeRuntimeStream();
    };
  }

  function closeRuntimeStream() {
    runtimeStream?.close();
    runtimeStream = undefined;
    runtimeStreamResident = '';
  }

  function openSessionStream(session: SpectatorSession) {
    if (sessionStreamId === session.id && sessionStream) return;
    closeSessionStream();
    activeSession = session;
    sessionStreamId = session.id;
    sessionStream = api.streamSession(session.id);
    sessionStream.addEventListener('session', event => {
      const session = JSON.parse((event as MessageEvent).data) as SpectatorSession;
      activeSession = session;
      upsertSession(session);
    });
    sessionStream.onerror = () => {
      actionError = 'Spectator stream disconnected; polling will keep the last session visible.';
      closeSessionStream();
    };
  }

  function closeSessionStream() {
    sessionStream?.close();
    sessionStream = undefined;
    sessionStreamId = '';
  }

  function syncCityEconomyStream(activeRoute = route) {
    const streamOptions = cityEconomyStreamOptions(activeRoute);
    if (!streamOptions) {
      closeCityEconomyStream();
      return;
    }
    if (cityEconomyStream && cityEconomyStreamKey === streamOptions.key) return;
    closeCityEconomyStream('connecting');
    cityEconomyStreamKey = streamOptions.key;
    const stream = cityApi.nullcityEconomyStream(streamOptions.query);
    cityEconomyStream = stream;
    cityEconomyStreamTimeout = setTimeout(() => {
      if (cityEconomyStream !== stream) return;
      cityEconomyStreamStatus = economyStreamStatusAfterTimeout(cityEconomyStreamStatus);
    }, 2500);
    stream.addEventListener('economy_snapshot', event => {
      if (cityEconomyStream !== stream) return;
      const snapshot = parseCityEconomyStreamSnapshot((event as MessageEvent).data);
      if (!snapshot) return;
      clearCityEconomyStreamTimeout();
      cityLiveEconomy = { available: true, snapshot: snapshot.live };
      cityEconomyHeartbeat = { available: true, heartbeat: snapshot.heartbeat };
      cityEconomyStreamStatus = 'live';
    });
    stream.onerror = () => {
      if (cityEconomyStream !== stream) return;
      clearCityEconomyStreamTimeout();
      closeCityEconomyStream('fallback');
    };
  }

  function cityEconomyStreamOptions(activeRoute: string): { key: string; query: { limit: number; residentLimit: number } } | undefined {
    if (activeRoute === '/') {
      return { key: 'home:8:6', query: { limit: 8, residentLimit: 6 } };
    }
    if (activeRoute === '/economy') {
      const residentLimit = Math.max(50, (overview?.residents || residents).length);
      return { key: `economy:200:${residentLimit}`, query: { limit: 200, residentLimit } };
    }
    return undefined;
  }

  function closeCityEconomyStream(nextStatus: Extract<EconomyTransportStatus, 'polling' | 'connecting' | 'fallback'> = 'polling') {
    clearCityEconomyStreamTimeout();
    cityEconomyStream?.close();
    cityEconomyStream = undefined;
    cityEconomyStreamKey = '';
    cityEconomyStreamStatus = nextStatus;
  }

  function clearCityEconomyStreamTimeout() {
    if (!cityEconomyStreamTimeout) return;
    clearTimeout(cityEconomyStreamTimeout);
    cityEconomyStreamTimeout = undefined;
  }

  function parseCityEconomyStreamSnapshot(data: string): NullCityLiveEconomyStreamSnapshot | undefined {
    try {
      const payload = JSON.parse(data) as unknown;
      const record = asRecord(payload);
      const heartbeat = asRecord(record.heartbeat);
      const live = asRecord(record.live);
      if (typeof record.asOf === 'string' && typeof heartbeat.asOf === 'string' && typeof live.asOf === 'string') {
        return payload as NullCityLiveEconomyStreamSnapshot;
      }
    } catch {
      // Polling remains active if a malformed SSE frame slips through.
    }
    return undefined;
  }

  function clampSpectatorZoom(value: number): number {
    if (!Number.isFinite(value)) return 1;
    const clamped = Math.min(spectatorZoomMax, Math.max(spectatorZoomMin, value));
    return Math.round(clamped * 100) / 100;
  }

  function openSpectatorModal() {
    spectatorModalOpen = true;
  }

  function closeSpectatorModal() {
    spectatorModalOpen = false;
  }

  function seedProfileDraft() {
    if (!cityProfileData) return;
    profileDisplayName = cityProfileData.displayName || citySession.name;
    profileHandle = cityProfileData.handle || citySession.handle.replace(/^@/, '');
    profileAvatarUrl = cityProfileData.avatarUrl || citySession.avatarUrl;
  }

  async function saveProfile() {
    await runAction(async () => {
      await cityApi.updateProfile({
        displayName: profileDisplayName.trim(),
        handle: profileHandle.trim(),
        avatarUrl: profileAvatarUrl.trim(),
      });
      cityActionNotice = 'Profile saved';
      await bootstrapSession();
      await loadRoute(false);
    });
  }

  async function syncCheckins() {
    await runAction(async () => {
      const result = await cityApi.syncCheckins();
      cityActionNotice = result.message || `Synced ${result.awarded.length} check-in award${result.awarded.length === 1 ? '' : 's'}`;
      await bootstrapSession();
      await loadRoute(false);
    });
  }

  function proposalInput(): SoulProposalInput {
    return {
      residentName: proposalResidentName.trim(),
      displayName: proposalDisplayName.trim() || 'Unnamed soul',
      goal: proposalGoal.trim() || 'Find a place in Null City.',
      personality: proposalPersonality.trim(),
      virtues: proposalVirtues.trim(),
      vices: proposalVices.trim(),
      fears: proposalFears.trim(),
      voice: proposalVoice.trim(),
      firstMemory: proposalFirstMemory.trim(),
      secret: proposalSecret.trim(),
      startingLevels: parseNumberMap(proposalLevels),
      startingEquipment: parseCsvList(proposalEquipment),
      startingInventory: parseCsvList(proposalInventory),
    };
  }

  async function refreshProposalQuote() {
    if (!citySession.authenticated) return;
    const input = proposalInput();
    if (!input.displayName && !input.goal) return;
    cityProposalQuote = await cityLoad(cityApi.quoteSoulProposal(input), undefined);
  }

  async function createSoulProposal() {
    await runAction(async () => {
      const { proposal } = await cityApi.createProposal(proposalInput());
      cityActionNotice = 'Soul proposal submitted';
      cityNav(`/embassy/${encodeURIComponent(proposal.id)}`);
      await bootstrapSession();
      await loadRoute(false);
    });
  }

  async function contributeToSoulProposal(id: string) {
    await runAction(async () => {
      const amount = positiveInt(contributionAp, 'AP contribution');
      const { proposal } = await cityApi.contributeToProposal(id, amount);
      citySelectedProposal = proposal;
      cityActionNotice = `${amount.toLocaleString()} AP contributed`;
      await bootstrapSession();
      await loadRoute(false);
    });
  }

  async function approveNullcityProposal(id: string) {
    await runAction(async () => {
      await cityApi.approveNullcityProposal(id, nullcityProposalNotes(id));
      cityActionNotice = 'Controller proposal approved';
      await loadRoute(false);
    });
  }

  async function rejectNullcityProposal(id: string) {
    await runAction(async () => {
      await cityApi.rejectNullcityProposal(id, nullcityProposalNotes(id));
      cityActionNotice = 'Controller proposal rejected';
      await loadRoute(false);
    });
  }

  async function birthNullcityProposal(id: string) {
    await runAction(async () => {
      await cityApi.birthNullcityProposal(id);
      cityActionNotice = 'Controller proposal birth triggered';
      await loadRoute(false);
    });
  }

  async function grantResidentAttention(residentId: string) {
    await runAction(async () => {
      const apAmount = positiveInt(grantAttentionAp, 'AP grant');
      await cityApi.grantResidentAttention(residentId, {
        apAmount,
        memo: grantAttentionMemo.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      cityActionNotice = `${apAmount.toLocaleString()} AP grant sent`;
      await bootstrapSession();
      await loadRoute(false);
    });
  }

  function applyApSupportSuggestion(recommendation: ResidentApSupportRecommendation) {
    if (recommendation.suggestedAp <= 0) return;
    grantAttentionAp = String(recommendation.suggestedAp);
    grantAttentionMemo = recommendation.suggestedMemo;
    cityActionNotice = `${recommendation.suggestedAp.toLocaleString()} AP support suggestion staged`;
  }

  async function createResidentTradePrompt(residentId: string) {
    await runAction(async () => {
      const offeredAmount = positiveInt(tradeOfferAmount, `${tradeOfferResource} offer`);
      const { trade } = await cityApi.createTrade({
        residentId,
        offeredResource: tradeOfferResource,
        offeredAmount,
        requestedItem: tradeRequestedItem.trim(),
        idempotencyKey: crypto.randomUUID(),
        metadata: { source: 'dashboard', route: browserPath },
      });
      cityActionNotice = `Trade prompt recorded: ${residentTradeSummary(trade).title}`;
      await bootstrapSession();
      await loadRoute(false);
    });
  }

  async function createPrintRequest() {
    await runAction(async () => {
      const { request } = await cityApi.createPrint({
        title: printTitle.trim() || 'Untitled print',
        description: printDescription.trim(),
        requestedMaterial: printMaterial.trim(),
        requestedColor: printColor.trim(),
        quantity: positiveInt(printQuantity, 'Print quantity'),
        userNotes: printUserNotes.trim(),
      });
      if (printFileName.trim()) {
        await cityApi.uploadPrintMetadata(request.id, {
          fileName: printFileName.trim(),
          mime: printFileMime.trim() || 'application/octet-stream',
          sizeBytes: Math.max(0, Number(printFileSize) || 0),
        });
      }
      cityActionNotice = 'Print request created';
      cityNav(`/prints/${encodeURIComponent(request.id)}`);
      await loadRoute(false);
    });
  }

  async function confirmPrintGp(id: string) {
    await runAction(async () => {
      const { request } = await cityApi.confirmPrintGp(id);
      citySelectedPrint = request;
      cityActionNotice = 'GP spend confirmed';
      await bootstrapSession();
      await loadRoute(false);
    });
  }

  async function savePrinter() {
    await runAction(async () => {
      await cityApi.upsertPrinter({
        name: printerName.trim() || 'Unnamed printer',
        kind: printerKind,
        adapter: printerAdapter,
        bridgeId: printerBridgeId.trim(),
        enabled: printerEnabled,
        adminNotes: printerNotes.trim(),
      });
      cityActionNotice = 'Printer saved';
      await loadRoute(false);
    });
  }

  async function testPrinter(id: string) {
    await runAction(async () => {
      const result = await cityApi.testPrinter(id);
      cityActionNotice = `${id}: ${result.status}`;
      await loadRoute(false);
    });
  }

  async function quotePrintRequest(id: string) {
    await runAction(async () => {
      const quoteGp = positiveInt(printQuoteGp, 'GP quote');
      const { request } = await cityApi.quotePrint(id, quoteGp, printQuoteNotes.trim());
      citySelectedPrint = request;
      cityActionNotice = `${quoteGp.toLocaleString()} GP quote saved`;
      await loadRoute(false);
    });
  }

  async function grantPoints() {
    await runAction(async () => {
      const amount = positiveInt(adminGrantAmount, 'Grant amount');
      await cityApi.grantPoints({
        cityUserId: adminGrantCityUserId.trim(),
        resource: adminGrantResource,
        amount,
        memo: adminGrantMemo.trim() || 'Admin grant',
        sourceId: crypto.randomUUID(),
      });
      cityActionNotice = `${amount.toLocaleString()} ${adminGrantResource} granted`;
      await bootstrapSession();
      await loadRoute(false);
    });
  }

  async function exchangeResidentGpForAp() {
    await runAction(async () => {
      const residentId = exchangeResidentId.trim();
      if (!residentId) throw new Error('Resident ID required');
      const apAmount = positiveInt(exchangeApAmount, 'AP amount');
      const gpAmount = positiveInt(exchangeGpAmount, 'GP amount');
      const cityUserId = exchangeCityUserId.trim() || citySession.cityUserId;
      const response = await cityApi.exchangeNullcityApForGp(residentId, {
        idempotencyKey: `dashboard-apgp-${Date.now()}`,
        apAmount,
        gpAmount,
        ...(cityUserId ? { cityUserId } : {}),
        sourceType: 'dashboard_operator',
        sourceId: 'admin-economy-panel',
      });
      exchangeResult = response.exchange;
      cityActionNotice = response.exchange
        ? `${response.exchange.status}: ${gpAmount.toLocaleString()} GP -> ${apAmount.toLocaleString()} AP for ${residentId}`
        : 'AP/GP exchange submitted';
      await loadRoute(false);
    });
  }

  async function startCityGameClient() {
    const mount = gameClientMount;
    if (!mount) return;
    await runAction(async () => {
      await stopCityGameClient();
      gameClientCanvas ??= document.createElement('canvas');
      gameClientController = createGameClient({
        canvas: createDomCanvasAdapter({
          container: mount,
          canvas: gameClientCanvas,
          className: 'city-game-canvas',
          width: 765,
          height: 503,
        }),
        session: createHttpSessionTicketAdapter({ csrfToken: () => citySession.csrfToken }),
        lifecycle: createForkedRuntimeLifecycleAdapter({
          nodeId: 1,
          async loadModule() {
            const runtime = await import('client2');
            return { Client: runtime.Client };
          },
        }),
        config: {
          endpoint: '/rs',
          secure: window.location.protocol === 'https:',
          mode: 'player',
        },
        onStatusChange: status => {
          gameClientStatus = status;
        },
      });
      await gameClientController.start();
      gameClientTicketUser = gameClientController.ticket?.gameUsername || '';
      cityActionNotice = `Game session ready for ${gameClientTicketUser}`;
    });
  }

  async function stopCityGameClient() {
    const controller = gameClientController;
    gameClientController = undefined;
    if (controller) await controller.destroy();
    gameClientStatus = 'stopped';
    gameClientTicketUser = '';
  }

  async function toggleCityGameFullscreen() {
    const mount = gameClientMount;
    if (!mount) return;

    try {
      if (currentFullscreenElement() === mount) {
        await exitFullscreen();
      } else if (cityGameFullscreenFallback) {
        cityGameFullscreenFallback = false;
      } else {
        await requestFullscreen(mount);
      }
    } catch (err) {
      cityGameFullscreenFallback = true;
      actionError = '';
    }
    updateCityGameFullscreenState();
  }

  function updateCityGameFullscreenState() {
    const nativeFullscreen = gameClientMount !== undefined && currentFullscreenElement() === gameClientMount;
    cityGameFullscreen = nativeFullscreen || cityGameFullscreenFallback;
    resizeCityGameClientViewport();
  }

  function currentFullscreenElement(): Element | null {
    const fullscreenDocument = document as FullscreenCapableDocument;
    return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
  }

  async function requestFullscreen(element: HTMLElement) {
    const fullscreenElement = element as FullscreenCapableElement;
    if (element.requestFullscreen) {
      await element.requestFullscreen();
      return;
    }
    if (fullscreenElement.webkitRequestFullscreen) {
      await fullscreenElement.webkitRequestFullscreen();
      return;
    }
    throw new Error('Fullscreen is not supported by this browser.');
  }

  async function exitFullscreen() {
    const fullscreenDocument = document as FullscreenCapableDocument;
    if (document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    if (fullscreenDocument.webkitExitFullscreen) {
      await fullscreenDocument.webkitExitFullscreen();
    }
  }

  function resizeCityGameClientViewport() {
    window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      gameClientMount?.querySelector('canvas')?.focus();
    }, 0);
  }

  function parseNumberMap(value: string): Record<string, number> {
    return Object.fromEntries(
      value
        .split(/[\n,]+/)
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(entry => {
          const [key = '', raw = '1'] = entry.split(/[:=]/);
          return [key.trim(), Math.max(1, Math.floor(Number(raw) || 1))];
        })
        .filter(([key]) => Boolean(key)),
    );
  }

  function parseCsvList(value: string): string[] {
    return value.split(/[\n,]+/).map(entry => entry.trim()).filter(Boolean);
  }

  function positiveInt(value: string, label: string): number {
    const amount = Math.floor(Number(value));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} must be a positive number`);
    return amount;
  }

  function proposalProgress(proposal: SoulProposal): number {
    if (!proposal.attentionThreshold) return 0;
    return Math.min(100, Math.round((proposal.contributedAttention / proposal.attentionThreshold) * 100));
  }

  function proposalRemaining(proposal: SoulProposal): number {
    return Math.max(0, proposal.attentionThreshold - proposal.contributedAttention);
  }

  function nullcityProposalProgress(proposal: NullCitySoulProposal): number {
    if (!proposal.apThreshold) return 0;
    return Math.min(100, Math.round((proposal.apFunded / proposal.apThreshold) * 100));
  }

  function nullcityProposalRemaining(proposal: NullCitySoulProposal): number {
    return Math.max(0, proposal.apThreshold - proposal.apFunded);
  }

  function nullcityProposalNotes(id: string): string {
    return (nullcityProposalAdminNotes[id] || '').trim();
  }

  function setNullcityProposalNotes(id: string, value: string) {
    nullcityProposalAdminNotes = { ...nullcityProposalAdminNotes, [id]: value };
  }

  function canRejectNullcityProposal(status: NullCitySoulProposal['status']): boolean {
    return status === 'proposed' || status === 'funding' || status === 'threshold_crossed';
  }

  function statusTone(status: string): string {
    if (['ready_to_birth', 'threshold_crossed', 'paid', 'approved', 'born', 'queued', 'printing', 'completed', 'alive'].includes(status)) return 'ok';
    if (['failed', 'cancelled', 'refunded', 'rejected', 'expired', 'deceased'].includes(status)) return 'fail';
    return 'warn';
  }

  function cityResidentLabelFromId(id: string): string {
    const record = cityDirectoryResidents.find(row => row.id === id || row.nullcityResidentId === id);
    const live = cityResidents.find(row => row.name === id || residentSlug(row.name) === residentSlug(id));
    return record?.displayName || (live ? residentDisplayName(live.name) : id);
  }

  function tradesForResident(id: string | undefined, trades: ResidentTrade[]): ResidentTrade[] {
    if (!id) return [];
    const slug = residentSlug(id);
    return trades.filter(trade => trade.residentId === id || residentSlug(trade.residentId) === slug);
  }

  function selectedCityResidentDisplay(): string {
    return cityResidentReadModel?.displayName || (cityResident ? residentDisplayName(cityResident.name) : cityResidentId);
  }

  function ledgerDelta(entry: PointLedgerEntry): string {
    const sign = entry.delta > 0 ? '+' : '';
    return `${sign}${entry.delta.toLocaleString()} ${entry.resource}`;
  }

  function activePrintCount(): number {
    return cityPrintRequests.filter(request => !['completed', 'cancelled', 'refunded'].includes(request.status)).length;
  }

  function ncriApprovalCount(status: NullCityNcriRecord['approvalStatus']): number {
    return cityNullcityNcriRecords.filter(record => record.approvalStatus === status).length;
  }

  function ncriRedemptionCount(status: NullCityNcriRecord['redemptionStatus']): number {
    return cityNullcityNcriRecords.filter(record => record.redemptionStatus === status).length;
  }

  function ncriPrintQueueCount(status: NullCityNcriPrintQueueEntry['status']): number {
    return cityNullcityNcriPrintQueue.items.filter(item => item.status === status).length;
  }

  function ncriPrintQueuePrintableCount(): number {
    return cityNullcityNcriPrintQueue.items.filter(item => item.printable).length;
  }

  function ncriPrintQueueTone(item: NullCityNcriPrintQueueEntry): string {
    return item.status === 'redeemed' ? 'ok' : 'warn';
  }

  function ncriPrintQueueStatusLabel(item: NullCityNcriPrintQueueEntry): string {
    return item.status === 'awaiting_redemption' ? 'awaiting' : 'redeemed';
  }

  function ncriPrintQueueMeta(item: NullCityNcriPrintQueueEntry): string {
    const gp = typeof item.gpRedemptionCost === 'number' ? `${item.gpRedemptionCost.toLocaleString()} GP` : 'GP open';
    const source = item.sourceResidentName ? ` · ${item.sourceResidentName}` : '';
    return `item ${item.itemId} · ${item.cityUserId}${source} · ${gp} · ${timeAgo(item.updatedAt)}`;
  }

  function ncriTone(record: NullCityNcriRecord): string {
    if (record.redemptionStatus === 'redeemed') return 'warn';
    return record.approvalStatus === 'approved' ? 'ok' : 'warn';
  }

  function ncriStatusLabel(record: NullCityNcriRecord): string {
    return record.redemptionStatus === 'redeemed' ? 'redeemed' : record.approvalStatus;
  }

  async function runAction(fn: () => Promise<void>) {
    actionBusy = true;
    actionError = '';
    try {
      await fn();
    } catch (err) {
      if (err instanceof CityApiError && err.status === 401) {
        handleCityApiError(err);
        actionError = 'Login required for this action.';
      } else {
        actionError = err instanceof Error ? err.message : 'Action failed';
      }
    } finally {
      actionBusy = false;
    }
  }

  function spectatorFrame(node: HTMLElement, params: { session: SpectatorSession | undefined; filters: SpectatorDisplayFilters }) {
    const bridge = new NullCitySpectatorBridge(node);
    bridge.setFilters(params.filters);
    bridge.setSession(params.session);
    return {
      update(next: { session: SpectatorSession | undefined; filters: SpectatorDisplayFilters }) {
        bridge.setFilters(next.filters);
        bridge.setSession(next.session);
      },
      destroy() {
        bridge.destroy();
      },
    };
  }

  type BodyModel = RuntimeReadModel['body'];
  type BodyRow = { key: string; label: string; value: unknown };
  type SparkActivityItem = { label: string; value: string; detail: string | undefined };

  const bodyFieldOrder = [
    'feed',
    'gatewayHealthy',
    'controlHeld',
    'controllerId',
    'position',
    'perceptionTick',
    'perceptionAgeMs',
    'lastFeedAt',
    'lastAction',
    'lastActionSource',
    'latestEvent',
    'latestPerception',
  ];

  function bodyRows(body: BodyModel | undefined): BodyRow[] {
    const record = asRecord(body);
    const known = bodyFieldOrder.filter(key => key in record);
    const extra = Object.keys(record).filter(key => !bodyFieldOrder.includes(key)).sort((a, b) => a.localeCompare(b));
    return [...known, ...extra].map(key => ({ key, label: labelize(key), value: record[key] }));
  }

  function labelize(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());
  }

  function bodyValue(key: string, value: unknown): string {
    if (value === undefined || value === null || value === '') return '-';
    if (key === 'gatewayHealthy') return value === true ? 'healthy' : 'offline';
    if (key === 'controlHeld') return value === true ? 'held' : 'free';
    if (key === 'position') return formatPosition(value);
    if (key === 'feed') return feedSummary(value);
    if (key === 'perceptionAgeMs') return formatDuration(Number(value));
    if (key === 'lastFeedAt') return `${timeAgo(String(value))} ago`;
    if (key === 'lastAction') return actionSummary(value);
    if (key === 'latestEvent') return eventSummary(value);
    if (key === 'latestPerception') return perceptionSummary(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number' || typeof value === 'string') return String(value);
    return inlineObject(value);
  }

  function formatPosition(value: unknown): string {
    const position = asRecord(value);
    const x = numberField(position, 'x');
    const y = numberField(position, 'y');
    const level = numberField(position, 'level') ?? 0;
    return x === undefined || y === undefined ? '-' : `${x}, ${y}, ${level}`;
  }

  function actionSummary(value: unknown): string {
    const action = asRecord(value);
    const parts = [
      stringField(action, 'kind'),
      stringField(action, 'source') ? `source ${stringField(action, 'source')}` : '',
      stringField(action, 'result') ? `result ${stringField(action, 'result')}` : '',
      numberField(action, 'tick') !== undefined ? `tick ${numberField(action, 'tick')}` : '',
      stringField(action, 'cause'),
    ].filter(Boolean);
    return parts.join(' | ') || inlineObject(value);
  }

  function eventSummary(value: unknown): string {
    const event = asRecord(value);
    const kind = stringField(event, 'kind') || 'event';
    const text = stringField(event, 'text') || stringField(event, 'message');
    return text ? `${kind}: ${text}` : inlineObject(value);
  }

  function perceptionSummary(value: unknown): string {
    const perception = asRecord(value);
    const nearby = asRecord(perception.nearby);
    const resident = asRecord(perception.resident);
    const parts = [
      numberField(perception, 'tick') !== undefined ? `tick ${numberField(perception, 'tick')}` : '',
      formatPosition(resident.position || perception.position) !== '-' ? `pos ${formatPosition(resident.position || perception.position)}` : '',
      `players ${arrayCount(nearby.players)}`,
      `npcs ${arrayCount(nearby.npcs)}`,
      `objects ${arrayCount(nearby.objects)}`,
      `items ${arrayCount(nearby.worldItems)}`,
      `actions ${arrayCount(perception.availableActions)}`,
      `events ${arrayCount(perception.events)}`,
    ].filter(Boolean);
    return parts.join(' | ') || inlineObject(value);
  }

  function feedSummary(value: unknown): string {
    const feed = asRecord(value);
    const nearby = asRecord(feed.nearby);
    const parts = [
      numberField(feed, 'tick') !== undefined ? `tick ${numberField(feed, 'tick')}` : '',
      numberField(feed, 'ageMs') !== undefined ? `${formatDuration(Number(feed.ageMs))} ago` : '',
      formatPosition(feed.position) !== '-' ? `pos ${formatPosition(feed.position)}` : '',
      asRecord(feed.hp).current !== undefined ? `hp ${asRecord(feed.hp).current}/${asRecord(feed.hp).max}` : '',
      `players ${numberField(nearby, 'players') ?? 0}`,
      `npcs ${numberField(nearby, 'npcs') ?? 0}`,
      `objects ${numberField(nearby, 'objects') ?? 0}`,
      `items ${numberField(nearby, 'worldItems') ?? 0}`,
      `actions ${numberField(feed, 'availableActions') ?? 0}`,
      `events ${numberField(feed, 'events') ?? 0}`,
    ].filter(Boolean);
    return parts.join(' | ') || '-';
  }

  function residentFeedLabel(row: ResidentDashboardRow): string {
    if (!row.feed) return row.online ? 'awaiting feed' : '-';
    const parts = [
      row.feed.tick !== undefined ? `tick ${row.feed.tick}` : '',
      row.feed.ageMs !== undefined ? `${formatDuration(row.feed.ageMs)} ago` : '',
      row.feed.attached ? 'attached' : '',
    ].filter(Boolean);
    return parts.join(' | ') || '-';
  }

  function residentStoryArcLabel(row: ResidentDashboardRow): string {
    return row.storyArc ? `arc: ${row.storyArc.phase}` : '-';
  }

  function residentStoryArcDetail(row: ResidentDashboardRow): string {
    const arc = row.storyArc;
    if (!arc) return '';
    const evidence = arc.evidence;
    const latest =
      arc.latestEventKind && arc.latestEventTick !== undefined
        ? `${arc.latestEventKind} @ ${arc.latestEventTick}`
        : arc.latestEventKind || '';
    const counts = evidence
      ? [
          evidence.fundingEvents > 0 ? `${evidence.fundingEvents} funded` : '',
          evidence.progressEvents > 0 ? `${evidence.progressEvents} progress` : '',
          evidence.resolutionEvents > 0 ? `${evidence.resolutionEvents} resolved` : '',
          evidence.letterEvents > 0 ? `${evidence.letterEvents} letters` : '',
        ].filter(Boolean).join(' | ')
      : '';
    return [latest, counts].filter(Boolean).join(' | ') || arc.summary || '';
  }

  function residentSurroundingsLabel(row: ResidentDashboardRow): string {
    const nearby = row.feed?.nearby;
    if (!nearby) return '-';
    return `p ${nearby.players} | n ${nearby.npcs} | o ${nearby.objects} | i ${nearby.worldItems}`;
  }

  function residentVitalsLabel(row: ResidentDashboardRow): string {
    const hp = row.hp;
    const flags = [row.inCombat ? 'combat' : '', row.busy ? 'busy' : ''].filter(Boolean);
    const hpLabel = hp ? `hp ${hp.current}/${hp.max}` : '';
    return [hpLabel, ...flags].filter(Boolean).join(' | ') || '-';
  }

  function residentStackLabel(row: ResidentDashboardRow): string {
    const stack = row.stack;
    const model = stack?.model?.endpoint || stack?.model?.model || stack?.brain?.endpoint || stack?.brain?.model || stack?.body?.endpoint || stack?.body?.model;
    const module = stack?.activeModule || row.spark?.activeModule || stack?.configuredModules?.[0];
    const moduleLabel = module ? `${module.id}${module.version ? `@${module.version}` : ''}` : '';
    return [model, moduleLabel].filter(Boolean).join(' | ') || '-';
  }

  function residentStackDetail(row: ResidentDashboardRow): string {
    const stack = row.stack;
    const module = stack?.activeModule || row.spark?.activeModule || stack?.configuredModules?.[0];
    const parts = [
      stack?.soulTitle || stack?.soulId,
      stack?.model?.model,
      stack?.model?.thinking !== undefined ? `model thinking ${stack.model.thinking ? 'on' : 'off'}` : '',
      stack?.behaviorKind,
      module?.source ? `module ${module.source}` : '',
    ].filter(Boolean);
    return parts.join(' | ');
  }

  function residentActiveModule(row: ResidentDashboardRow | undefined) {
    return row?.stack?.activeModule || row?.spark?.activeModule || row?.stack?.configuredModules?.[0] || row?.spark?.modules?.[0];
  }

  function residentModelProfileLabel(row: ResidentDashboardRow | undefined): string {
    const profile = row?.stack?.model || row?.stack?.brain || row?.stack?.body;
    return profile?.model || stringField(row?.thinking?.latestInference, 'model') || '-';
  }

  function residentEndpointLabel(row: ResidentDashboardRow | undefined): string {
    const profile = row?.stack?.model || row?.stack?.brain || row?.stack?.body;
    return profile?.endpoint || stringField(row?.thinking?.latestInference, 'endpoint') || stringField(row?.thinking?.latestInference, 'provider') || '-';
  }

  function residentSparkLabel(row: ResidentDashboardRow | undefined): string {
    const module = residentActiveModule(row);
    return module ? `${module.id}${module.version ? `@${module.version}` : ''}` : '-';
  }

  function residentSparkDetail(row: ResidentDashboardRow | undefined): string {
    const module = residentActiveModule(row);
    return module?.source || '-';
  }

  function residentPlanLabel(row: ResidentDashboardRow | undefined): string {
    return row?.thinking?.activePlan || 'No active plan published';
  }

  function residentActionLabel(row: ResidentDashboardRow | undefined): string {
    if (!row) return '-';
    const action = row.body?.lastAction;
    if (!action) return row.lastEvent?.kind || '-';
    return [action.kind, action.result, action.source].filter(Boolean).join(' | ') || '-';
  }

  function residentSpeechLabel(row: ResidentDashboardRow | undefined): string {
    if (!row) return '-';
    if (row.feed?.latestEventKind === 'say' && row.feed.latestEventText) return row.feed.latestEventText;
    if (row.lastEvent?.kind === 'say' && row.lastEvent.text) return row.lastEvent.text;
    return cityResidentPosts[0]?.body || row.lastEvent?.text || '-';
  }

  function residentLibraryStrategyLabel(row: ResidentDashboardRow | undefined): string {
    if (!row) return '-';
    return row.storyArc?.summary || residentStoryArcDetail(row) || row.storyArc?.phase || '-';
  }

  function printResidentSignalTone(signal: PrintResidentSignal): 'ok' | 'warn' | 'fail' {
    return printResidentProofSignal(signal, cityBenchmarkRuns).tone;
  }

  function printResidentSignalLabel(signal: PrintResidentSignal): string {
    const row = signal.resident;
    const id = row?.name || signal.residentId;
    const apLabel = row?.attention === undefined ? 'AP unknown' : `${row.attention} AP`;
    const planLabel = residentPlanLabel(row);
    return `${residentDisplayName(id)} · ${apLabel} · ${planLabel}`;
  }

  function printResidentSignalDetail(signal: PrintResidentSignal): string {
    const row = signal.resident;
    const stack = [residentModelProfileLabel(row), residentEndpointLabel(row), residentSparkLabel(row)]
      .filter(value => value && value !== '-')
      .join(' | ');
    const activity = [residentActionLabel(row), residentSpeechLabel(row)]
      .filter(value => value && value !== '-')
      .join(' · ');
    const sourceLabel = signal.sources.map(source => source === 'ncri_trade' ? 'ncri trade' : 'registry').join(' + ') || 'ncri';
    const ageLabel = signal.latestAt ? timeAgo(signal.latestAt) : 'undated';
    return [sourceLabel, stack || 'model/endpoint/SPARK unavailable', activity || 'no recent action/speech', ageLabel].join(' · ');
  }

  function printResidentSignalProof(signal: PrintResidentSignal): { tone: 'ok' | 'warn' | 'fail'; summary: string; detail: string } {
    return printResidentProofSignal(signal, cityBenchmarkRuns);
  }

  function residentBenchmarkLabel(row: ResidentDashboardRow | undefined): { tone: 'ok' | 'warn' | 'fail'; summary: string; detail: string } {
    if (!row) return residentBenchmarkSignal(undefined);
    return residentBenchmarkSignal(latestBenchmarkForResident(cityBenchmarkRuns, row.name));
  }

  function storytellerEventTone(event: StorytellerDigestEventSummary): string {
    if (event.importance === 'high') return 'ok';
    if (event.importance === 'medium') return 'warn';
    if (event.importance === 'minimal') return '';
    return '';
  }

  function storytellerEventTitle(event: StorytellerDigestEventSummary): string {
    return labelize(event.kind.replace(/[_-]+/g, ' '))
      .replace(/\bAp\b/gi, 'AP')
      .replace(/\bGp\b/gi, 'GP')
      .replace(/\bNcri\b/gi, 'NCRI');
  }

  function storytellerEventMeta(event: StorytellerDigestEventSummary): string {
    return [event.residentName, event.ts ? timeAgo(event.ts) : undefined].filter(Boolean).join(' | ') || 'grounded event';
  }

  function residentHealthTone(row: ResidentDashboardRow): string {
    const status = residentHealthSummary(row).status;
    if (status === 'stuck') return 'fail';
    if (status === 'stale') return 'warn';
    if (status === 'active-inference' || status === 'online') return 'ok';
    return '';
  }

  function residentHealthLabel(row: ResidentDashboardRow): string {
    return residentHealthSummary(row).label;
  }

  function residentHealthDetail(row: ResidentDashboardRow): string {
    return residentHealthSummary(row).detail;
  }

  function thinkingActivity(runtime: RuntimeReadModel | undefined, activity: ReturnType<typeof buildActivitySnapshot>): SparkActivityItem[] {
    const state = asRecord(runtime?.state);
    const cognition = asRecord(state.cognition);
    const goal = asRecord(cognition.activeGoal);
    const inference = runtime?.thinking.latestInference;
    return [
      { label: 'Controller', value: runtime?.state ? 'runtime active' : runtime?.online ? 'waiting for runtime' : 'offline', detail: runtime?.state ? undefined : 'controller has not written runtime-state yet' },
      { label: 'Mode', value: runtime?.thinking.mode || 'unknown', detail: runtime?.thinking.lastInferenceCause || undefined },
      { label: 'Thought', value: activity.inferenceLabel, detail: activity.inferenceAgeLabel },
      { label: 'Goal', value: stringField(goal, 'description') || activity.goalLabel, detail: goalDetail(goal) },
      { label: 'Move Intent', value: activity.moveLabel, detail: activity.moveDetail },
      { label: 'Resources', value: activity.attentionLabel, detail: budgetLabel(runtime) },
      { label: 'SPARK Module', value: activity.moduleLabel, detail: activity.moduleDetail },
      { label: 'Configured Model', value: activity.modelLabel, detail: activity.modelDetail },
      { label: 'Inference', value: inferenceStatus(inference), detail: inferenceProvider(inference) },
      { label: 'Previous Intent', value: previousIntentLabel(runtime), detail: previousIntentDetail(runtime) },
    ];
  }

  function nervousActivity(runtime: RuntimeReadModel | undefined): SparkActivityItem[] {
    const nervous = runtime?.nervous;
    return [
      { label: 'Rules', value: nervous?.activeRules === undefined ? '-' : `${nervous.activeRules} active`, detail: cooldownLabel(nervous?.cooldowns) },
      { label: 'Last Reaction', value: nervous?.lastReaction || 'none', detail: nervous?.lastRuleId ? `rule ${nervous.lastRuleId}` : undefined },
      { label: 'Thinking Gate', value: nervous?.lastSuppressedThinking ? 'suppressed' : 'open', detail: nervous?.lastInterruptedThinking ? 'interrupted thinking' : undefined },
      { label: 'Low-Level State', value: hookStateLabel(runtime), detail: shadowedHooksLabel(runtime) },
    ];
  }

  function bodyActivity(runtime: RuntimeReadModel | undefined, activity: ReturnType<typeof buildActivitySnapshot>): SparkActivityItem[] {
    const perception = asRecord(runtime?.body.latestPerception);
    const resident = asRecord(perception.resident);
    const activeTrade = asRecord(resident.activeTrade);
    return [
      { label: 'Feed', value: activity.feedLabel, detail: runtime?.body.gatewayHealthy ? 'gateway healthy' : undefined },
      { label: 'Position', value: activity.positionLabel, detail: residentBusyLabel(runtime) },
      { label: 'Vitals', value: vitalsFromRuntime(runtime), detail: activeTrade.partner ? 'trade active' : undefined },
      { label: 'Last Action', value: activity.actionLabel, detail: activity.actionDetail },
      { label: 'Last Result', value: activity.actionResultLabel, detail: activity.actionResultDetail },
      { label: 'Progress', value: activity.progressLabel, detail: activity.progressDetail },
      { label: 'Nearby', value: activity.surroundingsLabel, detail: actionCountLabel(runtime) },
      { label: 'Inventory', value: inventoryLabel(runtime), detail: equipmentLabel(runtime) },
      { label: 'Event', value: activity.eventLabel, detail: runtime?.body.lastFeedAt ? `feed ${timeAgo(runtime.body.lastFeedAt)} ago` : undefined },
    ];
  }

  function goalDetail(goal: Record<string, unknown>): string {
    const steps = Array.isArray(goal.steps) ? goal.steps.length : 0;
    const success = stringField(goal, 'success');
    const ttl = numberField(goal, 'ttlTicks');
    return [steps ? `${steps} steps` : '', success, ttl !== undefined ? `ttl ${ttl}` : ''].filter(Boolean).join(' | ') || '-';
  }

  function budgetLabel(runtime: RuntimeReadModel | undefined): string {
    const budgets = runtime?.state?.budgets;
    if (!budgets) return '-';
    const parts = [
      `${budgets.requestsThisMinute}/m`,
      `${budgets.requestsToday}/d`,
      budgets.requestsThisTick !== undefined ? `${budgets.requestsThisTick}/tick` : '',
      budgets.noInferenceUntil ? `blocked until ${timeAgo(budgets.noInferenceUntil)}` : '',
    ].filter(Boolean);
    return parts.join(' | ');
  }

  function inferenceStatus(inference: unknown): string {
    const record = asRecord(inference);
    return stringField(record, 'status') || stringField(record, 'cause') || '-';
  }

  function inferenceProvider(inference: unknown): string {
    const record = asRecord(inference);
    const parts = [
      stringField(record, 'provider'),
      stringField(record, 'model'),
      stringField(record, 'endpoint'),
      numberField(record, 'latencyMs') !== undefined ? `${numberField(record, 'latencyMs')}ms` : '',
    ].filter(Boolean);
    return parts.join(' | ') || '-';
  }

  function previousIntentLabel(runtime: RuntimeReadModel | undefined): string {
    const intent = asRecord(runtime?.thinking.previousIntent || runtime?.state?.previousIntent);
    return stringField(intent, 'goal') || stringField(intent, 'description') || stringField(intent, 'kind') || (Object.keys(intent).length ? 'recorded' : '-');
  }

  function previousIntentDetail(runtime: RuntimeReadModel | undefined): string {
    const intent = asRecord(runtime?.thinking.previousIntent || runtime?.state?.previousIntent);
    return Object.keys(intent).length ? inlineObject(intent) : '-';
  }

  function cooldownLabel(cooldowns: Record<string, number> | undefined): string {
    const entries = Object.entries(cooldowns || {});
    if (!entries.length) return 'no cooldowns';
    return entries.slice(0, 3).map(([key, value]) => `${key.replace(/^nervous:/, '')} ${value}`).join(' | ');
  }

  function hookStateLabel(runtime: RuntimeReadModel | undefined): string {
    const state = runtime?.state;
    const variables = Object.keys(state?.variables || {}).length;
    const cooldowns = Object.keys(state?.hookCooldowns || {}).length;
    return `${variables} vars | ${cooldowns} cooldowns`;
  }

  function shadowedHooksLabel(runtime: RuntimeReadModel | undefined): string {
    const count = runtime?.state?.shadowedHooks?.length || 0;
    return count ? `${count} shadowed hooks` : '-';
  }

  function residentBusyLabel(runtime: RuntimeReadModel | undefined): string {
    const perception = asRecord(runtime?.body.latestPerception);
    const resident = asRecord(perception.resident);
    return [
      booleanField(resident, 'busy') ? 'busy' : '',
      booleanField(resident, 'inCombat') ? 'in combat' : '',
    ].filter(Boolean).join(' | ') || '-';
  }

  function vitalsFromRuntime(runtime: RuntimeReadModel | undefined): string {
    const feed = runtime?.body.feed;
    if (!feed?.hp) return '-';
    return `hp ${feed.hp.current}/${feed.hp.max}`;
  }

  function actionCountLabel(runtime: RuntimeReadModel | undefined): string {
    const feed = runtime?.body.feed;
    return feed ? `${feed.availableActions} available actions` : '-';
  }

  function inventoryLabel(runtime: RuntimeReadModel | undefined): string {
    const resident = asRecord(asRecord(runtime?.body.latestPerception).resident);
    const inventory = Array.isArray(resident.inventory) ? resident.inventory : [];
    const occupied = inventory.filter(Boolean).length;
    return inventory.length ? `${occupied}/${inventory.length} slots` : '-';
  }

  function equipmentLabel(runtime: RuntimeReadModel | undefined): string {
    const resident = asRecord(asRecord(runtime?.body.latestPerception).resident);
    const equipment = Array.isArray(resident.equipment) ? resident.equipment : [];
    const occupied = equipment.filter(Boolean).length;
    return equipment.length ? `${occupied} equipped` : '-';
  }

  type ItemRef = { itemId: number; key?: string; amount?: number; noted?: boolean };
  type SkillRow = { key: string; label: string; level: number; xp: number };
  type ItemSlot = { slot: number; item: ItemRef | null };
  type ResidentModelAppearance = { gender: 'M' | 'F'; parts: number[]; colors: number[] };

  function residentRecord(runtime: RuntimeReadModel | undefined): Record<string, unknown> {
    return asRecord(asRecord(runtime?.body.latestPerception).resident);
  }

  function savedRecord(runtime: RuntimeReadModel | undefined): Record<string, unknown> {
    return asRecord(runtime?.body.saved);
  }

  function residentArray(runtime: RuntimeReadModel | undefined, key: 'inventory' | 'equipment'): unknown[] {
    const live = residentRecord(runtime)[key];
    if (Array.isArray(live)) return live;
    const saved = savedRecord(runtime)[key];
    return Array.isArray(saved) ? saved : [];
  }

  function skillRows(runtime: RuntimeReadModel | undefined): SkillRow[] {
    const liveSkills = asRecord(residentRecord(runtime).skills);
    const savedSkills = asRecord(savedRecord(runtime).skills);
    const skills = Object.keys(liveSkills).length ? liveSkills : savedSkills;
    const rows = Object.entries(skills).map(([key, value]) => {
      const record = asRecord(value);
      return {
        key,
        label: labelize(key),
        level: numberField(record, 'level') ?? 0,
        xp: numberField(record, 'xp') ?? numberField(record, 'exp') ?? 0,
      };
    });
    return rows.sort((a, b) => {
      const ai = skillOrder.indexOf(a.key);
      const bi = skillOrder.indexOf(b.key);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.label.localeCompare(b.label);
    });
  }

  function inventorySlots(runtime: RuntimeReadModel | undefined): ItemSlot[] {
    return itemSlots(residentArray(runtime, 'inventory'), 28);
  }

  function equipmentSlots(runtime: RuntimeReadModel | undefined): ItemSlot[] {
    return itemSlots(residentArray(runtime, 'equipment'), 14);
  }

  function equipmentSlot(runtime: RuntimeReadModel | undefined, slot: number): ItemSlot {
    return equipmentSlots(runtime).find(entry => entry.slot === slot) || { slot, item: null };
  }

  function itemSlots(value: unknown, size: number): ItemSlot[] {
    const source = Array.isArray(value) ? value : [];
    return Array.from({ length: Math.max(size, source.length) }, (_, slot) => ({
      slot,
      item: normalizeItem(source[slot]),
    }));
  }

  function normalizeItem(value: unknown): ItemRef | null {
    const record = asRecord(value);
    const itemId = numberField(record, 'itemId');
    if (itemId === undefined) return null;
    const item: ItemRef = { itemId };
    const key = stringField(record, 'key');
    const amount = numberField(record, 'amount');
    const noted = booleanField(record, 'noted');
    if (key) item.key = key;
    if (amount !== undefined) item.amount = amount;
    if (noted !== undefined) item.noted = noted;
    return item;
  }

  function itemLabel(item: ItemRef | null): string {
    if (!item) return '';
    return item.key ? item.key.replace(/^rs:/, '').replace(/_/g, ' ') : `item ${item.itemId}`;
  }

  function itemShortLabel(item: ItemRef | null): string {
    if (!item) return '';
    const label = itemLabel(item);
    const words = label.split(/\s+/).filter(Boolean);
    if (words.length >= 2) return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
    return label.slice(0, 2).toUpperCase();
  }

  function itemSlotTitle(slot: ItemSlot): string {
    if (!slot.item) return `Slot ${slot.slot + 1}: empty`;
    const amount = slot.item.amount && slot.item.amount > 1 ? ` x${slot.item.amount}` : '';
    return `Slot ${slot.slot + 1}: ${itemLabel(slot.item)}${amount}`;
  }

  function itemIconStyle(item: ItemRef | null): string {
    if (!item) return '';
    const hue = (item.itemId * 47) % 360;
    return `--item-hue: ${hue}`;
  }

  function buildResidentAppearance(runtime: RuntimeReadModel | undefined): ResidentModelAppearance | undefined {
    const equipment = equipmentSlots(runtime);
    const equippedItemId = (slot: number): number | undefined => equipment.find(entry => entry.slot === slot)?.item?.itemId;
    const savedAppearance = asRecord(savedRecord(runtime).appearance);
    const gender: 'M' | 'F' = numberField(savedAppearance, 'gender') === 1 ? 'F' : 'M';
    const parts = new Array<number>(12).fill(0);
    const basePartIds = [
      numberField(savedAppearance, 'head'),
      numberField(savedAppearance, 'facialHair'),
      numberField(savedAppearance, 'torso'),
      numberField(savedAppearance, 'arms'),
      numberField(savedAppearance, 'hands'),
      numberField(savedAppearance, 'legs'),
      numberField(savedAppearance, 'feet'),
    ];
    for (let designerPart = 0; designerPart < basePartMap.length; designerPart++) {
      const savedId = basePartIds[designerPart];
      const fallbackId = defaultIdkIdsByGender[gender][designerPart];
      const idkId = savedId ?? fallbackId;
      const slot = basePartMap[designerPart];
      if (idkId !== undefined && slot !== undefined && idkId >= 0 && !(gender === 'F' && slot === 11)) {
        parts[slot] = idkId + 256;
      }
    }

    const head = equippedItemId(0);
    const cape = equippedItemId(1);
    const neck = equippedItemId(2);
    const weapon = equippedItemId(3);
    const torsoItem = equippedItemId(4);
    const offHand = equippedItemId(5);
    const legsItem = equippedItemId(7);
    const handsItem = equippedItemId(9);
    const feetItem = equippedItemId(10);

    if (head !== undefined) parts[0] = head + 512;
    if (cape !== undefined) parts[1] = cape + 512;
    if (neck !== undefined) parts[2] = neck + 512;
    if (weapon !== undefined) parts[3] = weapon + 512;
    if (torsoItem !== undefined) parts[4] = torsoItem + 512;
    if (offHand !== undefined) parts[5] = offHand + 512;
    if (legsItem !== undefined) parts[7] = legsItem + 512;
    if (handsItem !== undefined) parts[9] = handsItem + 512;
    if (feetItem !== undefined) parts[10] = feetItem + 512;

    return {
      gender,
      parts,
      colors: [
        numberField(savedAppearance, 'hairColor') ?? 0,
        numberField(savedAppearance, 'torsoColor') ?? 0,
        numberField(savedAppearance, 'legColor') ?? 0,
        numberField(savedAppearance, 'feetColor') ?? 0,
        numberField(savedAppearance, 'skinColor') ?? 0,
      ],
    };
  }

  async function loadStatsModel(appearance: ResidentModelAppearance | undefined, key: string): Promise<void> {
    if (!appearance) {
      statsModelBytes = null;
      statsModelStatus = '';
      statsModelKey = '';
      return;
    }
    statsModelKey = key;
    statsModelStatus = 'loading';
    try {
      statsModelBytes = await api.composeResidentModel(appearance);
      statsModelStatus = '';
    } catch (err) {
      statsModelBytes = null;
      statsModelStatus = err instanceof Error ? err.message : 'model compose failed';
    }
  }

  function booleanField(value: unknown, key: string): boolean | undefined {
    const field = asRecord(value)[key];
    return typeof field === 'boolean' ? field : undefined;
  }

  function formatDuration(value: number | undefined): string {
    if (!Number.isFinite(value)) return '-';
    const seconds = Math.max(0, Math.round((value || 0) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds) return `${minutes}m ${remainingSeconds}s`;
    if (minutes < 60) return `${minutes}m`;
    return `${Math.round(minutes / 60)}h`;
  }

  function ageMsFromTimestamp(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? Math.max(0, Date.now() - time) : undefined;
  }

  function timestampMs(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : undefined;
  }

  function inlineObject(value: unknown): string {
    if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
    const record = asRecord(value);
    const entries = Object.entries(record);
    if (!entries.length) return '-';
    return entries.map(([key, entry]) => `${labelize(key)} ${inlinePrimitive(entry)}`).join(' | ');
  }

  function inlinePrimitive(value: unknown): string {
    if (value === undefined || value === null || value === '') return '-';
    if (Array.isArray(value)) return `${value.length}`;
    if (typeof value === 'object') return '{...}';
    return String(value);
  }

  function arrayCount(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
  }

  function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  function stringField(value: unknown, key: string): string | undefined {
    const field = asRecord(value)[key];
    return typeof field === 'string' ? field : undefined;
  }

  function numberField(value: unknown, key: string): number | undefined {
    const field = asRecord(value)[key];
    const number = Number(field);
    return Number.isFinite(number) ? number : undefined;
  }

  function formatScore(score: number | undefined): string {
    return Number.isFinite(score) ? `${Math.round((score || 0) * 100)}%` : '-';
  }

  function formatRate(rate: number | undefined): string {
    return Number.isFinite(rate) ? `${Math.round((rate || 0) * 100)}%` : '-';
  }

  function benchmarkStatusLabel(status: string | undefined): string {
    return status || 'unknown';
  }

  function metricRows(metrics: Record<string, number> | undefined): Array<{ key: string; value: number }> {
    return Object.entries(metrics || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key, value }));
  }

  function compactMetricValue(value: number): string {
    return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  }

  function benchmarkStartedLabel(run: BenchmarkArtifactSummary | BenchmarkArtifact | undefined): string {
    return run?.startedAt ? timeAgo(run.startedAt) : '-';
  }

  function benchmarkLatestLabel(run: BenchmarkLeaderboardRow | undefined): string {
    return run?.latestRunAt ? timeAgo(run.latestRunAt) : '-';
  }

  function letterTimeLabel(letter: RecentLetterSummary): string {
    return letter.dispatchedAt ? timeAgo(letter.dispatchedAt) : 'undated';
  }

  function letterResidentLabel(letter: RecentLetterSummary): string {
    return letter.senderResident ? residentDisplayName(letter.senderResident) : 'city';
  }

  function letterDeliveryLabel(letter: RecentLetterSummary): string {
    return letter.deliveryChannels.length ? letter.deliveryChannels.join(', ') : 'delivery unknown';
  }

  function residentMemoryFilePath(runtime: RuntimeReadModel | undefined): string | undefined {
    return runtime?.memory.files.find(file => file === 'INDEX.md') || runtime?.memory.files[0];
  }

  function residentLastActionLabel(runtime: RuntimeReadModel | undefined): string {
    const latestLog = asRecord(runtime?.logs.actions.at(-1));
    return runtime?.body.lastAction?.kind || stringField(latestLog, 'kind') || stringField(latestLog, 'action') || '-';
  }

  function patronBestStanding(patron: PatronDashboardSummary): PatronStandingSummary | undefined {
    return [...patron.standing].sort((a, b) => patronStandingRank(b.tier) - patronStandingRank(a.tier) || b.points - a.points)[0];
  }

  function patronStandingRank(tier: string | undefined): number {
    if (tier === 'officer') return 3;
    if (tier === 'ally') return 2;
    if (tier === 'acquaintance') return 1;
    return 0;
  }

  function patronStandingLabel(patron: PatronDashboardSummary): string {
    const standing = patronBestStanding(patron);
    if (!standing) return 'no standing yet';
    const next = standing.pointsToNext !== undefined && standing.nextTier ? ` · ${standing.pointsToNext} to ${standing.nextTier}` : '';
    return `${standing.points.toLocaleString()} pts @ ${standing.faction}${next}`;
  }

  function patronLastActivityLabel(patron: PatronDashboardSummary): string {
    return patron.lastActivityAt ? timeAgo(patron.lastActivityAt) : 'no activity';
  }

  function patronTierCount(summary: PatronActivitySummary | undefined, tier: 'ally' | 'officer'): number {
    return summary?.tierCounts[tier] || 0;
  }

  function relationshipActivityLabel(row: ResidentRelationshipSummary): string {
    const patronLabel = `${row.patrons.toLocaleString()} patron${row.patrons === 1 ? '' : 's'}`;
    const patronEventLabel = `${row.patronEvents.toLocaleString()} patron event${row.patronEvents === 1 ? '' : 's'}`;
    const peerLabel = `${row.peerRelationships.toLocaleString()} peer tie${row.peerRelationships === 1 ? '' : 's'}`;
    const interactionLabel = `${row.peerInteractions.toLocaleString()} interaction${row.peerInteractions === 1 ? '' : 's'}`;
    return `${patronLabel} · ${patronEventLabel} · ${peerLabel} · ${interactionLabel} · ${relationshipLatestLabel(row)}`;
  }

  function relationshipLatestLabel(row: ResidentRelationshipSummary): string {
    const kind = relationshipKindLabel(row.latestEventKind);
    if (row.latestEventAt) return `${kind} ${timeAgo(row.latestEventAt)}`;
    if (row.latestEventTick !== undefined) return `${kind} at tick ${row.latestEventTick}`;
    return 'no recent relationship moment';
  }

  function relationshipKindLabel(kind: string | undefined): string {
    return labelize((kind || 'relationship').replace(/[_-]+/g, ' '));
  }

  function relationshipTag(row: ResidentRelationshipSummary): string {
    if (row.patronEvents > 0 && row.peerEvents > 0) return 'mixed';
    if (row.patronEvents > 0) return 'patron';
    return 'peer';
  }

  function readinessLabel(level: ReadinessLevel | undefined): string {
    if (level === 'ok') return 'ready';
    if (level === 'fail') return 'blocked';
    return 'needs attention';
  }

  function readinessClass(level: ReadinessLevel | undefined): string {
    if (level === 'ok') return 'ok';
    if (level === 'fail') return 'fail';
    return 'warn';
  }

  function soulTitle(soul: SoulSummary): string {
    return soul.title || soul.id;
  }
</script>

<svelte:head>
  <title>{isDebugRoute ? 'Null City Resident Operations' : 'Null City Dashboard'}</title>
</svelte:head>

{#if isDebugRoute}
<nav class="topbar">
  <button class="brand" onclick={() => debugNav('/')}>Null City Ops</button>
  <div class="navlinks">
    <a class="main-dashboard-link" href="/" aria-label="Back to main dashboard">Main Dashboard</a>
    <button class:active={route === '/'} onclick={() => debugNav('/')}>Overview</button>
    <button class:active={route.startsWith('/residents')} onclick={() => debugNav('/residents')}>Residents</button>
    <button class:active={route.startsWith('/observe')} onclick={() => debugNav('/observe')}>Observe</button>
    <button class:active={route.startsWith('/benchmarks')} onclick={() => debugNav('/benchmarks')}>Benchmarks</button>
    <button class:active={route === '/souls'} onclick={() => debugNav('/souls')}>Souls</button>
    <button class:active={route === '/logs'} onclick={() => debugNav('/logs')}>Logs</button>
    <details class="event-menu">
      <summary class:active={embassyPageActive}>Embassy</summary>
      <div class="event-menu-list" aria-label="Embassy pages">
        {#each embassyPages as page (page.path)}
          <a class:active={browserPath === page.path || browserPath === page.path.replace(/\/$/, '')} href={page.path}>{page.label}</a>
        {/each}
      </div>
    </details>
  </div>
</nav>

<main>
  <div class="point-line" aria-hidden="true">
    <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
  </div>

  {#if error || actionError}
    <div class="notice rose">{error || actionError}</div>
  {/if}
  {#if loading}
    <div class="notice">Loading dashboard state</div>
  {/if}

  {#if route === '/'}
    <section class="page-head">
      <p class="kicker">Resident Operations</p>
      <h1>Dashboard</h1>
    </section>
    <section class="metrics">
      <div class="metric"><span>Gateway</span><strong class:ok={overview?.gateway.connected}>{overview?.gateway.connected ? 'connected' : 'offline'}</strong></div>
      <div class="metric"><span>Controller</span><strong class:ok={overview?.controller.available}>{overview?.controller.available ? 'available' : 'quiet'}</strong></div>
      <div class="metric"><span>Online</span><strong>{overview?.residents.filter(r => r.online).length || 0}</strong></div>
      <div class="metric"><span>Runtime</span><strong>{overview?.controller.residentsWithRuntime || 0}</strong></div>
    </section>
    {@render EventReadinessPanel({ readiness: overview?.readiness })}
    {@render PatronSummaryPanel({ summary: overview?.patrons })}
    {@render RelationshipSummaryPanel({ summary: overview?.relationships })}
    {@render ResidentHealthToolbar({ shown: visibleResidents.length, total: rawVisibleResidents.length })}
    {@render ResidentTable({ rows: visibleResidents, canDelete: canDeleteResidents, onselect: debugNav, ondelete: deleteResidentByName })}
    <section class="panel">
      <div class="panel-title">Recent Events</div>
      {@render EventList({ events: overview?.recentEvents || [] })}
    </section>
    <section class="panel">
      <div class="panel-title">Patron Letters</div>
      {@render LetterList({ letters: overview?.recentLetters || [] })}
    </section>
  {:else if route === '/residents'}
    <section class="toolbar">
      <div>
        <p class="kicker">Resident Roster</p>
        <h1>Residents</h1>
      </div>
      <div class="actions">
        <select bind:value={filter} onchange={() => loadRoute()}>
          <option value="all">all</option>
          <option value="online">online</option>
          <option value="offline">offline</option>
        </select>
        <button class="primary" onclick={() => debugNav('/residents/new')}>Spawn Resident</button>
      </div>
    </section>
    {@render ResidentHealthToolbar({ shown: visibleResidents.length, total: rawVisibleResidents.length })}
    {@render ResidentTable({ rows: visibleResidents, canDelete: canDeleteResidents, onselect: debugNav, ondelete: deleteResidentByName })}
  {:else if route === '/residents/new'}
    <section class="page-head compact">
      <p class="kicker">Lifecycle</p>
      <h1>Spawn Resident</h1>
    </section>
    <section class="form-grid spawn-form">
      <div class="spawn-name-field">
        <label>Resident name <input bind:value={newName} placeholder="resident_name" /></label>
        <button class="icon-button" disabled={actionBusy} aria-label="Randomize name" title="Randomize name" onclick={randomizeSpawnName}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
        </button>
      </div>
      <div class="spawn-model-card" aria-live="polite">
        <span>M:</span>
        <div class="model-code-fields">
          <label>H<input type="number" min="0" step="1" bind:value={newAppearance.head} /></label>
          <label>T<input type="number" min="0" step="1" bind:value={newAppearance.torso} /></label>
          <label>L<input type="number" min="0" step="1" bind:value={newAppearance.legs} /></label>
          <label>F<input type="number" min="0" step="1" bind:value={newAppearance.feet} /></label>
        </div>
      </div>
      <button class="icon-button" disabled={actionBusy} aria-label="Randomize model" title="Randomize model" onclick={randomizeSpawnModel}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>
      </button>
      <label>X <input bind:value={spawnX} inputmode="numeric" placeholder={defaultSpawnX} /></label>
      <label>Y <input bind:value={spawnY} inputmode="numeric" placeholder={defaultSpawnY} /></label>
      <label>Level <input bind:value={spawnLevel} inputmode="numeric" placeholder={defaultSpawnLevel} /></label>
      <label>Soul file
        <select bind:value={selectedSoulFile}>
          <option value="">Generated living soul</option>
          {#each souls as soul}
            <option value={soul.file}>{soulTitle(soul)}</option>
          {/each}
        </select>
      </label>
      <label>Inference endpoint <input bind:value={inferenceEndpoint} placeholder={defaultInferenceEndpoint} /></label>
      <label>Inference model <input bind:value={inferenceModel} placeholder="endpoint default" /></label>
      <label>Temperature <input type="number" min="0" max="2" step="0.05" bind:value={inferenceTemperature} /></label>
      <label>Disconnect policy <select bind:value={disconnectPolicy}><option value="idle">idle</option><option value="logout">logout</option></select></label>
      <label class="checkbox-field"><input type="checkbox" bind:checked={autonomousSpawn} /> Autonomy</label>
      <button class="primary" disabled={actionBusy} onclick={createResident}>Create</button>
    </section>
    {@render SoulGrid({ souls })}
  {:else if residentName}
    <section class="toolbar">
      <div>
        <p class="kicker">Resident Detail</p>
        <h1>{residentDisplayName(residentName)}</h1>
      </div>
      <div class="actions">
        {#if residentIsOnline()}
          <button disabled={actionBusy} class="danger" onclick={logoutResident}>Logout</button>
        {:else}
          <button disabled={actionBusy} class="primary" onclick={loginResident}>Login</button>
          {#if canDeleteResidents}
            <button disabled={actionBusy} class="danger" onclick={deleteResident}>Delete</button>
          {/if}
        {/if}
      </div>
    </section>
    {@render ResidentBrowseStrip({ name: residentName, runtime: liveSelectedRuntime })}
    <section class="split">
      <div class="panel observer-pane">
        <div class="panel-title">Spectator</div>
        {@render SpectatorSurface({ large: false })}
        {@render SpectatorControls()}
      </div>
      <div class="panel">
        <div class="panel-title">Body</div>
        {@render BodyTable({ body: liveSelectedRuntime?.body })}
      </div>
    </section>
    <EconomyPanel resident={residentName} />
    {@render ActivityPanel({ activity: buildActivitySnapshot(liveSelectedRuntime, activeResidentSession), runtime: liveSelectedRuntime })}
    <section class="modules">
      {@render LogPanel({ title: 'Actions', rows: selectedRuntime?.logs.actions || [] })}
      {@render LogPanel({ title: 'Thinking Inference', rows: selectedRuntime?.logs.inference || [] })}
    </section>
  {:else if route === '/observe'}
    <section class="page-head compact">
      <p class="kicker">Read Only</p>
      <h1>Observe</h1>
    </section>
    <section class="subject-grid">
      {#each subjects as subject}
        <article class="card">
          <div class="row">
            <strong>{subjectLabel(subject.subject)}</strong>
            <span class:ok={subject.online} class="tag">{subject.online ? 'online' : 'offline'}</span>
          </div>
          <p>{subject.position ? formatPosition(subject.position) : 'position unknown'}</p>
          <div class="actions">
            <button disabled={actionBusy || !subject.online} onclick={() => startObserve(subject, 'follow')}>Follow</button>
            <button disabled={actionBusy || !subject.online} onclick={() => startObserve(subject, 'free-camera')}>Free Camera</button>
          </div>
        </article>
      {:else}
        <div class="empty">No observable subjects reported</div>
      {/each}
    </section>
  {:else if route.startsWith('/observe/')}
    {@const session = activeObserveSession}
    <section class="toolbar">
      <div>
        <p class="kicker">Spectator Session</p>
        <h1>{session ? subjectLabel(session.subject) : 'Subject unavailable'}</h1>
      </div>
      <button onclick={() => debugNav('/observe')}>Subjects</button>
    </section>
    {#if session?.subject.kind === 'resident'}
      {@render ActivityPanel({ activity: buildActivitySnapshot(withLiveResidentBody(selectedRuntime, session), session), runtime: selectedRuntime })}
    {/if}
    <section class="split wide">
      <div class="panel observer-pane large">
        <div class="panel-title">Spectator</div>
        <div class="observer-surface large">
          <div class="spectator-frame" use:spectatorFrame={{ session, filters: spectatorFilters }} aria-label="spectator"></div>
        </div>
        {@render SpectatorControls()}
      </div>
      <div class="panel">
        <div class="panel-title">Perception</div>
        <div class="mini-grid observer-summary">
          <span>{perceptionSummary(session?.latestPerception)}</span>
        </div>
        <pre>{compactJson(session?.latestPerception)}</pre>
      </div>
    </section>
  {:else if route === '/benchmarks'}
    <section class="page-head compact">
      <p class="kicker">Module Proof</p>
      <h1>Benchmarks</h1>
    </section>
    {@render BenchmarkLeaderboard({ rows: benchmarkLeaderboard })}
    {@render BenchmarkTable({ runs: benchmarkRuns })}
  {:else if benchmarkRunId}
    <section class="toolbar">
      <div>
        <p class="kicker">Benchmark Detail</p>
        <h1>{selectedBenchmark?.task.id || benchmarkRunId}</h1>
      </div>
      <button onclick={() => debugNav('/benchmarks')}>Runs</button>
    </section>
    {@render BenchmarkLeaderboard({ rows: benchmarkLeaderboard })}
    {@render BenchmarkDetail({ artifact: selectedBenchmark })}
  {:else if route === '/souls'}
    <section class="page-head compact">
      <p class="kicker">Read Only</p>
      <h1>Souls</h1>
    </section>
    {@render SoulGrid({ souls })}
  {:else if route === '/logs'}
    <section class="page-head compact">
      <p class="kicker">Timeline</p>
      <h1>Logs</h1>
    </section>
    <section class="modules">
      {@render LogPanel({ title: 'Actions', rows: logs.actions })}
      {@render LogPanel({ title: 'Thinking Inference', rows: logs.inference })}
    </section>
  {/if}
</main>

{#if spectatorModalOpen}
  <div class="modal-backdrop">
    <div class="spectator-modal" role="dialog" aria-modal="true" aria-label="Expanded spectator">
      <div class="spectator-modal-head">
        <div class="panel-title">Spectator</div>
        <button class="icon-button" aria-label="Close expanded spectator" title="Close expanded spectator" onclick={closeSpectatorModal}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      {@render SpectatorSurface({ large: true })}
      {@render SpectatorControls()}
    </div>
  </div>
{/if}
{:else}
  {@render CityShell()}
{/if}

{#snippet CityShell()}
  <div class="city-shell">
    <aside class="city-rail" aria-label="City navigation">
      <button class="city-brand" onclick={() => cityNav('/')}>
        <span class="city-mark" aria-hidden="true"></span>
        <span>
          <strong>Null City</strong>
          <small>Onion DAO console</small>
        </span>
      </button>
      <div class="city-session-chip" class:guest={!citySession.authenticated}>
        <span>{sessionLoading ? 'Syncing session' : citySession.name}</span>
        <strong>{citySession.authenticated ? citySession.handle : 'Guest access'}</strong>
      </div>
      <div class="city-pwa-panel">
        <button disabled={!canRequestInboxNotifications()} class:active={notificationsEnabled && notificationPermission === 'granted'} onclick={toggleInboxNotifications}>
          {notificationButtonLabel()}
        </button>
        {#if pwaInstallPrompt && !appInstalled}
          <button onclick={installPwa}>Install App</button>
        {/if}
      </div>
      <div class="city-nav">
        {#each cityNavItems as item (item.path)}
          <button class:active={cityNavActive(item)} onclick={() => cityNav(item.path)}>
            <span aria-hidden="true">{item.glyph}</span>
            {item.label}
          </button>
        {/each}
      </div>
      <div class="city-nav secondary">
        {#if citySession.admin}
          <button class:active={route.startsWith('/admin')} onclick={() => cityNav('/admin')}>AD Admin</button>
          <button onclick={() => debugNav('/')}>Debug</button>
        {/if}
      </div>
    </aside>

    <main class="city-main">
      <div class="point-line city-points" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
      </div>

      {#if cityDataError}
        <div class="notice city-notice">{cityDataNoticeCopy(cityDataError)}</div>
      {/if}
      {#if actionError}
        <div class="notice rose">{actionError}</div>
      {/if}
      {#if cityActionNotice}
        <div class="notice">{cityActionNotice}</div>
      {/if}
      {#if loading}
        <div class="notice">Loading city state</div>
      {/if}

      {#if route === '/'}
        {@render CityOverview()}
      {:else if route === '/profile'}
        {@render CityProfile()}
      {:else if route === '/world'}
        {@render CityWorld()}
      {:else if route === '/story' || route.startsWith('/story/')}
        {@render CityStory()}
      {:else if route === '/economy'}
        {@render CityEconomy()}
      {:else if route === '/embassy' || route === '/embassy/new' || route.startsWith('/embassy/')}
        {@render CityEmbassy()}
      {:else if route === '/residents'}
        {@render CityResidents()}
      {:else if cityResidentId}
        {@render CityResidentProfile()}
      {:else if route === '/inbox' || route.startsWith('/inbox/')}
        {@render CityInbox()}
      {:else if route === '/prints' || route.startsWith('/prints/')}
        {@render CityPrints()}
      {:else if route === '/library'}
        {@render CityLibrary()}
      {:else if route === '/admin' || route.startsWith('/admin/')}
        {@render CityAdmin()}
      {:else if route === '/login'}
        {@render CityLogin()}
      {:else}
        {@render CityNotFound()}
      {/if}
    </main>

    <nav class="city-bottom-nav" aria-label="Primary city navigation">
      {#each cityNavItems as item (item.path)}
        <button class:active={cityNavActive(item)} onclick={() => cityNav(item.path)}>
          <span aria-hidden="true">{item.glyph}</span>
          {item.label}
        </button>
      {/each}
    </nav>
  </div>
{/snippet}

{#snippet CityOverview()}
  <section class="city-hero-band">
    <div>
      <p class="kicker">City Dashboard</p>
      <h1>Null City</h1>
      <p class="city-lede">Resident signal, attendee ledger, Embassy proposals, inbox, and print queue in one console.</p>
    </div>
    <div class="city-ledger-strip">
      <span><small>AP</small><strong>{citySession.ap.toLocaleString()}</strong></span>
      <span><small>GP</small><strong>{citySession.gp.toLocaleString()}</strong></span>
      <span><small>Session</small><strong>{citySession.authenticated ? citySession.handle : 'guest'}</strong></span>
    </div>
  </section>

  {#if !citySession.authenticated}
    <section class="city-auth-band">
      <div>
        <p class="kicker">Attendee Session</p>
        <strong>Guest mode</strong>
        <span>Public residents and the Library are visible. Sign in as an attendee to unlock AP, GP, inbox, Embassy actions, and prints.</span>
      </div>
      <button class="primary" onclick={() => cityNav('/login')}>Login</button>
    </section>
  {/if}

  {#if citySession.admin}
    <section class="city-admin-strip">
      <strong>Admin alerts</strong>
      <span>{cityLowAttentionResidents.length} residents need attention · print queue idle · economy audit quiet</span>
      <button onclick={() => cityNav('/admin')}>Open Admin</button>
    </section>
  {/if}

  <section class="city-panel city-demo-path-panel">
    <div class="row">
      <div>
        <div class="panel-title">Monday Demo Path</div>
        <strong>Show the city alive, funded, responsive, and narrated.</strong>
      </div>
      <span class="tag ok">4 stops</span>
    </div>
    <div class="city-demo-path-grid">
      {#each cityDemoPath as step, index (step.id)}
        <button class={`city-demo-step tone-${step.tone}`} onclick={() => cityNav(step.path)}>
          <span class={`tag ${step.tone}`}>{index + 1}</span>
          <span class="city-demo-step-copy">
            <small>{step.label}</small>
            <strong>{step.metric}</strong>
            <span>{step.action}</span>
            <em>{step.detail}</em>
          </span>
        </button>
      {/each}
    </div>
  </section>

  {@render ResidentTriageStrip({ limit: 4 })}

  <section class="city-entry-grid">
    {#each cityEntries as entry (entry.path)}
      <button class={`city-entry tone-${entry.tone}`} onclick={() => cityNav(entry.path)}>
        <span>{entry.label}</span>
        <strong>{entry.metric}</strong>
        <small>{entry.detail}</small>
      </button>
    {/each}
  </section>

  <section class={`city-panel city-readiness-panel tone-${readinessStatusTone(cityReleaseReadiness.status)}`}>
    <div class="row">
      <div>
        <div class="panel-title">Operator Readiness</div>
        <strong>{cityReleaseReadiness.headline}</strong>
        <small>{cityReleaseReadiness.detail}</small>
      </div>
      <span class={`tag ${readinessStatusTone(cityReleaseReadiness.status)}`}>{cityReleaseReadiness.status}</span>
    </div>
    <div class="city-resident-profile-grid city-readiness-metrics">
      {#each releaseReadinessMetricTiles(cityReleaseReadiness) as metric (metric.label)}
        <span title={metric.detail} aria-label={metric.detail ? `${metric.label}: ${metric.value}. ${metric.detail}` : undefined}>
          <small>{metric.label}</small><strong class={metric.tone || ''}>{metric.value}</strong>
        </span>
      {/each}
    </div>
    <div class="city-record-list compact">
      {#each releaseReadinessDemoProofRail(cityReleaseReadiness) as proof (proof.label)}
        <article>
          <span class={`tag ${proof.tone}`}>{proof.label}</span>
          <div>
            <strong>{proof.detail}</strong>
            <small>Demo proof</small>
          </div>
        </article>
      {/each}
    </div>
    <div class="city-record-list compact">
      {#each releaseReadinessFirstFiveSteps(cityReleaseReadiness) as step (step.label)}
        <article>
          <span class={`tag ${step.tone}`}>{step.label}</span>
          <div>
            <strong>{step.detail}</strong>
            <small>First five minutes</small>
          </div>
        </article>
      {/each}
    </div>
    {#if cityReleaseReadinessActions.length > 0}
      <div class="city-record-list compact">
        {#each cityReleaseReadinessActions as action (action.detail)}
          <article>
            <span class={`tag ${action.tone}`}>{action.label}</span>
            <div class="city-readiness-action-copy">
              <strong>{action.detail}</strong>
              <small>Readiness queue · {action.destinationLabel}</small>
              <button class="city-readiness-action-link" type="button" onclick={() => cityNav(action.path)}>
                Open {action.destination}
              </button>
            </div>
          </article>
        {/each}
      </div>
    {/if}
    <div class="city-record-list compact">
      {#each cityReleaseReadiness.checks as check (check.id)}
        <article>
          <span class={`tag ${check.tone}`}>{check.tone}</span>
          <div>
            <strong>{check.label}: {check.value}</strong>
            <small>{check.detail}</small>
          </div>
        </article>
      {/each}
    </div>
  </section>

  <section class="city-panel">
    <div class="row">
      <div>
        <div class="panel-title">AP/GP Loop Proofs</div>
        <strong>{cityEconomyProofs.headline}</strong>
        <small>Priority proofs track AP top-up/resume, AP/GP goal hierarchy honesty, AP-for-GP coin-995 exchange, and normal-life recurrence caveats.</small>
      </div>
      <span class={`tag ${cityEconomyProofs.ready === cityEconomyProofs.total ? 'ok' : cityEconomyProofs.ready === 0 ? 'fail' : 'warn'}`}>
        {cityEconomyProofs.ready}/{cityEconomyProofs.total} fresh
      </span>
    </div>
    <div class="city-record-list compact">
      {#each cityEconomyProofs.checks as check (check.id)}
        <article>
          <span class={`tag ${check.tone}`}>{check.tone}</span>
          <div>
            <strong>{check.label}: {check.summary}</strong>
            <small>{check.detail}</small>
          </div>
        </article>
      {/each}
    </div>
    {#if economyProofNextActions(cityEconomyProofs).length}
      <div class="city-record-list compact">
        {#each economyProofNextActions(cityEconomyProofs) as action (action.label)}
          <article>
            <span class={`tag ${action.tone}`}>{action.tone}</span>
            <div>
              <strong>{action.label}</strong>
              <small>{action.detail}</small>
            </div>
          </article>
        {/each}
      </div>
    {/if}
    <div class="city-copy-block">
      <strong>{cityResidentProofRollup.headline}</strong>
      <p>{cityResidentProofRollup.detail}</p>
    </div>
    <div class="city-resident-profile-grid">
      <span><small>Online</small><strong>{cityResidentProofRollup.online}</strong></span>
      <span><small>Healthy</small><strong>{cityResidentProofRollup.healthy}</strong></span>
      <span><small>Warn</small><strong>{cityResidentProofRollup.warn}</strong></span>
      <span><small>Fail</small><strong>{cityResidentProofRollup.fail}</strong></span>
    </div>
    {#if cityResidentProofRollup.actions.length}
      <div class="city-record-list compact">
        {#each cityResidentProofRollup.actions as action (action.label)}
          <article>
            <span class={`tag ${action.tone}`}>{action.tone}</span>
            <div>
              <strong>{action.label}</strong>
              <small>{action.detail}</small>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section class={`city-panel tone-${cityLiveEconomySummary.tone}`}>
    <div class="row">
      <div>
        <div class="panel-title">Live AP/GP Economy</div>
        <strong>{cityLiveEconomySummary.headline}</strong>
        <small>{cityLiveEconomySummary.detail}</small>
        <small>{cityEconomyTransportSummary.detail}</small>
      </div>
      <span class={`tag ${cityEconomyTransportSummary.tone}`}>{cityEconomyTransportSummary.label}</span>
    </div>
    <div class="city-resident-profile-grid">
      <span><small>Events</small><strong>{cityLiveEconomySummary.eventLabel}</strong></span>
      <span><small>Self-funded AP</small><strong>{cityLiveEconomySummary.selfFundedLabel}</strong></span>
      <span><small>Soul Queue</small><strong>{cityLiveEconomySummary.proposalLabel}</strong></span>
      <span><small>Window</small><strong>{cityLiveEconomy.snapshot ? `${Math.round(cityLiveEconomy.snapshot.window.windowMs / 60000)}m` : '-'}</strong></span>
      <span><small>Top AP</small><strong>{cityLiveEconomy.snapshot?.topResidentsByAttention[0]?.residentName || '-'}</strong></span>
      <span><small>Active</small><strong>{cityEconomyHeartbeat.heartbeat ? `${cityEconomyHeartbeat.heartbeat.activeResidentCount}/${cityEconomyHeartbeat.heartbeat.residentCount}` : '-'}</strong></span>
      <span><small>Controller</small><strong>{cityEconomyHeartbeatSummary.degradedLabel}</strong></span>
    </div>
    {#if cityLiveEconomy.snapshot}
      <div class="city-record-list compact">
        {#each cityLiveEconomy.snapshot.recentEvents.slice(0, 3) as event (event.id)}
          <article>
            <span class="tag ok">{event.kind.replace(/_/g, ' ')}</span>
            <div>
              <strong>{event.residentName || 'city'} {event.apDelta ? `AP ${event.apDelta > 0 ? '+' : ''}${event.apDelta}` : ''}{event.gpDelta ? ` GP ${event.gpDelta > 0 ? '+' : ''}${event.gpDelta}` : ''}</strong>
              <small>{event.cityUserId || 'public'} · {timeAgo(event.ts)} ago</small>
            </div>
          </article>
        {:else}
          <article>
            <span class="tag warn">quiet</span>
            <div>
              <strong>No AP/GP events in this polling window</strong>
              <small>Residents and AP totals are still visible; wait for a top-up, GP burn, or Soul funding event.</small>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section class="city-dashboard-grid">
    <div class="city-panel">
      <div class="row">
        <div class="panel-title">Storyteller</div>
        <button onclick={() => cityNav('/story')}>Open Feed</button>
      </div>
      {#if cityStoryDigests[0]}
        {@const storyStatus = storytellerDigestStatus(cityStoryDigests[0])}
        <div class="city-copy-block">
          <strong>{cityStoryDigests[0].dispatch?.publicTitle || cityStoryDigests[0].digestId}</strong>
          <p>{cityStoryDigests[0].dispatch?.publicBody || cityStoryDigests[0].summary || 'Digest captured. Open the feed for event and review details.'}</p>
        </div>
        <div class="city-resident-profile-grid">
          <span><small>Run</small><strong>{cityStoryDigests[0].runId}</strong></span>
          <span><small>Events</small><strong>{cityStoryDigests[0].topEventCount}</strong></span>
          <span><small>Residents</small><strong>{cityStoryDigests[0].residentCount}</strong></span>
          <span><small>Status</small><strong>{storyStatus.label}</strong></span>
        </div>
        <div class={`notice ${storyStatus.tone === 'warn' ? 'amber' : ''}`}>{storyStatus.summary}</div>
        {@render CityStoryEvents({ events: cityStoryDigests[0].topEvents.slice(0, 3), compact: true })}
      {:else}
        <div class="city-empty-state">
          <strong>No digest runs yet</strong>
          <span>Grounded Storyteller runs appear here once a digest or dispatch is available.</span>
        </div>
      {/if}
    </div>
    <div class="city-panel span-2">
      <div class="row">
        <div class="panel-title">Resident Activity</div>
        <button onclick={() => cityNav('/residents')}>Directory</button>
      </div>
      <div class="city-loop-pulse-grid">
        {@render ResidentLoopFactGrid({ facts: residentGuestTrailFacts(cityLoopPulse) })}
      </div>
      <div class="city-empty-state subtle">
        <strong>{cityGuestTrailGuide.headline}</strong>
        <span>{cityGuestTrailGuide.detail}</span>
      </div>
      <div class="city-record-list compact">
        <article>
          <span class={`tag ${cityNormalLifeAudit.tone}`}>Audit</span>
          <div>
            <strong>{cityNormalLifeAudit.summary}</strong>
            <small>{cityNormalLifeAudit.detail}</small>
          </div>
        </article>
      </div>
      {@render CityResidentList({ rows: cityFeaturedResidents })}
    </div>
    <div class="city-panel">
      <div class="panel-title">Embassy</div>
      <div class="city-card-list compact">
        {#each cityProposals.slice(0, 3) as proposal (proposal.id)}
          <button onclick={() => cityNav(`/embassy/${encodeURIComponent(proposal.id)}`)}>
            <span class={`tag ${statusTone(proposal.status)}`}>{proposal.status}</span>
            <strong>{proposal.displayName}</strong>
            <small>{proposal.contributedAttention.toLocaleString()} / {proposal.attentionThreshold.toLocaleString()} AP</small>
          </button>
        {:else}
          <div class="city-empty-state">
            <strong>No proposals ready</strong>
            <span>Birth funding and contribution history will appear here.</span>
          </div>
        {/each}
      </div>
      <button class="primary" onclick={() => cityNav('/embassy/new')}>New Proposal</button>
    </div>
    <div class="city-panel">
      <div class="panel-title">Print Queue</div>
      <div class="city-queue-meter">
        <span style={`--queue-fill: ${Math.min(100, activePrintCount() * 20)}%`}></span>
      </div>
      <div class="city-card-list compact">
        {#each cityPrintRequests.slice(0, 3) as request (request.id)}
          <button onclick={() => cityNav(`/prints/${encodeURIComponent(request.id)}`)}>
            <span class={`tag ${statusTone(request.status)}`}>{request.status}</span>
            <strong>{request.title}</strong>
            <small>{request.quoteGp ? `${request.quoteGp.toLocaleString()} GP` : 'unquoted'}</small>
          </button>
        {:else}
          <div class="city-empty-state">
            <strong>No active requests</strong>
            <span>Quote, GP burn, slicing, and printer assignment status lands here.</span>
          </div>
        {/each}
      </div>
      <button onclick={() => cityNav('/prints')}>Prints</button>
    </div>
  </section>
{/snippet}

{#snippet CityEconomy()}
  <section class="city-page-head">
    <p class="kicker">AP / GP Economy</p>
    <h1>Attention and Gold Flow</h1>
    <p class="city-lede">Live resident attention, RuneScape coin movement, Soul funding, and NCRI listing signals.</p>
  </section>

  <section class="city-dashboard-grid">
    <div class={`city-panel span-2 tone-${cityLiveEconomySummary.tone}`}>
      <div class="row">
        <div>
          <div class="panel-title">City Totals</div>
          <strong>{cityLiveEconomySummary.headline}</strong>
          <small>{cityLiveEconomySummary.detail}</small>
          <small>{cityEconomyTransportSummary.detail}</small>
        </div>
        <span class={`tag ${cityEconomyTransportSummary.tone}`}>{cityEconomyTransportSummary.label}</span>
      </div>
      <div class="city-resident-profile-grid">
        <span><small>Residents</small><strong>{cityLiveEconomy.snapshot?.city.residentCount?.toLocaleString() || cityResidents.length.toLocaleString()}</strong></span>
        <span><small>Active</small><strong>{cityLiveEconomy.snapshot?.city.activeResidentCount?.toLocaleString() || cityEconomyHeartbeat.heartbeat?.activeResidentCount?.toLocaleString() || '-'}</strong></span>
        <span><small>AP Total</small><strong>{cityLiveEconomy.snapshot?.city.attentionTotal?.toLocaleString() || '-'}</strong></span>
        <span><small>Self-funded AP</small><strong>{cityLiveEconomySummary.selfFundedLabel}</strong></span>
        <span><small>AP Delta</small><strong>{cityLiveEconomy.snapshot ? cityLiveEconomy.snapshot.city.attentionDelta.toLocaleString() : '-'}</strong></span>
        <span><small>GP Delta</small><strong>{cityLiveEconomy.snapshot ? cityLiveEconomy.snapshot.city.gpNetDelta.toLocaleString() : '-'}</strong></span>
        <span><small>Window</small><strong>{cityLiveEconomy.snapshot ? `${Math.round(cityLiveEconomy.snapshot.window.windowMs / 60000)}m` : '-'}</strong></span>
      </div>
    </div>

    <div class={`city-panel tone-${cityEconomyHeartbeatSummary.tone}`}>
      <div class="row">
        <div>
          <div class="panel-title">Controller Heartbeat</div>
          <strong>{cityEconomyHeartbeatSummary.headline}</strong>
          <small>{cityEconomyHeartbeatSummary.detail}</small>
        </div>
        <span class={`tag ${cityEconomyHeartbeatSummary.tone}`}>{cityEconomyHeartbeatSummary.degradedLabel}</span>
      </div>
      <div class="city-resident-profile-grid">
        <span><small>Events</small><strong>{cityEconomyHeartbeat.heartbeat?.economyEventCount?.toLocaleString() || '-'}</strong></span>
        <span><small>Uptime</small><strong>{cityEconomyHeartbeat.heartbeat ? `${Math.round(cityEconomyHeartbeat.heartbeat.controllerUptimeSec / 60)}m` : '-'}</strong></span>
        <span><small>Last Event</small><strong>{cityEconomyHeartbeat.heartbeat?.lastEconomyEventKind?.replace(/_/g, ' ') || '-'}</strong></span>
        <span><small>Digest</small><strong>{cityEconomyHeartbeat.heartbeat?.lastDigestBuiltAt ? `${timeAgo(cityEconomyHeartbeat.heartbeat.lastDigestBuiltAt)} ago` : '-'}</strong></span>
      </div>
    </div>

    <div class="city-panel span-2">
      <div class="row">
        <div class="panel-title">Recent Economy Events</div>
        <span class="tag">{cityLiveEconomySummary.eventLabel}</span>
      </div>
      <div class="city-record-list">
        {#each cityLiveEconomy.snapshot?.recentEvents.slice(0, 10) || [] as event (event.id)}
          {@const eventRow = economyEventDisplay(event)}
          <article>
            <span class="tag ok">{eventRow.kindLabel}</span>
            <div>
              <strong>{eventRow.title}</strong>
              <small>{eventRow.detail} · {timeAgo(event.ts)} ago</small>
            </div>
          </article>
        {:else}
          <div class="city-empty-state">
            <strong>No AP/GP events in the live window</strong>
            <span>Top-ups, AP decay, coin-995 exchange, GP trades, and NCRI events appear here when the bridge reports them.</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="city-panel">
      <div class="row">
        <div class="panel-title">Recent Self-funded AP</div>
        <span class="tag">{cityLiveEconomySummary.selfFundedLabel}</span>
      </div>
      <div class="city-record-list compact">
        {#each citySelfFundedApRows as row (row.residentName)}
          <article>
            <span class="tag ok">{row.exchangeCount}x</span>
            <div>
              <strong>{row.residentName}</strong>
              <small>{row.detail} · latest {timeAgo(row.latestAt)} ago</small>
            </div>
          </article>
        {:else}
          <div class="city-empty-state">
            <strong>No self-funded AP exchanges in this window</strong>
            <span>Recent resident GP-to-AP conversions appear here once the live economy bridge reports them.</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="city-panel">
      <div class="row">
        <div class="panel-title">Top Residents</div>
        <button onclick={() => cityNav('/residents')}>Directory</button>
      </div>
      <div class="city-record-list compact">
        {#each cityLiveEconomy.snapshot?.topResidentsByAttention.slice(0, 8) || [] as resident (resident.residentName)}
          {@const residentRow = economyResidentDisplay(resident)}
          <article>
            <span class={`tag ${residentRow.tone}`}>{residentRow.status}</span>
            <div>
              <strong>{residentRow.title}</strong>
              <small>{residentRow.detail}</small>
            </div>
          </article>
        {:else}
          <div class="city-empty-state">
            <strong>No resident economy rows loaded</strong>
            <span>The live economy bridge will show AP balance, coin-995 deltas, and activity by resident.</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="city-panel">
      <div class="row">
        <div class="panel-title">Soul Funding</div>
        <button onclick={() => cityNav('/embassy')}>Embassy</button>
      </div>
      <div class="city-card-list compact">
        {#each cityLiveEconomy.snapshot?.pendingProposals.slice(0, 6) || [] as proposal (proposal.proposalId)}
          <button onclick={() => cityNav(`/embassy/${encodeURIComponent(proposal.proposalId)}`)}>
            <span class={`tag ${statusTone(proposal.status)}`}>{proposal.status}</span>
            <strong>{proposal.residentName}</strong>
            <small>{proposal.apFunded.toLocaleString()} / {proposal.apThreshold.toLocaleString()} AP · {proposal.goalText}</small>
          </button>
        {:else}
          <div class="city-empty-state">
            <strong>No Souls are funding in this window</strong>
            <span>Collective AP threshold progress appears here once proposals enter funding.</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="city-panel">
      <div class="row">
        <div class="panel-title">NCRI Listings</div>
        {#if citySession.admin}
          <button onclick={() => cityNav('/admin/economy')}>Admin</button>
        {/if}
      </div>
      <div class="city-record-list compact">
        {#each cityEconomyListings.listings.slice(0, 6) as listing (listing.ncriId)}
          <article>
            <span class="tag ok">item {listing.itemId}</span>
            <div>
              <strong>{listing.displayName}</strong>
              <small>{listing.sourceResidentName || listing.owner} · {timeAgo(listing.updatedAt)} ago</small>
            </div>
          </article>
        {:else}
          <div class="city-empty-state">
            <strong>{citySession.admin ? 'No NCRIs listed yet' : 'NCRI listings require admin access'}</strong>
            <span>Approved resident-created RuneScape items appear here when they are listed for AP/GP trade.</span>
          </div>
        {/each}
      </div>
    </div>
  </section>
{/snippet}

{#snippet CityStoryEvents({ events, compact = false }: { events: StorytellerDigestEventSummary[]; compact?: boolean })}
  {#if events.length}
    <div class="city-record-list story-event-list" class:compact>
      {#each events as event (event.ref)}
        {@const myth = storytellerMythCard(event)}
        <article class="story-event-card">
          <span class={`tag ${storytellerEventTone(event)}`}>{event.importance || 'event'}</span>
          <div class="story-event-copy">
            <strong>{myth.title}</strong>
            <small>{storytellerEventMeta(event)}</small>
            {#if myth.body}
              <p>{myth.body}</p>
            {/if}
            {#if myth.evidenceLabels.length}
              <div class="story-evidence-list" aria-label="Grounded evidence">
                {#each myth.evidenceLabels as label}
                  <span>{label}</span>
                {/each}
              </div>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {:else if !compact}
    <div class="city-empty-state">
      <strong>No grounded top events</strong>
      <span>This digest only has counts and operator summary text.</span>
    </div>
  {/if}
{/snippet}

{#snippet CityStory()}
  <section class="city-page-head">
    <p class="kicker">Storyteller</p>
    <h1>Storyteller Dispatches</h1>
  </section>
  <section class="city-dashboard-grid">
    <div class="city-panel">
      <div class="panel-title">Dispatch List</div>
      <small>{cityStoryRunList.summary}</small>
      <div class="city-card-list compact">
        {#each cityStoryRunList.visible as digest (digest.runId)}
          {@const status = storytellerDigestStatus(digest)}
          <button class:active={cityStoryDigest?.runId === digest.runId} onclick={() => cityNav(`/story/${encodeURIComponent(digest.runId)}`)}>
            <span class={`tag ${status.tone}`}>{digest.queue === 'canon' ? 'canon' : digest.queue === 'review' ? 'review' : status.label}</span>
            <strong>{digest.dispatch?.publicTitle || digest.digestId}</strong>
            <small>{digest.queue || 'dry-run'} · {digest.topEventCount} events · {digest.residentCount} residents · {digest.builtAt ? timeAgo(digest.builtAt) : 'undated'}</small>
            <small class="city-run-pressure-line">{storytellerRunListPressureLine(digest)}</small>
          </button>
        {:else}
          <div class="city-empty-state">
            <strong>No Storyteller dispatches</strong>
            <span>Public dispatch previews will appear once grounded Storyteller runs are written.</span>
          </div>
        {/each}
      </div>
    </div>
    <div class="city-panel span-2">
      <div class="row">
        <div class="panel-title">Public Dispatch Preview</div>
        {#if cityStoryDigest?.dispatch?.generatedAt}
          <span class="tag">dispatch {timeAgo(cityStoryDigest.dispatch.generatedAt)}</span>
        {/if}
      </div>
      {#if cityStoryDigest}
        {@const selectedStoryStatus = storytellerDigestStatus(cityStoryDigest)}
        {@const selectedStoryAudit = storytellerGroundingAudit(cityStoryDigest)}
        {@const selectedStoryDensity = storytellerReviewDensity(cityStoryDigest)}
        {@const selectedStoryPreview = storytellerLatestPreview(cityStoryDigest)}
        <div class="city-resident-profile-grid">
          <span><small>Run</small><strong>{cityStoryDigest.runId}</strong></span>
          <span><small>Queue</small><strong>{cityStoryDigest.queue || 'dry-run'}</strong></span>
          <span><small>Digest</small><strong>{cityStoryDigest.digestId}</strong></span>
          <span><small>Top Events</small><strong>{cityStoryDigest.topEventCount}</strong></span>
          <span><small>Residents</small><strong>{cityStoryDigest.residentCount}</strong></span>
          <span><small>Model</small><strong>{cityStoryDigest.dispatch?.modelProfile || 'dry-run'}</strong></span>
          <span><small>Cost</small><strong>{cityStoryDigest.dispatch?.estimatedCostUsd === undefined ? '-' : cityStoryDigest.dispatch.estimatedCostUsd === null ? 'local/free' : `$${cityStoryDigest.dispatch.estimatedCostUsd.toFixed(3)}`}</strong></span>
          <span><small>Refs Used</small><strong>{cityStoryDigest.dispatch?.eventRefCount ?? 0}</strong></span>
          <span><small>Status</small><strong>{selectedStoryStatus.label}</strong></span>
        </div>
        <div class={`notice ${selectedStoryStatus.tone === 'warn' ? 'amber' : ''}`}>{selectedStoryStatus.summary}</div>
        <div class={`city-copy-block story-latest-preview tone-${selectedStoryPreview.tone}`}>
          <div class="row">
            <div>
              <div class="panel-title">Latest Public Dispatch</div>
              <strong>{selectedStoryPreview.title}</strong>
            </div>
            <span class={`tag ${selectedStoryPreview.tone}`}>{selectedStoryPreview.source}</span>
          </div>
          <p>{selectedStoryPreview.body}</p>
          <small>{selectedStoryPreview.detail}</small>
        </div>
        {#if selectedStoryPreview.bullets.length}
          <div class="city-record-list compact">
            {#each selectedStoryPreview.bullets as bullet}
              <article class="story-event-card">
                <span class="tag ok">dispatch</span>
                <div class="story-event-copy">
                  <strong>{bullet}</strong>
                </div>
              </article>
            {/each}
          </div>
        {/if}
        <div class={`city-review-block story-review-density tone-${selectedStoryDensity.tone}`}>
          <div class="row">
            <div>
              <div class="panel-title">Review Signals</div>
              <strong>{selectedStoryDensity.headline}</strong>
            </div>
            <span class={`tag ${selectedStoryDensity.tone}`}>{selectedStoryDensity.tone}</span>
          </div>
          <small>{selectedStoryDensity.detail}</small>
          <div class="story-evidence-list" aria-label="Storyteller review density">
            {#each selectedStoryDensity.chips as chip}
              <span>{chip}</span>
            {/each}
          </div>
        </div>
        <div class="city-review-block">
          <div class="row">
            <div class="panel-title">Grounding Audit</div>
            <span class={`tag ${selectedStoryAudit.tone}`}>{selectedStoryAudit.tone}</span>
          </div>
          <strong>{selectedStoryAudit.summary}</strong>
          <div class="story-evidence-list" aria-label="Storyteller grounding audit">
            {#each selectedStoryAudit.citedKnownRefs.slice(0, 8) as ref}
              <span>matched {ref}</span>
            {/each}
            {#each selectedStoryAudit.missingRefs.slice(0, 8) as ref}
              <span>missing {ref}</span>
            {/each}
            {#each selectedStoryAudit.uncitedTopRefs.slice(0, 8) as ref}
              <span>uncited {ref}</span>
            {/each}
            {#if selectedStoryAudit.warningCount > 0}
              <span>{selectedStoryAudit.warningCount} warnings</span>
            {/if}
            {#if selectedStoryAudit.reviewReasonCount > 0}
              <span>{selectedStoryAudit.reviewReasonCount} review reasons</span>
            {/if}
          </div>
        </div>
        {#if cityStoryDigest.dispatch?.operatorSummary}
          <div class="notice">{cityStoryDigest.dispatch.operatorSummary}</div>
        {/if}
        {@render CityStoryEvents({ events: cityStoryDigest.topEvents })}
        {#if cityStoryDigest.dispatch?.needsReview}
          <div class="notice">Dispatch flagged for review before public broadcast.</div>
        {/if}
        {#if cityStoryDigest.dispatch && (cityStoryDigest.dispatch.operatorWarnings.length || cityStoryDigest.dispatch.reviewReasons.length || cityStoryDigest.dispatch.eventRefsUsed.length)}
          <div class="city-review-block">
            <div class="panel-title">Review Evidence</div>
            {#if cityStoryDigest.dispatch.operatorWarnings.length}
              <div class="story-evidence-list" aria-label="Operator warnings">
                {#each cityStoryDigest.dispatch.operatorWarnings as warning}
                  <span>{warning}</span>
                {/each}
              </div>
            {/if}
            {#if cityStoryDigest.dispatch.reviewReasons.length}
              <div class="story-evidence-list" aria-label="Review reasons">
                {#each cityStoryDigest.dispatch.reviewReasons as reason}
                  <span>{reason}</span>
                {/each}
              </div>
            {/if}
            {#if cityStoryDigest.dispatch.eventRefsUsed.length}
              <div class="story-evidence-list" aria-label="Event refs used">
                {#each cityStoryDigest.dispatch.eventRefsUsed as ref}
                  <span>{ref}</span>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="city-empty-state">
          <strong>Select a Storyteller dispatch</strong>
          <span>Use the dispatch list to preview the latest grounded story artifacts.</span>
        </div>
      {/if}
    </div>
  </section>
{/snippet}

{#snippet CityAuthCta({ label = 'Login required' }: { label?: string })}
  <section class="city-auth-band">
    <div>
      <p class="kicker">Attendee Session</p>
      <strong>{label}</strong>
      <span>Use the Onion DAO login to load AP, GP, inbox, Embassy actions, and print workflows.</span>
      {#if !cityLoginUrlReady}
        <small>Ask event staff for the attendee QR or staff login link.</small>
      {/if}
    </div>
    {#if cityLoginUrlReady}
      <a class="city-link-button" href={citySession.loginUrl}>Open Onion DAO Login</a>
    {/if}
  </section>
{/snippet}

{#snippet CityProfile()}
  <section class="city-page-head">
    <p class="kicker">Profile</p>
    <h1>{publicProfileHandle ? cityPublicPatronProfile?.displayName || publicProfileHandle : citySession.authenticated ? citySession.name : 'Guest'}</h1>
    {#if publicProfileHandle}
      <p class="city-lede">Public attendee view for AP, Embassy standing, resident relationships, and inbox readiness.</p>
    {/if}
  </section>
  {#if publicProfileHandle}
    {#if cityPublicPatronProfile}
      <section class="city-dashboard-grid">
        <div class="city-panel profile-panel">
          <div class="city-avatar">{publicPatronInitials(cityPublicPatronProfile)}</div>
          <div>
            <strong>{cityPublicPatronProfile.displayName}</strong>
            <span>{publicPatronStandingLabel(cityPublicPatronProfile)}</span>
            <small>Public profile from `/v1/patron/*` and `/v1/inbox`</small>
          </div>
        </div>
        <div class="city-panel">
          <div class="panel-title">Attention</div>
          <div class="city-balance-grid">
            <span><small>AP</small><strong>{cityPublicPatronProfile.apBalance.toLocaleString()}</strong></span>
            <span><small>Letters</small><strong>{cityPublicPatronProfile.letterCount.toLocaleString()}</strong></span>
          </div>
          {#if cityPublicPatronProfile.legacyCurrencyLabel}
            <div class="notice">Legacy event ledgers still store this as {cityPublicPatronProfile.legacyCurrencyLabel}; attendees should read it as AP.</div>
          {/if}
        </div>
        <div class="city-panel">
          <div class="panel-title">Embassy Standing</div>
          <div class="city-resident-profile-grid">
            <span><small>Tier</small><strong>{cityPublicPatronProfile.standing.tier || 'stranger'}</strong></span>
            <span><small>Points</small><strong>{cityPublicPatronProfile.standing.points.toLocaleString()}</strong></span>
            <span><small>Next</small><strong>{cityPublicPatronProfile.standing.nextTier || 'max'}</strong></span>
            <span><small>Needed</small><strong>{cityPublicPatronProfile.standing.pointsToNext ?? 0}</strong></span>
          </div>
        </div>
        <div class="city-panel">
          <div class="panel-title">Inbox</div>
          {#if cityPublicPatronProfile.latestLetter}
            <div class="city-copy-block">
              <strong>{cityPublicPatronProfile.latestLetter.subject}</strong>
              <p>{cityPublicPatronProfile.latestLetter.at ? timeAgo(cityPublicPatronProfile.latestLetter.at) : 'undated'} · {cityPublicPatronProfile.letterCount.toLocaleString()} total letter{cityPublicPatronProfile.letterCount === 1 ? '' : 's'}</p>
            </div>
          {:else}
            <div class="city-empty-state">
              <strong>No letters yet</strong>
              <span>AP grants, resident replies, and epitaphs will make this profile feel alive.</span>
            </div>
          {/if}
          <a class="city-link-button" href={`/debug/inbox/?human=${encodeURIComponent(cityPublicPatronProfile.human)}`}>Open Inbox</a>
        </div>
        <div class="city-panel span-2">
          <div class="panel-title">Residents Touched</div>
          <div class="city-card-list">
            {#each cityPublicPatronProfile.residents as resident (resident.slug)}
              <button onclick={() => cityNav(`/residents/${encodeURIComponent(resident.slug)}`)}>
                <span class="tag ok">linked</span>
                <strong>{resident.displayName}</strong>
                <small>{resident.slug}</small>
              </button>
            {:else}
              <div class="city-empty-state">
                <strong>No resident relationships yet</strong>
                <span>Grant AP or witness a resident to create the first relationship signal.</span>
              </div>
            {/each}
          </div>
        </div>
      </section>
    {:else}
      <section class="city-dashboard-grid">
        <div class="city-panel span-2">
          <div class="city-empty-state">
            <strong>Public profile not loaded</strong>
            <span>Check that the handle exists and the public event endpoints are running.</span>
          </div>
        </div>
      </section>
    {/if}
  {:else}
  {#if !citySession.authenticated}
    {@render CityAuthCta({ label: 'Login to view your profile' })}
  {/if}
  <section class="city-dashboard-grid">
    <div class="city-panel profile-panel">
      <div class="city-avatar">{citySession.name.slice(0, 2).toUpperCase()}</div>
      <div>
        <strong>{citySession.name}</strong>
        <span>{citySession.handle}</span>
        {#if citySession.email}<small>{citySession.email}</small>{/if}
      </div>
    </div>
    <div class="city-panel">
      <div class="panel-title">Balances</div>
      <div class="city-balance-grid">
        <span><small>AP</small><strong>{citySession.ap.toLocaleString()}</strong></span>
        <span><small>GP</small><strong>{citySession.gp.toLocaleString()}</strong></span>
      </div>
    </div>
    <div class={`city-panel span-2 city-economy-health tone-${cityProfileEconomy.tone}`}>
      <div class="row">
        <div>
          <div class="panel-title">Economy Health</div>
          <strong>{cityProfileEconomy.headline}</strong>
          <small>{cityProfileEconomy.detail}</small>
        </div>
        <span class={`tag ${cityProfileEconomy.tone}`}>{cityProfileEconomy.tone}</span>
      </div>
      <div class="city-resident-profile-grid city-economy-metrics">
        {#each cityProfileEconomy.metrics as metric (metric.id)}
          <span class={`tone-${metric.tone}`}>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </span>
        {/each}
      </div>
      {#if cityProfileEconomy.warnings.length}
        <div class="story-evidence-list city-economy-warnings" aria-label="Economy warnings">
          {#each cityProfileEconomy.warnings as warning}
            <span>{warning}</span>
          {/each}
        </div>
      {/if}
      <div class="story-evidence-list city-economy-actions" aria-label="Economy next actions">
        {#each cityProfileEconomy.nextActions as action}
          <span>{action}</span>
        {/each}
      </div>
    </div>
    <div class="city-panel span-2">
      <div class="row">
        <div class="panel-title">Profile Settings</div>
        <button class="primary" disabled={actionBusy || !citySession.authenticated} onclick={saveProfile}>Save</button>
      </div>
      <div class="city-form-grid">
        <label>Display name <input bind:value={profileDisplayName} placeholder={citySession.name} disabled={!citySession.authenticated} /></label>
        <label>Handle <input bind:value={profileHandle} placeholder={citySession.handle.replace(/^@/, '')} disabled={!citySession.authenticated} /></label>
        <label class="span-2">Avatar URL <input bind:value={profileAvatarUrl} placeholder="https://..." disabled={!citySession.authenticated} /></label>
      </div>
    </div>
    <div class="city-panel span-2">
      <div class="row">
        <div class="panel-title">Ledger</div>
        <div class="actions">
          <select bind:value={cityLedgerFilter} onchange={() => loadRoute(false)} disabled={!citySession.authenticated}>
            <option value="all">All</option>
            <option value="AP">AP</option>
            <option value="GP">GP</option>
          </select>
          <button disabled={actionBusy || !citySession.authenticated} onclick={syncCheckins}>Sync Check-ins</button>
        </div>
      </div>
      <div class="city-record-list">
        {#each cityLedger as entry (entry.id)}
          <article>
            <span class={`tag ${entry.delta >= 0 ? 'ok' : 'warn'}`}>{ledgerDelta(entry)}</span>
            <div>
              <strong>{entry.memo || labelize(entry.sourceType)}</strong>
              <small>{entry.sourceType} · balance {entry.balanceAfter.toLocaleString()} · {entry.createdAt ? timeAgo(entry.createdAt) : 'undated'}</small>
            </div>
          </article>
        {:else}
          <div class="city-empty-state">
            <strong>No attendee ledger entries</strong>
            <span>Check-ins, soul contributions, resident grants, and print burns will appear here.</span>
          </div>
        {/each}
      </div>
    </div>
  </section>
  {/if}
{/snippet}

{#snippet CityWorld()}
  <section class="city-page-head">
    <p class="kicker">World</p>
    <h1>Enter City</h1>
  </section>
  <section class={`city-panel city-world-readiness tone-${cityWorldReadiness.status === 'blocked' ? 'fail' : cityWorldReadiness.status === 'watch' ? 'warn' : 'ok'}`}>
    <div class="row">
      <div>
        <p class="kicker">Client Readiness</p>
        <strong>{cityWorldReadiness.headline}</strong>
        <small>{cityWorldReadiness.detail}</small>
      </div>
      {#if citySession.authenticated}
        <span class="city-world-badge">session ready</span>
      {:else}
        <button class="primary" onclick={() => cityNav('/login')}>Login</button>
      {/if}
    </div>
    <div class="city-world-checks">
      {#each cityWorldReadiness.checks as check (check.id)}
        <div class={`metric tone-${check.tone}`}>
          <span>{check.label}</span>
          <strong>{check.value}</strong>
          <small>{check.detail}</small>
        </div>
      {/each}
    </div>
    <div class="city-world-actions">
      {#each cityWorldReadiness.nextActions as action}
        <span>{action}</span>
      {/each}
    </div>
  </section>
  {#if !citySession.authenticated}
    {@render CityAuthCta({ label: 'Login to enter the RuneScape client' })}
  {/if}
  <section class="city-world-layout">
    <div class="city-world-frame">
      <div bind:this={gameClientMount} class:fullscreen-fallback={cityGameFullscreenFallback} class="city-game-mount">
        <div class="city-game-status">
          <div>
            <strong>{cityWorldReadiness.checks.find(check => check.id === 'gateway')?.value || 'unknown gateway'}</strong>
            <span>{cityOnlineResidents.length} online residents · game session {gameClientStatus}</span>
          </div>
          <button
            class="city-game-fullscreen"
            disabled={!cityGameFullscreenAvailable}
            aria-label={cityGameFullscreen ? 'Exit fullscreen client' : 'Fullscreen client'}
            title={cityGameFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            onclick={toggleCityGameFullscreen}
          >
            {cityGameFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
        </div>
        <div class="city-game-actions">
          <button class="primary" disabled={actionBusy || !cityWorldReadiness.canStartClient} onclick={startCityGameClient}>Start Client</button>
          <button disabled={actionBusy || !gameClientController} onclick={stopCityGameClient}>Stop</button>
        </div>
      </div>
    </div>
    <aside class="city-panel">
      <div class="panel-title">Online Residents</div>
      {@render CityResidentList({ rows: cityOnlineResidents.slice(0, 8) })}
    </aside>
  </section>
{/snippet}

{#snippet CityEmbassy()}
  <section class="city-page-head">
    <p class="kicker">Embassy</p>
    <h1>{route === '/embassy/new' ? 'New Soul' : citySelectedProposal ? citySelectedProposal.displayName : 'Soul Proposals'}</h1>
  </section>
  {#if !citySession.authenticated && route !== '/embassy'}
    {@render CityAuthCta({ label: 'Login to use Embassy actions' })}
  {/if}
  {#if route === '/embassy/new'}
    <section class="city-dashboard-grid">
      <div class="city-panel span-2">
        <div class="row">
          <div class="panel-title">Composer</div>
          <div class="actions">
            <button disabled={actionBusy || !citySession.authenticated} onclick={refreshProposalQuote}>Quote</button>
            <button class="primary" disabled={actionBusy || !citySession.authenticated} onclick={createSoulProposal}>Submit</button>
          </div>
        </div>
        <div class="city-form-grid">
          <label>Resident name <input bind:value={proposalResidentName} placeholder="optional_resident_name" /></label>
          <label>Display name <input bind:value={proposalDisplayName} placeholder="Mire Scribe" /></label>
          <label class="span-2">Goal <textarea bind:value={proposalGoal} rows="3" placeholder="What should this soul want?"></textarea></label>
          <label class="span-2">Personality <textarea bind:value={proposalPersonality} rows="3"></textarea></label>
          <label>Virtues <textarea bind:value={proposalVirtues} rows="3"></textarea></label>
          <label>Vices <textarea bind:value={proposalVices} rows="3"></textarea></label>
          <label>Fears <textarea bind:value={proposalFears} rows="3"></textarea></label>
          <label>Voice <textarea bind:value={proposalVoice} rows="3"></textarea></label>
          <label class="span-2">First memory <textarea bind:value={proposalFirstMemory} rows="3"></textarea></label>
          <label class="span-2">Secret <textarea bind:value={proposalSecret} rows="3"></textarea></label>
          <label>Starting levels <textarea bind:value={proposalLevels} rows="3" placeholder="hitpoints:10, mining:5"></textarea></label>
          <label>Equipment <textarea bind:value={proposalEquipment} rows="3" placeholder="bronze pickaxe"></textarea></label>
          <label class="span-2">Inventory <textarea bind:value={proposalInventory} rows="3" placeholder="bread, tinderbox"></textarea></label>
        </div>
      </div>
      <div class="city-panel">
        <div class="panel-title">Quote</div>
        {#if cityProposalQuote}
          <div class="city-balance-grid">
            <span><small>Threshold</small><strong>{cityProposalQuote.threshold.toLocaleString()} AP</strong></span>
            <span><small>Base</small><strong>{cityProposalQuote.breakdown.base.toLocaleString()}</strong></span>
            <span><small>Levels</small><strong>{cityProposalQuote.breakdown.levels.toLocaleString()}</strong></span>
            <span><small>Items</small><strong>{(cityProposalQuote.breakdown.equipment + cityProposalQuote.breakdown.inventory).toLocaleString()}</strong></span>
          </div>
        {:else}
          <div class="city-empty-state"><strong>No quote yet</strong><span>Use Quote to preview the AP threshold.</span></div>
        {/if}
      </div>
    </section>
  {:else if citySelectedProposal}
    <section class="city-dashboard-grid">
      <div class="city-panel span-2">
        <div class="row">
          <div class="panel-title">Proposal</div>
          <span class={`tag ${statusTone(citySelectedProposal.status)}`}>{citySelectedProposal.status}</span>
        </div>
        <div class="city-proposal-meter">
          <span style={`--queue-fill: ${proposalProgress(citySelectedProposal)}%`}></span>
        </div>
        <div class="city-resident-profile-grid">
          <span><small>Funded</small><strong>{citySelectedProposal.contributedAttention.toLocaleString()} AP</strong></span>
          <span><small>Threshold</small><strong>{citySelectedProposal.attentionThreshold.toLocaleString()} AP</strong></span>
          <span><small>Remaining</small><strong>{proposalRemaining(citySelectedProposal).toLocaleString()} AP</strong></span>
          <span><small>Updated</small><strong>{timeAgo(citySelectedProposal.updatedAt)}</strong></span>
        </div>
        <div class="city-copy-block">
          <strong>{citySelectedProposal.goal}</strong>
          <p>{citySelectedProposal.personality || 'No personality text supplied.'}</p>
          <small>{citySelectedProposal.virtues} {citySelectedProposal.vices}</small>
        </div>
      </div>
      <div class="city-panel">
        <div class="panel-title">Contribute AP</div>
        <div class="city-form-grid single">
          <label>Amount <input bind:value={contributionAp} inputmode="numeric" /></label>
          <button class="primary" disabled={actionBusy || !citySession.authenticated} onclick={() => citySelectedProposal && contributeToSoulProposal(citySelectedProposal.id)}>Contribute</button>
        </div>
      </div>
    </section>
  {:else}
    <section class="city-dashboard-grid">
      <div class="city-panel span-2">
        <div class="row">
          <div class="panel-title">Funding Queue</div>
          <button class="primary" onclick={() => cityNav('/embassy/new')}>New Proposal</button>
        </div>
        <div class="city-card-list">
          {#each cityProposals as proposal (proposal.id)}
            <button onclick={() => cityNav(`/embassy/${encodeURIComponent(proposal.id)}`)}>
              <span class={`tag ${statusTone(proposal.status)}`}>{proposal.status}</span>
              <strong>{proposal.displayName}</strong>
              <small>{proposal.contributedAttention.toLocaleString()} / {proposal.attentionThreshold.toLocaleString()} AP · {proposalRemaining(proposal).toLocaleString()} remaining</small>
            </button>
          {:else}
            <div class="city-empty-state">
              <strong>No proposals reported</strong>
              <span>Proposal filters will sort by Needs AP, Ready to birth, Born, and Mine once attendee proposals arrive.</span>
            </div>
          {/each}
        </div>
      </div>
      <div class="city-panel">
        <div class="panel-title">Balances</div>
        <div class="city-balance-grid">
          <span><small>AP</small><strong>{citySession.ap.toLocaleString()}</strong></span>
          <span><small>Ready</small><strong>{cityProposals.filter(proposal => proposal.status === 'ready_to_birth').length}</strong></span>
        </div>
      </div>
    </section>
  {/if}
{/snippet}

{#snippet CityResidents()}
  <section class="city-page-head">
    <p class="kicker">Residents</p>
    <h1>Directory</h1>
  </section>
  {@render ResidentTriageStrip({ limit: 8 })}
  <section class="city-dashboard-grid">
    <div class="city-panel span-2 resident-liveness-ledger">
      <div class="row">
        <div>
          <div class="panel-title">Resident Liveness Ledger</div>
          <strong>{cityResidentProofRollup.headline}</strong>
          <small>{cityResidentProofRollup.detail}</small>
        </div>
        <span class={`tag ${cityResidentProofRollup.tone}`}>{cityResidentProofRollup.healthy}/{cityResidentProofRollup.online}</span>
      </div>
      <div class="resident-liveness-list">
        {#each cityResidentLivenessLedger as entry (entry.residentName)}
          <button class={`resident-liveness-row tone-${entry.tone}`} onclick={() => cityNav(`/residents/${encodeURIComponent(residentSlug(entry.residentName))}`)}>
            <span class={`tag ${entry.tone}`}>{entry.tone}</span>
            <span class="resident-liveness-main">
              <strong>{entry.displayName}</strong>
              <small>{entry.status} · {entry.proof}</small>
              <em>{entry.detail}</em>
            </span>
            <span class="resident-liveness-facts">
              <small>AP <strong>{entry.ap}</strong></small>
              <small>GP <strong>{entry.gp}</strong></small>
              <small>Stack <strong>{entry.stack}</strong></small>
              <small>Contract <strong>{entry.contract}</strong></small>
              <small>Plan <strong>{entry.plan}</strong></small>
              <small>Story <strong>{entry.story}</strong></small>
              <small>Memory <strong>{entry.memory}</strong></small>
            </span>
            <span class="resident-liveness-next">
              <small>{entry.nextTarget}</small>
              <strong>{entry.nextAction}</strong>
            </span>
          </button>
        {:else}
          <div class="city-empty-state">
            <strong>No resident liveness rows yet</strong>
            <span>Live resident proof rows appear once the controller or city snapshot publishes residents.</span>
          </div>
        {/each}
      </div>
    </div>
    <div class="city-panel">
      <div class="panel-title">City Records</div>
      <div class="city-card-list compact">
        {#each cityDirectoryResidents as resident (resident.id)}
          <button onclick={() => cityNav(`/residents/${encodeURIComponent(resident.nullcityResidentId)}`)}>
            <span class={`tag ${statusTone(resident.status)}`}>{resident.status}</span>
            <strong>{resident.displayName}</strong>
            <small>{resident.goal || resident.latestThought || resident.updatedAt}</small>
          </button>
        {:else}
          <div class="city-empty-state"><strong>No city resident records</strong><span>Live operations data is still available from the dashboard snapshot.</span></div>
        {/each}
      </div>
    </div>
    <div class="city-panel span-2">
      <div class="panel-title">Live Residents</div>
      {@render CityResidentList({ rows: cityResidents })}
    </div>
  </section>
{/snippet}

{#snippet ResidentTriageStrip({ limit }: { limit: number })}
  <section class={`city-panel resident-triage-strip tone-${cityResidentTriage.tone}`}>
    <div class="row">
      <div>
        <div class="panel-title">Resident Triage</div>
        <strong>{cityResidentTriage.headline}</strong>
        <small>{cityResidentTriage.detail}</small>
      </div>
      <span class={`tag ${cityResidentTriage.tone}`}>{cityResidentTriage.urgentResidents}/{cityResidentTriage.totalResidents}</span>
    </div>
    <div class="resident-triage-grid">
      <article class={`resident-triage-bucket tone-${cityResidentDemoPick.tone}`}>
        <div class="resident-triage-bucket-head">
          <span class={`tag ${cityResidentDemoPick.tone}`}>{cityResidentDemoPick.label}</span>
          <strong>{cityResidentDemoPick.action}</strong>
        </div>
        <small>Act from: {cityResidentDemoPick.target}</small>
        <small>{cityResidentDemoPick.detail}</small>
        <div class="story-evidence-list resident-triage-residents" aria-label="Demo pick resident">
          {#if cityResidentDemoPick.residentName}
            <button class="resident-triage-link" onclick={() => cityResidentDemoPick.residentName && cityNav(`/residents/${encodeURIComponent(residentSlug(cityResidentDemoPick.residentName))}`)}>
              {residentDisplayName(cityResidentDemoPick.residentName)}
            </button>
          {:else}
            <span>waiting</span>
          {/if}
        </div>
      </article>
      {#each visibleResidentTriageBuckets(cityResidentTriage, limit) as bucket (bucket.key)}
        <article
          id={`resident-triage-${bucket.key}`}
          class={`resident-triage-bucket tone-${bucket.count > 0 ? bucket.tone : 'ok'}`}
          class:focused={cityResidentTriageFocus === bucket.key}
          aria-current={cityResidentTriageFocus === bucket.key ? 'true' : undefined}
        >
          <div class="resident-triage-bucket-head">
            <span class={`tag ${bucket.count > 0 ? bucket.tone : 'ok'}`}>{bucket.count}</span>
            <strong>{bucket.label}</strong>
          </div>
          <small>{bucket.detail}</small>
          <div class="story-evidence-list resident-triage-residents" aria-label={`${bucket.label} residents`}>
            {#each bucket.residents as name}
              <button class="resident-triage-link" onclick={() => cityNav(`/residents/${encodeURIComponent(residentSlug(name))}`)}>{residentDisplayName(name)}</button>
            {:else}
              <span>clear</span>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet CityResidentProfile()}
  <section class="city-page-head">
    <p class="kicker">Resident</p>
    <h1>{selectedCityResidentDisplay()}</h1>
  </section>
  {#if cityResident || cityResidentReadModel}
    <section class="city-dashboard-grid">
      <div class="city-panel span-2">
        <div class="panel-title">Public State</div>
        <div class="city-resident-profile-grid">
          {#if cityResident}
            {#each residentPublicStateTiles(cityResident, { economyGp: cityResidentEconomyGpEvidence }) as tile (tile.label)}
              <span><small>{tile.label}</small><strong class={tile.tone || ''}>{tile.value}</strong>{#if tile.detail}<small>{tile.detail}</small>{/if}</span>
            {/each}
          {:else}
            <span><small>Status</small><strong>{cityResidentReadModel?.status || 'unknown'}</strong></span>
            <span><small>AP</small><strong>{cityResidentReadModel?.currentAttention === undefined ? '-' : `${cityResidentReadModel.currentAttention} AP`}</strong><small>Attention Points from the public resident projection.</small></span>
          {/if}
          <span><small>Vitals</small><strong>{cityResident ? residentVitalsLabel(cityResident) : '-'}</strong></span>
          <span><small>Position</small><strong>{cityResident?.position ? formatPosition(cityResident.position) : '-'}</strong></span>
        </div>
        <div class="city-copy-block">
          <strong>{cityResidentReadModel?.goal || 'No public goal recorded'}</strong>
          <p>{cityResidentReadModel?.latestThought || 'No resident post has been projected yet.'}</p>
        </div>
        {#if cityResidentEconomyMoment}
          <div class="city-record-list compact">
            <article>
              <span class={`tag ${cityResidentEconomyMoment.tone}`}>{cityResidentEconomyMoment.label}</span>
              <div>
                <strong>{cityResidentEconomyMoment.title}</strong>
                <small>{cityResidentEconomyMoment.detail}</small>
              </div>
            </article>
          </div>
        {/if}
        {#if cityResidentEconomyReceipts.length}
          <div class="city-record-list compact" aria-label="AP/GP receipt trail">
            {#each cityResidentEconomyReceipts as receipt (receipt.source + ':' + receipt.id)}
              <article>
                <span class="tag ok">{receipt.source}</span>
                <div>
                  <strong>{receipt.kind} · {receipt.deltaLabel}</strong>
                  <small>{receipt.refLabel} · {timeAgo(receipt.ts)}</small>
                  {#if receipt.note}
                    <small>{receipt.note}</small>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
      {#if cityResident}
        {@const agencyCue = residentAgencyCue(cityResident, {
          benchmark: cityResidentBenchmarkStatus,
          economyGp: cityResidentEconomyGpEvidence,
          goalContract: cityResidentGoalContract,
          storyteller: cityResidentStorySignal,
        })}
        {@const nextStepCue = residentNextStepCue(cityResident, {
          benchmark: cityResidentBenchmarkStatus,
          economyGp: cityResidentEconomyGpEvidence,
          storyteller: cityResidentStorySignal,
        })}
        {@const livenessDetail = residentLivenessDetail(cityResident, {
          benchmark: cityResidentBenchmarkStatus,
          economyGp: cityResidentEconomyGpEvidence,
          goalContract: cityResidentGoalContract,
          storyteller: cityResidentStorySignal,
        })}
        {@const liveMoment = residentLiveMoment(cityResident)}
        <div class={`city-panel span-2 resident-liveness-detail tone-${livenessDetail.tone}`}>
          <div class="row">
            <div>
              <div class="panel-title">Liveness Detail</div>
              <strong>{livenessDetail.headline}</strong>
              <small>{livenessDetail.moment}</small>
            </div>
            <span class={`tag ${livenessDetail.tone}`}>{livenessDetail.tone}</span>
          </div>
          <div class="city-copy-block">
            <strong>{livenessDetail.nextAction}</strong>
            <p>{livenessDetail.nextDetail}</p>
            <small>Act from: {livenessDetail.nextTarget}</small>
          </div>
          {@render ResidentLoopFactGrid({ facts: livenessDetail.facts })}
        </div>
        <div class="city-panel span-2">
          <div class="row">
            <div class="panel-title">Resident Intelligence Loop</div>
            <button onclick={() => cityResident && debugNav(residentDebugRoute(cityResident.name))}>Open Ops View</button>
          </div>
          {@render ResidentLoopFactGrid({ facts: residentIntelligenceFacts(cityResident, { economyGp: cityResidentEconomyGpEvidence }) })}
          <div class="city-empty-state subtle">
            <strong>{residentLoopSummaryLine(cityResident, { economyGp: cityResidentEconomyGpEvidence })}</strong>
            <span>GP is shown only when coin-995 inventory evidence appears in the live dashboard snapshot.</span>
          </div>
        </div>
        <div class="city-panel span-2">
          <div class="panel-title">Memory Evidence</div>
          {@render ResidentLoopFactGrid({ facts: residentMemoryEvidenceFacts(cityResident) })}
        </div>
        <div class="city-panel span-2">
          <div class="panel-title">Resident Intent</div>
          {@render ResidentLoopFactGrid({ facts: residentIntentFacts(cityResident, { economyGp: cityResidentEconomyGpEvidence, goalContract: cityResidentGoalContract, storyteller: cityResidentStorySignal }) })}
          <div class="city-record-list compact">
            <article>
              <span class={`tag ${nextStepCue.tone}`}>{nextStepCue.label}</span>
              <div>
                <strong>{nextStepCue.action}</strong>
                <small>{nextStepCue.detail}</small>
                <small>Act from: {nextStepCue.target}</small>
              </div>
            </article>
            <article>
              <span class={`tag ${liveMoment.tone}`}>{liveMoment.label}</span>
              <div>
                <strong>{liveMoment.title}</strong>
                <small>{liveMoment.detail}</small>
              </div>
            </article>
          </div>
          <div class="city-empty-state subtle">
            <strong>{agencyCue.summary}</strong>
            <span>Intent, support need, action, speech, and Library memory are read-only dashboard signals.</span>
          </div>
        </div>
        <div class="city-panel span-2">
          <div class="panel-title">Model + Goal Contract</div>
          <div class="city-resident-profile-grid">
            <span><small>Model profile</small><strong>{residentModelProfileLabel(cityResident)}</strong></span>
            <span><small>Endpoint</small><strong>{residentEndpointLabel(cityResident)}</strong></span>
            <span><small>SPARK module</small><strong>{residentSparkLabel(cityResident)}</strong></span>
            <span><small>Module source</small><strong>{residentSparkDetail(cityResident)}</strong></span>
            <span><small>Current plan</small><strong>{residentPlanLabel(cityResident)}</strong></span>
            <span><small>Recent action</small><strong>{residentActionLabel(cityResident)}</strong></span>
          </div>
          <div class="city-copy-block">
            <span class={`tag ${cityResidentGoalContract.tone}`}>{cityResidentGoalContract.tone}</span>
            <strong>Goal contract: {cityResidentGoalContract.summary}</strong>
            <p>{cityResidentGoalContract.detail}</p>
            <strong>Recent speech: {residentSpeechLabel(cityResident)}</strong>
            <p>Library strategy: {residentLibraryStrategyLabel(cityResident)}</p>
          </div>
        </div>
        <div class="city-panel span-2">
          <div class="panel-title">Current Loop Checkpoints</div>
          <div class="city-empty-state subtle">
            <span>Checkpoint details include feed-relative tick freshness so stale signals are explicit.</span>
          </div>
          <div class="city-record-list">
            {#each residentLoopCheckpoints(cityResident) as checkpoint (checkpoint.key)}
              <article>
                <span class={`tag ${checkpoint.tone}`}>{checkpoint.label}</span>
                <div>
                  <strong>{checkpoint.value}</strong>
                  <small>{checkpoint.detail}</small>
                </div>
              </article>
            {/each}
          </div>
        </div>
        <div class="city-panel span-2">
          <EconomyPanel resident={cityResident.name} refreshMs={10000} />
        </div>
        <div class="city-panel">
          <div class="panel-title">Proof Pulse</div>
          <div class="city-record-list">
            <article>
              <span class={`tag ${cityResidentProofPulse.tone}`}>{cityResidentProofPulse.tone}</span>
              <div>
                <strong>{cityResidentProofPulse.summary}</strong>
                <small>{cityResidentProofPulse.detail}</small>
                <small>goal: {cityResidentGoalContract.summary} · story: {cityResidentStorySignal.summary} · benchmark: {cityResidentBenchmarkStatus.summary}</small>
              </div>
            </article>
          </div>
        </div>
        <div class="city-panel">
          <div class="panel-title">Capability Warnings</div>
          <div class="city-record-list">
            {#each residentOperatorWarnings(cityResident, cityResidentBenchmarkStatus, { economyGp: cityResidentEconomyGpEvidence }) as warning, index (warning.summary + index)}
              <article>
                <span class={`tag ${warning.tone}`}>{warning.tone}</span>
                <div>
                  <strong>{warning.summary}</strong>
                  <small>{warning.detail}</small>
                </div>
              </article>
            {/each}
          </div>
        </div>
        <div class="city-panel span-2">
          <div class="panel-title">Storyteller Grounded Events</div>
          <div class="city-record-list">
            <article>
              <span class={`tag ${cityResidentStorySignal.tone}`}>{cityResidentStorySignal.tone}</span>
              <div>
                <strong>{cityResidentStorySignal.summary}</strong>
                <small>{cityResidentStorySignal.detail}</small>
              </div>
            </article>
            {#each cityResidentStoryEvents as evidence (evidence.digest.runId + ':' + evidence.event.ref)}
              {@const myth = storytellerMythCard(evidence.event)}
              <article>
                <span class={`tag ${storytellerEventTone(evidence.event)}`}>{evidence.event.importance || 'event'}</span>
                <div class="story-event-copy">
                  <strong>{myth.title}</strong>
                  <small>{storytellerEventMeta(evidence.event)} · {evidence.digest.runId} · {evidence.event.ts ? timeAgo(evidence.event.ts) : evidence.digest.builtAt ? timeAgo(evidence.digest.builtAt) : '-'}</small>
                  {#if myth.body}
                    <p>{myth.body}</p>
                  {/if}
                  {#if myth.evidenceLabels.length}
                    <div class="story-evidence-list" aria-label="Grounded evidence">
                      {#each myth.evidenceLabels as label}
                        <span>{label}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </article>
            {:else}
              <div class="city-empty-state"><strong>No resident-specific digest refs</strong><span>Run Storyteller digest generation to capture grounded resident events.</span></div>
            {/each}
          </div>
        </div>
      {:else if cityResidentReadModel}
        <div class="city-panel span-2">
          <div class="row">
            <div class="panel-title">Resident Intelligence Loop</div>
            <span class={`tag ${cityResidentLoopAvailability.tone}`}>{cityResidentLoopAvailability.tone}</span>
          </div>
          <div class="city-copy-block">
            <strong>{cityResidentLoopAvailability.title}</strong>
            <p>{cityResidentLoopAvailability.detail}</p>
            <small>Live model/endpoint/SPARK and checkpoint traces are pending from the runtime bridge.</small>
          </div>
          <div class="city-resident-profile-grid">
            <span><small>Goal</small><strong>{cityResidentReadModel.goal || 'No public goal recorded'}</strong></span>
            <span><small>Attention</small><strong>{cityResidentReadModel.currentAttention ?? '-'}</strong></span>
            <span><small>Latest seen</small><strong>{cityResidentReadModel.latestSeenAt ? `${timeAgo(cityResidentReadModel.latestSeenAt)} ago` : '-'}</strong></span>
            <span><small>Latest post</small><strong>{cityResidentPosts[0]?.createdAt ? `${timeAgo(cityResidentPosts[0].createdAt)} ago` : '-'}</strong></span>
          </div>
        </div>
      {/if}
      <div class="city-panel">
        <div class="panel-title">Grant Attention</div>
        <div class={`city-copy-block resident-ap-support tone-${cityResidentApSupport.tone}`}>
          <strong>{cityResidentApSupport.title}</strong>
          <p>{cityResidentApSupport.detail}</p>
          <small>{cityResidentApSupport.suggestedAp > 0 ? `${cityResidentApSupport.suggestedAp.toLocaleString()} AP suggested` : 'No AP grant suggested'} · {cityResidentApSupport.suggestedMemo}</small>
          {#if citySession.authenticated && cityResidentApSupport.suggestedAp > 0}
            <div class="resident-ap-support-actions">
              <button type="button" onclick={() => applyApSupportSuggestion(cityResidentApSupport)}>{cityResidentApSupport.actionLabel}</button>
            </div>
          {/if}
        </div>
        {#if citySession.authenticated}
          <div class="city-form-grid single">
            <label>AP <input bind:value={grantAttentionAp} inputmode="numeric" /></label>
            <label>Memo <input bind:value={grantAttentionMemo} placeholder="optional" /></label>
            <button disabled={actionBusy} onclick={() => grantResidentAttention(cityResident?.name || cityResidentReadModel?.nullcityResidentId || cityResidentId)}>Grant</button>
          </div>
        {:else}
          {@render CityAuthCta({ label: 'Login to grant AP' })}
        {/if}
      </div>
      <div class="city-panel">
        <div class="panel-title">AP/GP Trade Prompt</div>
        {#if citySession.authenticated}
          <div class="city-form-grid single">
            <label>Offer
              <select bind:value={tradeOfferResource}>
                <option value="AP">AP</option>
                <option value="GP">GP</option>
              </select>
            </label>
            <label>Amount <input bind:value={tradeOfferAmount} inputmode="numeric" /></label>
            <label>Request <input bind:value={tradeRequestedItem} placeholder="coin-995 GP or NCRI" /></label>
            <button disabled={actionBusy} onclick={() => createResidentTradePrompt(cityResident?.name || cityResidentReadModel?.nullcityResidentId || cityResidentId)}>Send Prompt</button>
          </div>
          <div class="city-empty-state subtle">
            <strong>Dashboard trade prompts debit city AP/GP immediately.</strong>
            <span>Completed GP is trusted only when Null City reports accepted status or coin-995 evidence.</span>
          </div>
        {:else}
          {@render CityAuthCta({ label: 'Login to trade AP/GP' })}
        {/if}
      </div>
      <div class="city-panel span-2">
        <div class="panel-title">Resident Trade History</div>
        <div class="city-record-list">
          {#each cityResidentTrades as trade (trade.id)}
            <article>
              <span class={`tag ${residentTradeTone(trade.status)}`}>{trade.status}</span>
              <div>
                <strong>{residentTradeSummary(trade).title}</strong>
                <small>{residentTradeSummary(trade).detail} · {timeAgo(trade.updatedAt)}</small>
              </div>
            </article>
          {:else}
            <div class="city-empty-state"><strong>No AP/GP trade prompts</strong><span>Human support prompts and resident exchange requests will appear here.</span></div>
          {/each}
        </div>
      </div>
      <div class="city-panel span-2">
        <div class="panel-title">Posts</div>
        <div class="city-record-list">
          {#each cityResidentPosts as post (post.id)}
            <article>
              <span class="tag">{post.source}</span>
              <div>
                <strong>{post.body}</strong>
                <small>{post.createdAt ? timeAgo(post.createdAt) : 'undated'}</small>
              </div>
            </article>
          {:else}
            <div class="city-empty-state"><strong>No public posts</strong><span>Resident status posts and overseer notes appear here.</span></div>
          {/each}
        </div>
      </div>
    </section>
  {:else}
    {@const missingState = residentDetailEmptyState({
      loading,
      residentCount: cityResidents.length,
      hasLiveHints: residentRosterHasLiveHints(),
      cityDataError,
    })}
    <section class="city-panel">
      <div class="city-empty-state resident-sync-state">
        <strong>{missingState.title}</strong>
        <span>{missingState.detail}</span>
        <div class="resident-sync-actions">
          <button onclick={() => cityNav('/story')}>Story</button>
          <button onclick={() => debugNav('/residents')}>Ops Roster</button>
        </div>
      </div>
    </section>
  {/if}
{/snippet}

{#snippet ResidentLoopFactGrid({ facts }: { facts: ResidentLoopFact[] })}
  <div class="resident-loop-grid">
    {#each facts as fact}
      <span class:ok={fact.tone === 'ok'} class:warn={fact.tone === 'warn'} class:fail={fact.tone === 'fail'}>
        <small>{fact.label}</small>
        <strong>{fact.value}</strong>
        {#if fact.detail}
          <em>{fact.detail}</em>
        {/if}
      </span>
    {/each}
  </div>
{/snippet}

{#snippet CityInbox()}
  <section class="city-page-head">
    <p class="kicker">Inbox</p>
    <h1>Messages</h1>
  </section>
  {#if !citySession.authenticated}
    {@render CityAuthCta({ label: 'Login to view inbox' })}
  {:else}
    <section class="city-dashboard-grid">
      <div class="city-panel">
        <div class="panel-title">Threads</div>
        <div class="city-card-list compact">
          {#each cityInboxThreads as thread (thread.id)}
            <button class:active={cityInboxThreadId === thread.id} onclick={() => cityNav(`/inbox/${encodeURIComponent(thread.id)}`)}>
              <span class="tag">{thread.status}</span>
              <strong>{cityResidentLabelFromId(thread.residentId)}</strong>
              <small>{thread.latestMessage?.body || `updated ${timeAgo(thread.updatedAt)}`}</small>
            </button>
          {:else}
            <div class="city-empty-state"><strong>No unread messages</strong><span>Resident AP requests, trades, and private threads appear here.</span></div>
          {/each}
        </div>
      </div>
      <div class="city-panel span-2">
        <div class="panel-title">Conversation</div>
        {#if citySelectedThread}
          <div class="city-record-list">
            {#each citySelectedThread.messages as message (message.id)}
              <article>
                <span class="tag">{message.senderType}</span>
                <div>
                  <strong>{message.body}</strong>
                  <small>{message.messageType} · {timeAgo(message.createdAt)}</small>
                </div>
              </article>
            {:else}
              <div class="city-empty-state"><strong>No messages</strong><span>This thread has no delivered messages yet.</span></div>
            {/each}
          </div>
        {:else}
          <div class="city-empty-state"><strong>Select a thread</strong><span>Resident messages and AP-for-GP trade prompts appear in the conversation panel.</span></div>
        {/if}
      </div>
      <div class="city-panel span-2">
        <div class="panel-title">AP/GP Trade Prompts</div>
        <div class="city-record-list">
          {#each cityTrades as trade (trade.id)}
            <article>
              <span class={`tag ${residentTradeTone(trade.status)}`}>{trade.status}</span>
              <div>
                <strong>{residentTradeSummary(trade).title}</strong>
                <small>{residentTradeSummary(trade).detail} · {timeAgo(trade.updatedAt)}</small>
              </div>
              <button onclick={() => cityNav(`/residents/${encodeURIComponent(trade.residentId)}`)}>Resident</button>
            </article>
          {:else}
            <div class="city-empty-state"><strong>No trade prompts</strong><span>AP-for-GP and NCRI exchange prompts appear here after a resident or attendee opens one.</span></div>
          {/each}
        </div>
      </div>
    </section>
  {/if}
{/snippet}

{#snippet CityPrints()}
  <section class="city-page-head">
    <p class="kicker">Prints</p>
    <h1>{route === '/prints/new' ? 'New Print' : citySelectedPrint ? citySelectedPrint.title : 'Print Queue'}</h1>
  </section>
  {#if !citySession.authenticated}
    {@render CityAuthCta({ label: 'Login to request prints' })}
  {:else if route === '/prints/new'}
    <section class="city-dashboard-grid">
      <div class="city-panel span-2">
        <div class="row">
          <div class="panel-title">Request</div>
          <button class="primary" disabled={actionBusy} onclick={createPrintRequest}>Submit</button>
        </div>
        <div class="city-form-grid">
          <label class="span-2">Title <input bind:value={printTitle} placeholder="Resident miniature" /></label>
          <label>Material <input bind:value={printMaterial} placeholder="PLA" /></label>
          <label>Color <input bind:value={printColor} placeholder="black" /></label>
          <label>Quantity <input bind:value={printQuantity} inputmode="numeric" /></label>
          <label class="span-2">Description <textarea bind:value={printDescription} rows="4"></textarea></label>
          <label class="span-2">Notes <textarea bind:value={printUserNotes} rows="3"></textarea></label>
        </div>
      </div>
      <div class="city-panel">
        <div class="panel-title">File Metadata</div>
        <div class="city-form-grid single">
          <label>File name <input bind:value={printFileName} placeholder="model.stl" /></label>
          <label>MIME <input bind:value={printFileMime} /></label>
          <label>Size bytes <input bind:value={printFileSize} inputmode="numeric" /></label>
        </div>
      </div>
    </section>
  {:else if citySelectedPrint}
    <section class="city-dashboard-grid">
      <div class="city-panel span-2">
        <div class="row">
          <div class="panel-title">Request</div>
          <span class={`tag ${statusTone(citySelectedPrint.status)}`}>{citySelectedPrint.status}</span>
        </div>
        <div class="city-resident-profile-grid">
          <span><small>Material</small><strong>{citySelectedPrint.requestedMaterial || '-'}</strong></span>
          <span><small>Color</small><strong>{citySelectedPrint.requestedColor || '-'}</strong></span>
          <span><small>Qty</small><strong>{citySelectedPrint.quantity}</strong></span>
          <span><small>Quote</small><strong>{citySelectedPrint.quoteGp ? `${citySelectedPrint.quoteGp.toLocaleString()} GP` : '-'}</strong></span>
        </div>
        <div class="city-copy-block">
          <strong>{citySelectedPrint.description || 'No description supplied'}</strong>
          <p>{citySelectedPrint.userNotes || citySelectedPrint.adminNotes || 'No request notes.'}</p>
        </div>
      </div>
      <div class="city-panel">
        <div class="panel-title">Payment</div>
        {#if citySelectedPrint.quoteGp && !citySelectedPrint.gpLedgerEntryId}
          <button class="primary" disabled={actionBusy} onclick={() => citySelectedPrint && confirmPrintGp(citySelectedPrint.id)}>Confirm GP</button>
        {:else if citySelectedPrint.gpLedgerEntryId}
          <div class="city-empty-state"><strong>GP confirmed</strong><span>{citySelectedPrint.gpLedgerEntryId}</span></div>
        {:else}
          <div class="city-empty-state"><strong>Waiting for quote</strong><span>An admin quote unlocks GP confirmation.</span></div>
        {/if}
      </div>
    </section>
  {:else}
    <section class="city-dashboard-grid">
      <div class="city-panel span-2">
        <div class="row">
          <div class="panel-title">Requests</div>
          <button class="primary" onclick={() => cityNav('/prints/new')}>New Request</button>
        </div>
        <div class="city-card-list">
          {#each cityPrintRequests as request (request.id)}
            <button onclick={() => cityNav(`/prints/${encodeURIComponent(request.id)}`)}>
              <span class={`tag ${statusTone(request.status)}`}>{request.status}</span>
              <strong>{request.title}</strong>
              <small>{request.quoteGp ? `${request.quoteGp.toLocaleString()} GP` : 'unquoted'} · {request.requestedMaterial || 'material open'} · {timeAgo(request.updatedAt)}</small>
            </button>
          {:else}
            <div class="city-empty-state"><strong>No active print requests</strong><span>Quote, approval, GP burn, slicing, printing, and pickup states appear here.</span></div>
          {/each}
        </div>
      </div>
      <div class="city-panel">
        <div class="panel-title">Queue</div>
        <div class="city-queue-meter">
          <span style={`--queue-fill: ${Math.min(100, activePrintCount() * 20)}%`}></span>
        </div>
        <div class="city-resident-profile-grid">
          <span><small>Active</small><strong>{cityPrintInsights.activeRequests}</strong></span>
          <span><small>Awaiting GP</small><strong>{cityPrintInsights.awaitingPayment}</strong></span>
          <span><small>Paid no queue</small><strong>{cityPrintInsights.paidWithoutQueue}</strong></span>
          <span><small>Printing</small><strong>{cityPrintInsights.printing}</strong></span>
          <span><small>Unassigned</small><strong>{cityPrintInsights.queueHealth.unassignedActive}</strong></span>
          <span><small>Queue failed</small><strong>{cityPrintInsights.queueHealth.failed}</strong></span>
          <span><small>Orphaned</small><strong>{cityPrintInsights.queueHealth.orphaned}</strong></span>
        </div>
        <div class="city-record-list compact">
          {#each cityPrintInsights.warnings as warning, index (`${warning}:${index}`)}
            <article>
              <span class={`tag ${warning.startsWith('No queue') ? 'ok' : 'warn'}`}>{warning.startsWith('No queue') ? 'ok' : 'warn'}</span>
              <div>
                <strong>{warning}</strong>
                <small>Queue signal derived from print request and queue records.</small>
              </div>
            </article>
          {/each}
          {#each cityPrintInsights.queueHealth.blockers as blocker (blocker.id)}
            <article>
              <span class="tag warn">{blocker.status}</span>
              <div>
                <strong>{blocker.reason}</strong>
                <small>{blocker.printRequestId} · {blocker.printerId || 'no printer'} · {timeAgo(blocker.updatedAt)}</small>
              </div>
              <button onclick={() => cityNav(`/prints/${encodeURIComponent(blocker.printRequestId)}`)}>Open</button>
            </article>
          {/each}
        </div>
      </div>
      <div class="city-panel">
        <div class="panel-title">Story Canon</div>
        <div class="city-resident-profile-grid">
          <span><small>Status</small><strong>{cityPrintStorySignal.summary}</strong></span>
          <span><small>Events</small><strong>{cityPrintStorySignal.eventCount}</strong></span>
          <span><small>Age</small><strong>{cityPrintStorySignal.latestAgeMinutes === undefined ? '-' : `${cityPrintStorySignal.latestAgeMinutes}m`}</strong></span>
          <span><small>Review</small><strong>{cityPrintStorySignal.dispatchNeedsReview ? 'needed' : 'clear'}</strong></span>
        </div>
        <div class="city-record-list compact">
          <article>
            <span class={`tag ${cityPrintStorySignal.tone}`}>{cityPrintStorySignal.tone}</span>
            <div>
              <strong>{cityPrintStorySignal.summary}</strong>
              <small>{cityPrintStorySignal.detail}</small>
              {#if cityPrintStorySignal.latestRunId}
                <small>run {cityPrintStorySignal.latestRunId}</small>
              {/if}
            </div>
            <button onclick={() => cityNav('/story')}>Story</button>
          </article>
          {#each cityPrintStorySignal.events.slice(0, 3) as event (event.ref)}
            <article>
              <span class={`tag ${storytellerEventTone(event)}`}>{storytellerEventTitle(event)}</span>
              <div>
                <strong>{event.note || event.ref}</strong>
                <small>{storytellerEventMeta(event)} · {event.evidenceLabels.join(' · ') || 'grounded evidence'}</small>
              </div>
            </article>
          {/each}
        </div>
      </div>
      <div class="city-panel">
        <div class="panel-title">NCRI Signals</div>
        <div class="city-resident-profile-grid">
          <span><small>Pending</small><strong>{cityPrintInsights.ncriTrades.pending}</strong></span>
          <span><small>Accepted</small><strong>{cityPrintInsights.ncriTrades.accepted}</strong></span>
          <span><small>Failed</small><strong>{cityPrintInsights.ncriTrades.failed}</strong></span>
          <span><small>Recent</small><strong>{cityPrintInsights.ncriTrades.recent.length}</strong></span>
        </div>
        {#if citySession.admin}
          <div class="city-resident-profile-grid">
            <span><small>Registry pending</small><strong>{ncriApprovalCount('pending')}</strong></span>
            <span><small>Registry approved</small><strong>{ncriApprovalCount('approved')}</strong></span>
            <span><small>Registry available</small><strong>{ncriRedemptionCount('available')}</strong></span>
            <span><small>Registry redeemed</small><strong>{ncriRedemptionCount('redeemed')}</strong></span>
          </div>
          <div class="city-record-list compact">
            {#each cityNullcityNcriRecords.slice(0, 4) as record (record.id)}
              <article>
                <span class={`tag ${ncriTone(record)}`}>{ncriStatusLabel(record)}</span>
                <div>
                  <strong>{record.displayName}</strong>
                  <small>item {record.itemId} · {record.owner} · {timeAgo(record.updatedAt)}</small>
                </div>
              </article>
            {:else}
              <div class="city-empty-state">
                <strong>No controller NCRI records</strong>
                <span>{cityNullcityBridgeError || 'Create or transfer NCRIs through the controller API to populate this registry.'}</span>
              </div>
            {/each}
          </div>
          <div class="city-resident-profile-grid">
            <span><small>Print awaiting</small><strong>{ncriPrintQueueCount('awaiting_redemption')}</strong></span>
            <span><small>Print redeemed</small><strong>{ncriPrintQueueCount('redeemed')}</strong></span>
            <span><small>Printable</small><strong>{ncriPrintQueuePrintableCount()}</strong></span>
            <span><small>Queue bridge</small><strong>{cityNullcityNcriPrintQueue.available ? 'live' : 'offline'}</strong></span>
          </div>
          <div class="city-record-list compact">
            {#each cityNullcityNcriPrintQueue.items.slice(0, 4) as item (item.ncriId)}
              <article>
                <span class={`tag ${ncriPrintQueueTone(item)}`}>{ncriPrintQueueStatusLabel(item)}</span>
                <div>
                  <strong>{item.displayName}</strong>
                  <small>{ncriPrintQueueMeta(item)}</small>
                  {#if item.printAssetRef}
                    <small>{item.printAssetRef}</small>
                  {/if}
                </div>
              </article>
            {:else}
              <div class="city-empty-state">
                <strong>No NCRI print queue items</strong>
                <span>{cityNullcityNcriPrintQueue.error || 'Sold NCRIs enter this queue after redemption intent.'}</span>
              </div>
            {/each}
          </div>
        {/if}
        <div class="city-record-list compact">
          {#each cityPrintResidentSignals as signal (signal.residentId)}
            <article>
              <span class={`tag ${printResidentSignalTone(signal)}`}>{printResidentSignalTone(signal)}</span>
              <div>
                <strong>{printResidentSignalLabel(signal)}</strong>
                <small>{printResidentSignalDetail(signal)}</small>
                <small>{printResidentSignalProof(signal).summary}</small>
              </div>
              <button onclick={() => cityNav(`/residents/${encodeURIComponent(signal.resident?.name || signal.residentId)}`)}>Resident</button>
            </article>
          {:else}
            <div class="city-empty-state"><strong>No resident print loop signals</strong><span>NCRI registry owners and NCRI trade residents will appear here with AP/model/SPARK context.</span></div>
          {/each}
        </div>
        <div class="city-record-list compact">
          {#each cityPrintInsights.ncriTrades.recent as signal (signal.id)}
            <article>
              <span class={`tag ${residentTradeTone(signal.status)}`}>{signal.status}</span>
              <div>
                <strong>{signal.requestedItem}</strong>
                <small>{signal.residentId} · {timeAgo(signal.updatedAt)}</small>
              </div>
            </article>
          {:else}
            <div class="city-empty-state"><strong>No NCRI trade prompts</strong><span>NCRI-related AP/GP exchange requests appear here once issued.</span></div>
          {/each}
        </div>
      </div>
    </section>
  {/if}
{/snippet}

{#snippet CityLibrary()}
  <section class="city-page-head">
    <p class="kicker">Library</p>
    <h1>Souls</h1>
  </section>
  <section class="city-dashboard-grid">
    <div class="city-panel span-2">
      <div class="panel-title">Lives</div>
      <div class="city-card-list">
        {#each cityLibraryLives as life (life.id)}
          <button onclick={() => life.nullcityResidentId ? cityNav(`/residents/${encodeURIComponent(life.nullcityResidentId)}`) : undefined}>
            <span class={`tag ${life.diedAt ? 'fail' : 'ok'}`}>{life.diedAt ? 'deceased' : 'alive'}</span>
            <strong>{life.nullcityResidentId}</strong>
            <small>{life.goalSummary || life.epitaph || `${life.meaningfulEvents.length} meaningful events`}</small>
          </button>
        {:else}
          <div class="city-empty-state"><strong>No projected soul lives</strong><span>Born residents and memorialized souls appear here.</span></div>
        {/each}
      </div>
    </div>
    <div class="city-panel">
      <div class="panel-title">Soul Files</div>
      {@render SoulGrid({ souls })}
    </div>
    <div class="city-panel">
      <div class="row">
        <div class="panel-title">Storyteller</div>
        <button onclick={() => cityNav('/story')}>Open Feed</button>
      </div>
      <div class="city-copy-block">
        <strong>{cityLibraryStoryPreview.title}</strong>
        <p>{cityLibraryStoryPreview.body}</p>
      </div>
      <div class="city-resident-profile-grid">
        <span><small>Run</small><strong>{cityLibraryStoryPreview.runLabel}</strong></span>
        <span><small>Events</small><strong>{cityLibraryStoryPreview.eventLabel}</strong></span>
        <span><small>Status</small><strong>{cityLibraryStoryPreview.statusLabel}</strong></span>
      </div>
      <div class={`notice ${cityLibraryStoryPreview.tone === 'warn' ? 'amber' : ''}`}>{cityLibraryStoryPreview.detail}</div>
    </div>
  </section>
{/snippet}

{#snippet CityAdmin()}
  <section class="city-page-head">
    <p class="kicker">Admin</p>
    <h1>Operations</h1>
  </section>
  {#if citySession.admin}
    <section class="city-entry-grid">
      <button class="city-entry tone-amber" onclick={() => cityNav('/admin/print-queue')}><span>Print Queue</span><strong>{cityPrintQueue.length}</strong><small>Printer board and job controls</small></button>
      <button class="city-entry tone-teal" onclick={() => cityNav('/admin/printers')}><span>Printers</span><strong>{cityPrinters.length}</strong><small>Bambu, Snapmaker, and manual adapters</small></button>
      <button class="city-entry tone-green" onclick={() => cityNav('/admin/souls')}><span>Soul Moderation</span><strong>{cityProposals.filter(proposal => proposal.status === 'ready_to_birth').length}</strong><small>Birth controls and moderation</small></button>
      <button class="city-entry tone-blue" onclick={() => cityNav('/admin/economy')}><span>Economy</span><strong>audit</strong><small>AP/GP grants and adjustments</small></button>
      <button class="city-entry tone-mauve" onclick={() => debugNav('/')}><span>Debug</span><strong>ops</strong><small>Resident operations dashboard</small></button>
    </section>
    {#if route === '/admin/printers'}
      <section class="city-dashboard-grid">
        <div class="city-panel span-2">
          <div class="panel-title">Printer Records</div>
          <div class="city-card-list">
            {#each cityPrinters as printer (printer.id)}
              <article class="city-admin-row">
                <span class={`tag ${printer.enabled ? 'ok' : 'warn'}`}>{printer.enabled ? 'enabled' : 'disabled'}</span>
                <strong>{printer.name}</strong>
                <small>{printer.kind} · {printer.adapter} · {printer.bridgeId || 'no bridge'}</small>
                <button disabled={actionBusy} onclick={() => testPrinter(printer.id)}>Test</button>
              </article>
            {:else}
              <div class="city-empty-state"><strong>No printers configured</strong><span>Add Bambu P2S, Snapmaker U1, or manual printer records.</span></div>
            {/each}
          </div>
        </div>
        <div class="city-panel">
          <div class="panel-title">Add Printer</div>
          <div class="city-form-grid single">
            <label>Name <input bind:value={printerName} /></label>
            <label>Kind
              <select bind:value={printerKind}>
                <option value="generic">Generic</option>
                <option value="bambu-p2s">Bambu P2S</option>
                <option value="snapmaker-u1">Snapmaker U1</option>
              </select>
            </label>
            <label>Adapter
              <select bind:value={printerAdapter}>
                <option value="manual">Manual</option>
                <option value="fdm-monster">FDM Monster</option>
                <option value="bambu-lan">Bambu LAN</option>
                <option value="moonraker">Moonraker</option>
                <option value="snapmaker-u1">Snapmaker U1</option>
              </select>
            </label>
            <label>Bridge ID <input bind:value={printerBridgeId} /></label>
            <label>Notes <textarea bind:value={printerNotes} rows="3"></textarea></label>
            <label class="checkbox-line"><input type="checkbox" bind:checked={printerEnabled} /> Enabled</label>
            <button class="primary" disabled={actionBusy} onclick={savePrinter}>Save Printer</button>
          </div>
        </div>
      </section>
    {:else if route === '/admin/print-queue'}
      <section class="city-dashboard-grid">
        <div class="city-panel span-2">
          <div class="panel-title">Queue</div>
          <div class="city-record-list">
            {#each cityPrintQueue as item (item.id)}
              <article>
                <span class={`tag ${statusTone(item.status)}`}>{item.status}</span>
                <div>
                  <strong>{item.printRequestId}</strong>
                  <small>priority {item.priority} · printer {item.printerId || 'unassigned'} · position {item.queuePosition ?? '-'}</small>
                </div>
              </article>
            {:else}
              <div class="city-empty-state"><strong>No queue entries</strong><span>Paid and approved print jobs will appear here.</span></div>
            {/each}
          </div>
        </div>
        <div class="city-panel">
          <div class="panel-title">Queue Diagnostics</div>
          <div class="city-resident-profile-grid">
            <span><small>Unassigned</small><strong>{cityPrintInsights.queueHealth.unassignedActive}</strong></span>
            <span><small>Failed</small><strong>{cityPrintInsights.queueHealth.failed}</strong></span>
            <span><small>Orphaned</small><strong>{cityPrintInsights.queueHealth.orphaned}</strong></span>
            <span><small>Printing</small><strong>{cityPrintInsights.printing}</strong></span>
          </div>
          <div class="city-record-list compact">
            {#each cityPrintInsights.queueHealth.blockers as blocker (blocker.id)}
              <article>
                <span class="tag warn">{blocker.status}</span>
                <div>
                  <strong>{blocker.reason}</strong>
                  <small>{blocker.printRequestId} · {blocker.printerId || 'no printer'} · {timeAgo(blocker.updatedAt)}</small>
                </div>
              </article>
            {:else}
              <div class="city-empty-state"><strong>No queue blockers</strong><span>Queue assignment and request linkage look healthy.</span></div>
            {/each}
          </div>
        </div>
        <div class="city-panel">
          <div class="panel-title">Quote Request</div>
          <div class="city-card-list compact">
            {#each cityPrintRequests as request (request.id)}
              <button class:active={citySelectedPrint?.id === request.id} onclick={() => (citySelectedPrint = request)}>
                <span class={`tag ${statusTone(request.status)}`}>{request.status}</span>
                <strong>{request.title}</strong>
                <small>{request.quoteGp ? `${request.quoteGp} GP` : 'unquoted'}</small>
              </button>
            {/each}
          </div>
          {#if citySelectedPrint}
            <div class="city-form-grid single">
              <label>GP quote <input bind:value={printQuoteGp} inputmode="numeric" /></label>
              <label>Admin notes <textarea bind:value={printQuoteNotes} rows="3"></textarea></label>
              <button class="primary" disabled={actionBusy} onclick={() => citySelectedPrint && quotePrintRequest(citySelectedPrint.id)}>Save Quote</button>
            </div>
          {/if}
        </div>
      </section>
    {:else if route === '/admin/economy'}
      <section class="city-dashboard-grid">
        <div class={`city-panel tone-${cityEconomyHeartbeatSummary.tone}`}>
          <div class="row">
            <div>
              <div class="panel-title">City Heartbeat</div>
              <strong>{cityEconomyHeartbeatSummary.headline}</strong>
              <small>{cityEconomyHeartbeatSummary.detail}</small>
            </div>
            <span class={`tag ${cityEconomyHeartbeatSummary.tone}`}>{cityEconomyHeartbeatSummary.degradedLabel}</span>
          </div>
          <div class="city-resident-profile-grid">
            <span><small>Events</small><strong>{cityEconomyHeartbeat.heartbeat?.economyEventCount?.toLocaleString() || '-'}</strong></span>
            <span><small>Uptime</small><strong>{cityEconomyHeartbeat.heartbeat ? `${Math.round(cityEconomyHeartbeat.heartbeat.controllerUptimeSec / 60)}m` : '-'}</strong></span>
            <span><small>Last Event</small><strong>{cityEconomyHeartbeat.heartbeat?.lastEconomyEventKind?.replace(/_/g, ' ') || '-'}</strong></span>
            <span><small>Digest</small><strong>{cityEconomyHeartbeat.heartbeat?.lastDigestBuiltAt ? `${timeAgo(cityEconomyHeartbeat.heartbeat.lastDigestBuiltAt)} ago` : '-'}</strong></span>
          </div>
        </div>
        <div class={`city-panel tone-${cityEconomyListingsSummary.tone}`}>
          <div class="row">
            <div>
              <div class="panel-title">Listed NCRIs</div>
              <strong>{cityEconomyListingsSummary.headline}</strong>
              <small>{cityEconomyListingsSummary.detail}</small>
            </div>
            <span class={`tag ${cityEconomyListingsSummary.tone}`}>{cityEconomyListings.available ? 'listed' : 'bridge'}</span>
          </div>
          <div class="city-record-list compact">
            {#each cityEconomyListings.listings.slice(0, 4) as listing (listing.ncriId)}
              <article>
                <span class="tag ok">coin {listing.itemId}</span>
                <div>
                  <strong>{listing.displayName}</strong>
                  <small>{listing.sourceResidentName || listing.owner} · updated {timeAgo(listing.updatedAt)} ago</small>
                </div>
              </article>
            {:else}
              <div class="city-empty-state"><strong>No available NCRI listings</strong><span>Approved, unredeemed resident items appear here once the controller lists them.</span></div>
            {/each}
          </div>
        </div>
        <div class="city-panel">
          <div class="panel-title">Grant Points</div>
          <div class="city-form-grid single">
            <label>City user ID <input bind:value={adminGrantCityUserId} placeholder={citySession.cityUserId || 'current admin'} /></label>
            <label>Resource
              <select bind:value={adminGrantResource}>
                <option value="AP">AP</option>
                <option value="GP">GP</option>
              </select>
            </label>
            <label>Amount <input bind:value={adminGrantAmount} inputmode="numeric" /></label>
            <label>Memo <textarea bind:value={adminGrantMemo} rows="3"></textarea></label>
            <button class="primary" disabled={actionBusy} onclick={grantPoints}>Grant</button>
          </div>
        </div>
        <div class="city-panel">
          <div class="panel-title">Resident GP -> AP</div>
          <div class="city-form-grid single">
            <label>Resident ID <input bind:value={exchangeResidentId} placeholder="res:qa-angler" /></label>
            <label>AP Amount <input bind:value={exchangeApAmount} inputmode="numeric" /></label>
            <label>GP Amount <input bind:value={exchangeGpAmount} inputmode="numeric" /></label>
            <label>City user ID <input bind:value={exchangeCityUserId} placeholder={citySession.cityUserId || 'operator'} /></label>
            <button class="primary" disabled={actionBusy} onclick={exchangeResidentGpForAp}>Exchange</button>
          </div>
          {#if exchangeResult}
            <div class="city-record-list compact">
              <article>
                <span class={`tag ${exchangeResult.status === 'complete' ? 'ok' : 'warn'}`}>{exchangeResult.status}</span>
                <div>
                  <strong>{exchangeResult.gpAmount.toLocaleString()} GP -> {exchangeResult.apAmount.toLocaleString()} AP</strong>
                  <small>{exchangeResult.resident} · {exchangeResult.gpEvidence ? `${exchangeResult.gpEvidence.remainingAmount.toLocaleString()} GP left` : exchangeResult.failureReason || 'operator review'}</small>
                </div>
              </article>
            </div>
          {/if}
        </div>
        <div class="city-panel span-2">
          <div class="panel-title">Recent Ledger</div>
          <div class="city-record-list">
            {#each cityLedger as entry (entry.id)}
              <article>
                <span class={`tag ${entry.delta >= 0 ? 'ok' : 'warn'}`}>{ledgerDelta(entry)}</span>
                <div><strong>{entry.memo || entry.sourceType}</strong><small>{entry.cityUserId} · {timeAgo(entry.createdAt)}</small></div>
              </article>
            {:else}
              <div class="city-empty-state"><strong>No loaded ledger rows</strong><span>Open Profile first to load the current admin ledger.</span></div>
            {/each}
          </div>
        </div>
      </section>
    {:else if route === '/admin/souls'}
      <section class="city-dashboard-grid">
        <div class="city-panel">
          <div class="panel-title">Attendee Embassy</div>
          <div class="city-card-list">
            {#each cityProposals as proposal (proposal.id)}
              <button onclick={() => cityNav(`/embassy/${encodeURIComponent(proposal.id)}`)}>
                <span class={`tag ${statusTone(proposal.status)}`}>{proposal.status}</span>
                <strong>{proposal.displayName}</strong>
                <small>{proposal.contributedAttention.toLocaleString()} / {proposal.attentionThreshold.toLocaleString()} AP</small>
              </button>
            {:else}
              <div class="city-empty-state"><strong>No attendee proposals</strong><span>Submitted proposals appear here after attendees use the Embassy.</span></div>
            {/each}
          </div>
        </div>
        <div class="city-panel span-2">
          <div class="row">
            <div class="panel-title">Controller Birth Queue</div>
            <span class={`tag ${cityNullcityBridgeAvailable ? 'ok' : 'warn'}`}>{cityNullcityBridgeAvailable ? 'connected' : 'not configured'}</span>
          </div>
          {#if !cityNullcityBridgeAvailable}
            <div class="city-empty-state">
              <strong>Null City control bridge unavailable</strong>
              <span>Connect the Null City control bridge on the dashboard server to approve, reject, or birth controller-backed proposals.</span>
              {#if cityNullcityBridgeError}<small>{cityNullcityBridgeError}</small>{/if}
            </div>
          {:else}
            <div class="city-card-list">
              {#each cityNullcityProposals as proposal (proposal.id)}
                <article class="city-admin-row">
                  <span class={`tag ${statusTone(proposal.status)}`}>{proposal.status}</span>
                  <div>
                    <strong>{proposal.residentName}</strong>
                    <small>{proposal.apFunded.toLocaleString()} / {proposal.apThreshold.toLocaleString()} AP · {nullcityProposalRemaining(proposal).toLocaleString()} remaining</small>
                  </div>
                  <div class="city-proposal-meter" aria-label="AP funding progress">
                    <span style={`--queue-fill: ${nullcityProposalProgress(proposal)}%`}></span>
                  </div>
                  <p class="city-admin-note">{proposal.goalText}</p>
                  <label class="city-row-input">Admin notes <textarea value={nullcityProposalAdminNotes[proposal.id] || ''} rows="2" placeholder="Reason for approve/reject" oninput={(event) => setNullcityProposalNotes(proposal.id, event.currentTarget.value)}></textarea></label>
                  <div class="actions">
                    <button disabled={actionBusy || proposal.status !== 'threshold_crossed'} onclick={() => approveNullcityProposal(proposal.id)}>Approve</button>
                    <button class="danger" disabled={actionBusy || !canRejectNullcityProposal(proposal.status)} onclick={() => rejectNullcityProposal(proposal.id)}>Reject</button>
                    <button class="primary" disabled={actionBusy || proposal.status !== 'approved'} onclick={() => birthNullcityProposal(proposal.id)}>Birth</button>
                  </div>
                </article>
              {:else}
                <div class="city-empty-state"><strong>No controller proposals</strong><span>Controller-backed proposals appear here once the bridge returns a proposal queue.</span></div>
              {/each}
            </div>
          {/if}
        </div>
      </section>
    {/if}
  {:else}
    {@render CityAuthCta({ label: 'Admin session required' })}
  {/if}
{/snippet}

{#snippet CityLogin()}
  <section class="city-page-head">
    <p class="kicker">Session</p>
    <h1>Login</h1>
  </section>
  <section class="city-panel">
    <div class="city-empty-state">
      <strong>{cityLoginUrlReady ? 'Attendee login ready' : 'Attendee login not connected'}</strong>
      <span>{cityLoginUrlReady ? 'Open the Onion DAO login to unlock AP, GP, inbox, Embassy actions, and print workflows.' : 'Ask event staff for the attendee QR or staff login link. This dashboard remains in guest mode until attendee login is connected.'}</span>
    </div>
    {#if cityLoginUrlReady}
      <a class="city-link-button" href={citySession.loginUrl}>Open Onion DAO Login</a>
    {/if}
  </section>
{/snippet}

{#snippet CityNotFound()}
  <section class="city-page-head">
    <p class="kicker">{isLegacyOperationalRoute(route) ? 'Moved' : 'Not Found'}</p>
    <h1>{isLegacyOperationalRoute(route) ? 'Debug Route' : '404'}</h1>
  </section>
  <section class="city-panel">
    {#if isLegacyOperationalRoute(route)}
      <div class="city-empty-state">
        <strong>Operational route moved</strong>
        <span>{legacyDebugEquivalent(route)}</span>
      </div>
      <button onclick={() => debugNav(route)}>Open Debug</button>
    {:else if !isKnownCityRoute(route)}
      <div class="empty">No city route matches {route}</div>
    {/if}
  </section>
{/snippet}

{#snippet CityResidentList({ rows }: { rows: ResidentDashboardRow[] })}
  <div class="city-resident-list">
    {#each rows as row (row.name)}
      {@const benchmark = residentBenchmarkLabel(row)}
      {@const storySignal = residentStoryDigestSignal(row, cityStoryDigests)}
      {@const economyGp = residentLiveEconomyGpEvidence(cityLiveEconomy, row.name)}
      {@const scanLines = residentRosterScanLines(row, { benchmark, economyGp, storyteller: storySignal })}
      <button onclick={() => cityNav(`/residents/${encodeURIComponent(residentSlug(row.name))}`)}>
        <span class:ok={row.online} class="dot"></span>
        <strong>{residentDisplayName(row.name)}</strong>
        <small>
          {residentStoryArcLabel(row)} · {residentFeedLabel(row)}
        </small>
        {#each scanLines as line}
          <small class={`city-resident-loop-line tone-${line.tone} priority-${line.priority}`}>{line.label}: {residentLoopLine(line.text, line.limit)}</small>
        {/each}
        <em class:warn={residentNeedsApSupportSoon(row)}>{row.attention ?? '-'} AP</em>
      </button>
    {:else}
      {@const rosterHeartbeat = cityEconomyHeartbeat.heartbeat}
      {@const rosterState = residentRosterEmptyState({
        loading,
        hasLiveHints: residentRosterHasLiveHints(),
        cityDataError,
        activeResidentCount: rosterHeartbeat?.activeResidentCount ?? 0,
        residentCount: rosterHeartbeat?.residentCount ?? 0,
        gatewayOrControllerConnected: Boolean(gatewayStatus?.connected || overview?.controller.available),
        bridgeAvailable: cityEconomyHeartbeat.available || cityLiveEconomy.available,
      })}
      <div class="city-empty-state resident-sync-state">
        <strong>{rosterState.title}</strong>
        <span>{rosterState.detail}</span>
        <div class="resident-sync-actions">
          <button onclick={() => cityNav('/story')}>Story</button>
          <button onclick={() => debugNav('/residents')}>Ops Roster</button>
        </div>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet SpectatorSurface({ large }: { large: boolean })}
  <div class="observer-surface" class:large>
    <div class="spectator-frame" use:spectatorFrame={{ session: activeResidentSession, filters: spectatorFilters }} aria-label="resident spectator"></div>
    <div class="spectator-tools" aria-label="spectator view tools">
      {#if !large}
        <button class="icon-button" aria-label="Open larger spectator" title="Open larger spectator" onclick={openSpectatorModal}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
        </button>
      {/if}
      <button class="icon-button" aria-label="Zoom out spectator" title="Zoom out" disabled={spectatorZoom <= spectatorZoomMin} onclick={() => (spectatorZoom = clampSpectatorZoom(spectatorZoom - spectatorZoomStep))}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>
      </button>
      <span class="zoom-readout">{Math.round(spectatorZoom * 100)}%</span>
      <button class="icon-button" aria-label="Zoom in spectator" title="Zoom in" disabled={spectatorZoom >= spectatorZoomMax} onclick={() => (spectatorZoom = clampSpectatorZoom(spectatorZoom + spectatorZoomStep))}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
      </button>
      {#if perceptionFeedLoading}
        <span class="feed-loading" aria-label="Loading perception feed">
          <span></span><span></span><span></span>
        </span>
      {:else if !residentIsOnline()}
        <button disabled={actionBusy} class="tool-action" onclick={loginResident}>Login Resident</button>
      {:else if !activeResidentSession}
        <button disabled={actionBusy} class="tool-action" onclick={observeResident}>Start Spectator</button>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet SpectatorControls()}
  <div class="spectator-controls" aria-label="spectator display toggles">
    <label><input type="checkbox" bind:checked={showSpectatorPlayers} /> Players</label>
    <label><input type="checkbox" bind:checked={showSpectatorNpcs} /> NPCs</label>
    <label><input type="checkbox" bind:checked={showSpectatorObjects} /> Objects</label>
    <label><input type="checkbox" bind:checked={showSpectatorItems} /> Items</label>
  </div>
{/snippet}

{#snippet ResidentTable({ rows, canDelete, onselect, ondelete }: { rows: ResidentDashboardRow[]; canDelete: boolean; onselect: (path: string) => void; ondelete: (name: string) => Promise<void> })}
  <section class="table-wrap">
    <table>
      <thead><tr><th>Resident</th><th>Status</th><th>Health</th><th>Story</th><th>Stack</th><th>Thinking</th><th>Attention</th><th>Feed</th><th>Nearby</th><th>Vitals</th><th>Last Action</th><th>Actions</th></tr></thead>
      <tbody>
        {#each rows as row}
          <tr onclick={() => onselect(residentDebugRoute(row.name))}>
            <td>
              {@render ResidentNameLink({ name: row.name })}
              <small>{row.controllerId || 'uncontrolled'}</small>
            </td>
            <td><span class:ok={row.online} class="dot"></span>{row.online ? 'online' : 'offline'}</td>
            <td>
              <span class={`tag ${residentHealthTone(row)}`}>{residentHealthLabel(row)}</span>
              <small>{residentHealthDetail(row)}</small>
            </td>
            <td>
              <strong>{residentStoryArcLabel(row)}</strong>
              {#if residentStoryArcDetail(row)}
                <small>{residentStoryArcDetail(row)}</small>
              {/if}
            </td>
            <td>
              <strong>{residentStackLabel(row)}</strong>
              {#if residentStackDetail(row)}
                <small>{residentStackDetail(row)}</small>
              {/if}
            </td>
            <td>{row.thinking?.mode || 'unknown'}</td>
            <td class="num">{row.attention ?? '-'}</td>
            <td>{residentFeedLabel(row)}</td>
            <td>{residentSurroundingsLabel(row)}</td>
            <td>{residentVitalsLabel(row)}</td>
            <td>{row.body?.lastAction?.kind || row.lastEvent?.kind || '-'}</td>
            <td>
              {#if canDelete}
                <button
                  class="danger table-action"
                  disabled={actionBusy}
                  onclick={(event) => {
                    event.stopPropagation();
                    void ondelete(row.name);
                  }}
                >
                  Delete
                </button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr><td colspan="12" class="empty">No residents match the current filters</td></tr>
        {/each}
      </tbody>
    </table>
  </section>
{/snippet}

{#snippet ResidentHealthToolbar({ shown, total }: { shown: number; total: number })}
  <section class="panel resident-health-toolbar">
    <div>
      <div class="panel-title">Resident Health</div>
      <strong>{shown} / {total}</strong>
      <small>Filter by operational state or model endpoint</small>
    </div>
    <div class="resident-health-controls">
      <label>Health
        <select bind:value={residentHealthFilter}>
          <option value="all">all</option>
          <option value="needs-attention">needs attention</option>
          <option value="stuck">stuck</option>
          <option value="stale">stale feed</option>
          <option value="active-inference">thinking now</option>
          <option value="online">online</option>
          <option value="offline">offline</option>
        </select>
      </label>
      <label>Sort
        <select bind:value={residentSortMode}>
          <option value="health">health severity</option>
          <option value="attention">low attention</option>
          <option value="model">model endpoint</option>
          <option value="name">name</option>
        </select>
      </label>
      <label>Model
        <input bind:value={residentModelQuery} placeholder="qwen, qwopus, haiku" />
      </label>
    </div>
  </section>
{/snippet}

{#snippet ResidentNameLink({ name }: { name: string })}
  <button
    class="inline-link resident-name-link"
    onclick={(event) => {
      event.stopPropagation();
      debugNav(residentDebugRoute(name));
    }}
  >
    {residentDisplayName(name)}
  </button>
{/snippet}

{#snippet ResidentBrowseStrip({ name, runtime }: { name: string; runtime: RuntimeReadModel | undefined })}
  <section class="panel resident-browse-strip">
    <div class="row">
      <div>
        <div class="panel-title">Browse Resident Data</div>
        <strong>{residentDisplayName(name)}</strong>
      </div>
      <span class:ok={runtime?.online} class="tag">{runtime?.online ? 'online' : 'offline'}</span>
    </div>
    <div class="browse-actions">
      <button onclick={() => debugNav('/residents')}>Roster</button>
      <button onclick={() => debugNav(observeResidentDebugRoute(name))}>Spectator</button>
      <button onclick={() => debugNav('/souls')}>Souls</button>
      <a href={residentRuntimeApiPath(name)} target="_blank" rel="noreferrer">Runtime JSON</a>
      <a href={residentRuntimeApiPath(name, 'history')} target="_blank" rel="noreferrer">Actions</a>
      <a href={residentRuntimeApiPath(name, 'inference')} target="_blank" rel="noreferrer">Inference</a>
      <a href={residentRuntimeApiPath(name, 'memory/index')} target="_blank" rel="noreferrer">Memory</a>
      {#if residentMemoryFilePath(runtime)}
        <a href={`${residentRuntimeApiPath(name, 'memory/file')}?path=${encodeURIComponent(residentMemoryFilePath(runtime) || '')}`} target="_blank" rel="noreferrer">Memory File</a>
      {/if}
    </div>
    <div class="mini-grid resident-stack-strip">
      <span><strong>Soul</strong>{runtime?.stack?.soulTitle || runtime?.stack?.soulId || '-'}</span>
      <span><strong>Model</strong>{runtime?.stack?.model?.endpoint || runtime?.stack?.model?.model || runtime?.logs.inference.at(-1)?.endpoint || runtime?.logs.inference.at(-1)?.model || '-'}</span>
      <span><strong>SPARK</strong>{runtime?.spark?.activeModule?.id || runtime?.stack?.activeModule?.id || runtime?.stack?.configuredModules?.[0]?.id || '-'}</span>
      <span><strong>Last Action</strong>{residentLastActionLabel(runtime)}</span>
      <span><strong>Inventory</strong>{inventoryLabel(runtime)}</span>
      <span><strong>Equipment</strong>{equipmentLabel(runtime)}</span>
    </div>
  </section>
{/snippet}

{#snippet KeyValue({ data }: { data: unknown })}
  <pre>{compactJson(data)}</pre>
{/snippet}

{#snippet BodyTable({ body }: { body: BodyModel | undefined })}
  <table class="dense-table body-table">
    <tbody>
      {#each bodyRows(body) as row}
        <tr>
          <th>{row.label}</th>
          <td>{bodyValue(row.key, row.value)}</td>
        </tr>
      {:else}
        <tr><td class="empty" colspan="2">No body state reported</td></tr>
      {/each}
    </tbody>
  </table>
{/snippet}

{#snippet ModulePanel({ title, data }: { title: string; data: unknown })}
  <section class="panel">
    <div class="panel-title">{title}</div>
    <pre>{compactJson(data)}</pre>
  </section>
{/snippet}

{#snippet LogPanel({ title, rows }: { title: string; rows: unknown[] })}
  <section class="panel">
    <div class="panel-title">{title}</div>
    <div class="log-list">
      {#each rows.slice(-30).reverse() as row}
        <pre>{compactJson(row)}</pre>
      {:else}
        <div class="empty">No log entries</div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet EventReadinessPanel({ readiness }: { readiness: EventReadinessSummary | undefined })}
  <section class="panel readiness-panel">
    <div class="row">
      <div class="panel-title">Event Readiness</div>
      <span class={`tag ${readinessClass(readiness?.level)}`}>{readinessLabel(readiness?.level)}</span>
    </div>
    <div class="event-list readiness-list">
      {#each readiness?.checks || [] as check}
        {@render ReadinessCheckRow({ check })}
      {:else}
        <div class="empty">No readiness checks reported</div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet ReadinessCheckRow({ check }: { check: ReadinessCheckSummary })}
  <div class="event-row">
    <span class={`tag ${readinessClass(check.level)}`}>{check.level}</span>
    <span>
      <strong>{check.label}</strong>
      <small>{check.detail}</small>
    </span>
  </div>
{/snippet}

{#snippet PatronSummaryPanel({ summary }: { summary: PatronActivitySummary | undefined })}
  <section class="panel">
    <div class="panel-title">Patron Standing</div>
    <div class="mini-grid">
      <span><strong>Patrons</strong>{summary?.totalPatrons || 0}</span>
      <span><strong>AP held</strong>{(summary?.totalShardBalance || 0).toLocaleString()}</span>
      <span><strong>Standing pts</strong>{(summary?.totalStandingPoints || 0).toLocaleString()}</span>
      <span><strong>Allies / Officers</strong>{patronTierCount(summary, 'ally')} / {patronTierCount(summary, 'officer')}</span>
    </div>
    <div class="event-list">
      {#each summary?.patrons || [] as patron}
        {@const standing = patronBestStanding(patron)}
        <div class="event-row">
          <span class="tag">{standing?.tier || 'stranger'}</span>
          <span>
            <strong>{patron.handle}</strong>
            <small>{patron.balance.toLocaleString()} AP · {patronStandingLabel(patron)} · {patronLastActivityLabel(patron)}</small>
          </span>
        </div>
      {:else}
        <div class="empty">No patron ledger entries</div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet RelationshipSummaryPanel({ summary }: { summary: RelationshipActivitySummary | undefined })}
  <section class="panel">
    <div class="panel-title">Resident Relationships</div>
    <div class="mini-grid">
      <span><strong>Residents</strong>{summary?.residentsWithRelationships || 0}</span>
      <span><strong>Patron events</strong>{(summary?.totalPatronEvents || 0).toLocaleString()}</span>
      <span><strong>Peer ties</strong>{(summary?.totalPeerRelationships || 0).toLocaleString()}</span>
      <span><strong>Interactions</strong>{(summary?.totalPeerInteractions || 0).toLocaleString()}</span>
    </div>
    <div class="event-list">
      {#each summary?.residents || [] as row}
        <div class="event-row">
          <span class="tag">{relationshipTag(row)}</span>
          <span>
            {@render ResidentNameLink({ name: row.resident })}
            <small>{relationshipActivityLabel(row)}</small>
          </span>
        </div>
      {:else}
        <div class="empty">No Library relationship moments yet</div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet EventList({ events }: { events: Array<{ kind?: string; at?: string; text?: string }> })}
  <div class="event-list">
    {#each events.slice(-12).reverse() as event}
      <div class="event-row"><span class="tag">{event.kind || 'event'}</span><span>{event.text || timeAgo(event.at)}</span></div>
    {:else}
      <div class="empty">No recent events</div>
    {/each}
  </div>
{/snippet}

{#snippet LetterList({ letters }: { letters: RecentLetterSummary[] })}
  <div class="event-list">
    {#each letters as letter}
      <div class="event-row">
        <span class="tag">{letter.kind}</span>
        <span>
          <strong>{letter.subject}</strong>
          <small>
            {#if letter.senderResident}
              {@render ResidentNameLink({ name: letter.senderResident })}
            {:else}
              {letterResidentLabel(letter)}
            {/if}
            to {letter.recipient} · {letterDeliveryLabel(letter)} · {letter.dispatchedAt || 'undated'} ({letterTimeLabel(letter)})
          </small>
        </span>
      </div>
    {:else}
      <div class="empty">No recent patron letters</div>
    {/each}
  </div>
{/snippet}

{#snippet BenchmarkTable({ runs }: { runs: BenchmarkArtifactSummary[] })}
  <section class="table-wrap">
    <table>
      <thead><tr><th>Task</th><th>Status</th><th>Score</th><th>Mode</th><th>Module</th><th>Resident</th><th>Duration</th><th>Started</th></tr></thead>
      <tbody>
        {#each runs as run}
          <tr onclick={() => debugNav(`/benchmarks/${encodeURIComponent(run.runId)}`)}>
            <td><strong>{run.task.id}</strong><small>{run.runId}</small></td>
            <td><span class:ok={run.status === 'passed'} class:warn={run.status !== 'passed'} class="tag">{benchmarkStatusLabel(run.status)}</span></td>
            <td class="num">{formatScore(run.score)}</td>
            <td>{run.mode}</td>
            <td><strong>{run.module.id}</strong><small>{run.module.version || 'version unknown'}</small></td>
            <td>{@render ResidentNameLink({ name: run.resident })}</td>
            <td>{formatDuration(run.durationMs)}</td>
            <td>{benchmarkStartedLabel(run)}</td>
          </tr>
        {:else}
          <tr><td colspan="8" class="empty">No benchmark artifacts found</td></tr>
        {/each}
      </tbody>
    </table>
  </section>
{/snippet}

{#snippet BenchmarkLeaderboard({ rows }: { rows: BenchmarkLeaderboardRow[] })}
  <section class="panel leaderboard-panel">
    <div class="panel-title">Module Leaderboard</div>
    <div class="leaderboard-grid">
      {#each rows as row, index}
        <article class="leaderboard-card">
          <div class="row">
            <strong>{index + 1}. {row.module.id}</strong>
            <span class="tag">{row.module.version || 'version unknown'}</span>
          </div>
          <div class="leaderboard-score">
            <span>Pass Rate</span>
            <strong class:ok={row.passRate >= 0.8}>{formatRate(row.passRate)}</strong>
          </div>
          <div class="mini-grid leaderboard-stats">
            <span><strong>Progress</strong>{formatScore(row.averageScore)}</span>
            <span><strong>Runs</strong>{row.runs}</span>
            <span><strong>Tasks</strong>{row.taskCount}</span>
            <span><strong>Auto</strong>{row.autonomousRuns}</span>
            <span><strong>Avg Time</strong>{formatDuration(row.averageDurationMs)}</span>
            <span><strong>Safety</strong>{row.safetyIncidents}</span>
            <span><strong>Cleanup</strong>{row.cleanupFailures}</span>
            <span><strong>Inference</strong>{row.inferenceRequests}</span>
          </div>
          <div class="leaderboard-tasks">
            {#each row.tasks.slice(0, 4) as task}
              <span>{task.taskId}: {task.passed}/{task.runs} · {formatScore(task.averageScore)}</span>
            {/each}
          </div>
          <small>latest {benchmarkLatestLabel(row)}</small>
        </article>
      {:else}
        <div class="empty">No benchmark leaderboard data yet</div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet BenchmarkDetail({ artifact }: { artifact: BenchmarkArtifact | undefined })}
  {#if artifact}
    <section class="metrics benchmark-metrics">
      <div class="metric"><span>Status</span><strong class:ok={artifact.status === 'passed'}>{artifact.status}</strong></div>
      <div class="metric"><span>Score</span><strong>{formatScore(artifact.score)}</strong></div>
      <div class="metric"><span>Mode</span><strong>{artifact.mode}</strong></div>
      <div class="metric"><span>Duration</span><strong>{formatDuration(artifact.durationMs)}</strong></div>
    </section>
    <section class="split benchmark-detail">
      <div class="panel">
        <div class="panel-title">Run</div>
        <table class="dense-table body-table">
          <tbody>
            <tr><th>Run</th><td>{artifact.runId}</td></tr>
            <tr><th>Task</th><td>{artifact.task.id} {artifact.task.version || ''}</td></tr>
            <tr><th>Module</th><td>{artifact.module.id} {artifact.module.version || ''}</td></tr>
            <tr><th>Resident</th><td>{@render ResidentNameLink({ name: artifact.resident })}</td></tr>
            <tr><th>Model</th><td>{artifact.modelProfile || '-'}</td></tr>
            <tr><th>Started</th><td>{artifact.startedAt || '-'}</td></tr>
            <tr><th>Ended</th><td>{artifact.endedAt || '-'}</td></tr>
            {#if artifact.failureReason}
              <tr><th>Failure</th><td>{artifact.failureReason}</td></tr>
            {/if}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-title">Metrics</div>
        <div class="mini-grid benchmark-metric-list">
          {#each metricRows(artifact.metrics) as metric}
            <span><strong>{metric.key}</strong>{compactMetricValue(metric.value)}</span>
          {:else}
            <div class="empty">No metrics reported</div>
          {/each}
        </div>
      </div>
    </section>
    <section class="modules">
      <div class="panel">
        <div class="panel-title">Evidence</div>
        <div class="event-list">
          {#each benchmarkActionRows(artifact.evidence) as action}
            <div class="event-row">
              <span class:ok={action.ok === true} class:warn={action.ok === false} class="tag">{action.statusLabel}</span>
              <span>
                <strong>{action.actionLabel}</strong>
                <small>{action.effectLabel} | {action.detail}</small>
              </span>
            </div>
          {/each}
          {#each artifact.evidence.summaries || [] as summary}
            <div class="event-row"><span class="tag">proof</span><span>{summary}</span></div>
          {/each}
          {#if !benchmarkActionRows(artifact.evidence).length && !(artifact.evidence.summaries || []).length}
            <div class="empty">No evidence summaries</div>
          {/if}
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">Raw Artifact</div>
        <pre>{compactJson(artifact)}</pre>
      </div>
    </section>
  {:else}
    <section class="panel"><div class="empty">Benchmark artifact unavailable</div></section>
  {/if}
{/snippet}

{#snippet SoulGrid({ souls }: { souls: SoulSummary[] })}
  <section class="subject-grid">
    {#each souls as soul}
      <article class="card">
        <div class="row">
          {@render ResidentNameLink({ name: soul.id })}
          <span class="tag">{soul.id}</span>
        </div>
        <strong>{soulTitle(soul)}</strong>
        <p>{soul.file}</p>
        <div class="mini-grid">
          <span>hooks {soul.hooks?.length || 0}</span>
          <span>rules {soul.nervousRules?.length || 0}</span>
          <span>{soul.legacyKind || 'legacy unset'}</span>
        </div>
      </article>
    {:else}
      <div class="empty">No soul files found</div>
    {/each}
  </section>
{/snippet}

{#snippet ActivityPanel({ activity, runtime }: { activity: ReturnType<typeof buildActivitySnapshot>; runtime: RuntimeReadModel | undefined })}
  <section class:stale={activity.stale} class="panel activity-panel">
    <div class="row activity-head">
      <div>
        <div class="panel-title">SPARK Activity</div>
        <strong>{activity.statusText}</strong>
      </div>
      <span class:ok={activity.onlineLabel === 'online'} class="tag">{activity.onlineLabel}</span>
    </div>
    <div class="spark-tabs" role="tablist" aria-label="SPARK activity views">
      <button class:active={sparkActivityTab === 'activity'} role="tab" aria-selected={sparkActivityTab === 'activity'} onclick={() => (sparkActivityTab = 'activity')}>Activity</button>
      <button class:active={sparkActivityTab === 'stats'} role="tab" aria-selected={sparkActivityTab === 'stats'} onclick={() => (sparkActivityTab = 'stats')}>Stats</button>
    </div>
    {#if sparkActivityTab === 'stats'}
      {@render CharacterStatsPanel({ runtime })}
    {:else}
      <div class="spark-activity-grid">
        {@render SparkActivitySection({ title: 'Thinking', rows: thinkingActivity(runtime, activity) })}
        {@render SparkActivitySection({ title: 'Nervous System', rows: nervousActivity(runtime) })}
        {@render SparkActivitySection({ title: 'Body', rows: bodyActivity(runtime, activity) })}
      </div>
    {/if}
  </section>
{/snippet}

{#snippet SparkActivitySection({ title, rows }: { title: string; rows: SparkActivityItem[] })}
  <section class="spark-activity-section">
    <div class="panel-title">{title}</div>
    <div class="spark-activity-list">
      {#each rows as row}
        <div class="spark-activity-row">
          <span>{row.label}</span>
          <strong>{row.value}</strong>
          {#if row.detail}
            <small>{row.detail}</small>
          {/if}
        </div>
      {/each}
    </div>
  </section>
{/snippet}

{#snippet CharacterStatsPanel({ runtime }: { runtime: RuntimeReadModel | undefined })}
  <div class="stats-layout">
    <section class="stats-skills">
      <div class="panel-title">Skills</div>
      <div class="skill-grid">
        {#each skillRows(runtime) as skill}
          <div class="skill-row">
            <span>{skill.label}</span>
            <strong>{skill.level}</strong>
            <small>{Math.floor(skill.xp).toLocaleString()} xp</small>
          </div>
        {:else}
          <div class="empty">No skills reported</div>
        {/each}
      </div>
    </section>
    <section class="stats-model">
      <div class="panel-title">Character</div>
      <div class="model-frame">
        {#if statsModelStatus}
          <div class="empty">{statsModelStatus}</div>
        {/if}
        <ModelViewer glbBytes={statsModelBytes} />
      </div>
      {@render EquipmentPaperDoll({ runtime })}
    </section>
    <section class="stats-inventory">
      <div class="panel-title">Inventory</div>
      <div class="inventory-grid">
        {#each inventorySlots(runtime) as slot}
          {@render ItemSlotIcon({ slot, compact: false })}
        {/each}
      </div>
    </section>
  </div>
{/snippet}

{#snippet EquipmentPaperDoll({ runtime }: { runtime: RuntimeReadModel | undefined })}
  <div class="equipment-paper-doll" aria-label="Equipped items">
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 0), area: 'head', label: 'Head' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 1), area: 'back', label: 'Back' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 2), area: 'neck', label: 'Neck' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 13), area: 'quiver', label: 'Quiver' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 3), area: 'main-hand', label: 'Main hand' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 4), area: 'torso', label: 'Torso' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 5), area: 'off-hand', label: 'Off hand' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 7), area: 'legs', label: 'Legs' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 9), area: 'hands', label: 'Hands' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 10), area: 'feet', label: 'Feet' })}
    {@render EquipmentSlotBox({ slot: equipmentSlot(runtime, 12), area: 'ring', label: 'Ring' })}
  </div>
{/snippet}

{#snippet EquipmentSlotBox({ slot, area, label }: { slot: ItemSlot; area: string; label: string })}
  <div class:empty-slot={!slot.item} class="equipment-slot item-slot" data-area={area} title={slot.item ? `${label}: ${itemLabel(slot.item)}` : `${label}: empty`} style={itemIconStyle(slot.item)}>
    {#if slot.item}
      <span class="item-glyph">{itemShortLabel(slot.item)}</span>
      {#if slot.item.amount && slot.item.amount > 1}
        <small>{slot.item.amount}</small>
      {/if}
    {:else}
      <span class="equipment-placeholder">{label}</span>
    {/if}
  </div>
{/snippet}

{#snippet ItemSlotIcon({ slot, compact }: { slot: ItemSlot; compact: boolean })}
  <div class:compact class:empty-slot={!slot.item} class="item-slot" title={itemSlotTitle(slot)} style={itemIconStyle(slot.item)}>
    {#if slot.item}
      <span class="item-glyph">{itemShortLabel(slot.item)}</span>
      {#if slot.item.amount && slot.item.amount > 1}
        <small>{slot.item.amount}</small>
      {/if}
    {:else}
      <span class="slot-index">{slot.slot + 1}</span>
    {/if}
  </div>
{/snippet}
