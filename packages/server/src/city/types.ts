export type PointResource = 'AP' | 'GP';
export type CityRole = 'attendee' | 'admin';

export interface LandingSessionUser {
  id: string;
  email: string;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  isAdmin: boolean;
  profileClaimed: boolean;
}

export interface CityUser {
  id: string;
  landingUserId: string;
  emailSnapshot: string;
  nameSnapshot: string;
  handleSnapshot?: string | null;
  avatarUrlSnapshot?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CitySessionUser {
  id: string;
  landingUserId: string;
  email: string;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  profileClaimed: boolean;
  isAdmin: boolean;
  roles: CityRole[];
}

export interface CityProfile {
  cityUserId: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
  bio: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface PointBalance {
  resource: PointResource;
  balance: number;
  updatedAt: string;
}

export interface PointLedgerEntry {
  id: string;
  cityUserId: string;
  resource: PointResource;
  delta: number;
  balanceAfter: number;
  sourceType: string;
  sourceId: string;
  memo?: string;
  metadata: Record<string, unknown>;
  createdByCityUserId?: string;
  createdAt: string;
}

export type SoulProposalStatus =
  | 'draft'
  | 'submitted'
  | 'funding'
  | 'ready_to_birth'
  | 'birthing'
  | 'born'
  | 'rejected'
  | 'expired';

export interface SoulQuote {
  threshold: number;
  breakdown: {
    base: number;
    levels: number;
    equipment: number;
    inventory: number;
    complexity: number;
  };
}

export interface SoulProposal {
  id: string;
  proposerCityUserId: string;
  status: SoulProposalStatus;
  residentName?: string;
  displayName: string;
  goal: string;
  personality: string;
  vices: string;
  virtues: string;
  fears: string;
  voice: string;
  firstMemory: string;
  secret: string;
  appearance: Record<string, unknown>;
  startingLevels: Record<string, number>;
  startingEquipment: unknown[];
  startingInventory: unknown[];
  attentionThreshold: number;
  contributedAttention: number;
  quote: SoulQuote;
  bornResidentId?: string;
  moderationNotes?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  bornAt?: string;
}

export interface SoulContribution {
  id: string;
  proposalId: string;
  cityUserId: string;
  apAmount: number;
  ledgerEntryId: string;
  idempotencyKey?: string;
  createdAt: string;
}

export type PrintRequestStatus =
  | 'draft'
  | 'uploaded'
  | 'quoted'
  | 'awaiting_gp_confirmation'
  | 'paid'
  | 'approved'
  | 'slicing'
  | 'queued'
  | 'printing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface PrintRequest {
  id: string;
  cityUserId: string;
  status: PrintRequestStatus;
  title: string;
  description?: string;
  requestedMaterial?: string;
  requestedColor?: string;
  quantity: number;
  quoteGp?: number;
  gpLedgerEntryId?: string;
  assignedPrinterId?: string;
  adminNotes?: string;
  userNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Printer {
  id: string;
  name: string;
  kind: 'bambu-p2s' | 'snapmaker-u1' | 'generic';
  adapter: 'fdm-monster' | 'bambu-lan' | 'moonraker' | 'snapmaker-u1' | 'manual';
  bridgeId?: string;
  enabled: boolean;
  adminNotes?: string;
  capabilities: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PrintQueueEntry {
  id: string;
  printRequestId: string;
  printerId?: string;
  status: string;
  priority: number;
  queuePosition?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResidentReadModel {
  id: string;
  nullcityResidentId: string;
  displayName: string;
  status: 'alive' | 'deceased' | 'unknown';
  bornAt?: string;
  diedAt?: string;
  deathCause?: string;
  currentAttention?: number;
  goal?: string;
  latestThought?: string;
  latestStatusPostId?: string;
  latestSeenAt?: string;
  sourceProposalId?: string;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface ResidentPost {
  id: string;
  residentId: string;
  visibility: 'public' | 'hidden';
  body: string;
  source: 'resident' | 'overseer' | 'admin';
  sourceEventId?: string;
  createdAt: string;
}

export interface InboxThread {
  id: string;
  cityUserId: string;
  residentId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  latestMessage?: InboxMessage;
}

export interface InboxMessage {
  id: string;
  threadId: string;
  senderType: 'attendee' | 'resident' | 'system' | 'admin';
  senderCityUserId?: string;
  senderResidentId?: string;
  body: string;
  messageType: string;
  metadata: Record<string, unknown>;
  readAt?: string;
  deliveredToNullcityAt?: string;
  createdAt: string;
}

export interface LibrarySoulLife {
  id: string;
  residentId?: string;
  nullcityResidentId: string;
  sourceProposalId?: string;
  bornAt?: string;
  diedAt?: string;
  deathCause?: string;
  accomplishedGoal?: boolean;
  goalSummary?: string;
  meaningfulEvents: unknown[];
  epitaph?: string;
  createdAt: string;
  updatedAt: string;
}

export type ResidentTradeStatus =
  | 'pending_nullcity'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'failed';

export interface ResidentTrade {
  id: string;
  cityUserId: string;
  residentId: string;
  status: ResidentTradeStatus;
  offeredResource: PointResource;
  offeredAmount: number;
  requestedItem?: string;
  idempotencyKey?: string;
  pointLedgerEntryId: string;
  nullcityTradeId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type HumanFeedbackFeeling = 'confused' | 'okay' | 'excited';
export type HumanFeedbackMode = 'simple' | 'expert';

export interface HumanFeedback {
  id: string;
  cityUserId?: string;
  landingUserId?: string;
  displayName?: string;
  handle?: string;
  email?: string;
  feeling: HumanFeedbackFeeling;
  tryingToDo?: string;
  message: string;
  route?: string;
  pageUrl?: string;
  mode?: HumanFeedbackMode;
  residentId?: string;
  allowFollowUp: boolean;
  userAgent?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
