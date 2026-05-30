import type { PrintQueueEntry, PrintRequest, ResidentTrade, ResidentTradeStatus } from './city-api';

const closedRequestStatuses = new Set<PrintRequest['status']>(['completed', 'cancelled', 'refunded', 'failed']);
const terminalQueueStatuses = new Set(['completed', 'cancelled']);

type NcriTradeSignal = {
  id: string;
  residentId: string;
  status: ResidentTradeStatus;
  requestedItem: string;
  updatedAt: string;
};

type QueueBlockerSignal = {
  id: string;
  printRequestId: string;
  status: string;
  printerId?: string;
  updatedAt: string;
  reason: string;
};

export type PrintQueueInsightSummary = {
  activeRequests: number;
  awaitingPayment: number;
  paidWithoutQueue: number;
  inQueue: number;
  printing: number;
  warnings: string[];
  queueHealth: {
    unassignedActive: number;
    failed: number;
    orphaned: number;
    blockers: QueueBlockerSignal[];
  };
  ncriTrades: {
    pending: number;
    accepted: number;
    failed: number;
    recent: NcriTradeSignal[];
  };
};

export function printQueueInsights(
  requests: PrintRequest[],
  queue: PrintQueueEntry[],
  trades: ResidentTrade[],
): PrintQueueInsightSummary {
  const activeRequests = requests.filter(request => !closedRequestStatuses.has(request.status));
  const queueRequestIds = new Set(queue.map(item => item.printRequestId));
  const requestIds = new Set(requests.map(request => request.id));

  const awaitingPayment = activeRequests.filter(request => request.status === 'awaiting_gp_confirmation').length;
  const paidWithoutQueue = activeRequests.filter(
    request => (request.status === 'paid' || request.status === 'approved') && !queueRequestIds.has(request.id),
  ).length;

  const activeQueueEntries = queue.filter(item => !terminalQueueStatuses.has(item.status));
  const inQueue = activeQueueEntries.length;
  const printing = queue.filter(item => item.status === 'printing').length;

  const queueBlockers: QueueBlockerSignal[] = [];
  let unassignedActive = 0;
  let failed = 0;
  let orphaned = 0;

  for (const item of queue) {
    const missingRequest = !requestIds.has(item.printRequestId);
    const isActiveQueueStatus = !terminalQueueStatuses.has(item.status);
    if (missingRequest) {
      orphaned += 1;
      queueBlockers.push({
        id: item.id,
        printRequestId: item.printRequestId,
        status: item.status,
        ...(item.printerId ? { printerId: item.printerId } : {}),
        updatedAt: item.updatedAt,
        reason: 'queue entry references unknown print request',
      });
      continue;
    }
    if (item.status === 'failed') {
      failed += 1;
      queueBlockers.push({
        id: item.id,
        printRequestId: item.printRequestId,
        status: item.status,
        ...(item.printerId ? { printerId: item.printerId } : {}),
        updatedAt: item.updatedAt,
        reason: item.error ? `queue failed: ${item.error}` : 'queue failed',
      });
      continue;
    }
    if (isActiveQueueStatus && !item.printerId) {
      unassignedActive += 1;
      queueBlockers.push({
        id: item.id,
        printRequestId: item.printRequestId,
        status: item.status,
        updatedAt: item.updatedAt,
        reason: 'active queue entry has no assigned printer',
      });
    }
  }

  const warnings: string[] = [];
  if (awaitingPayment > 0) warnings.push(pluralize(awaitingPayment, 'request awaiting GP confirmation.'));
  if (paidWithoutQueue > 0) warnings.push(pluralize(paidWithoutQueue, 'paid request missing a queue entry.'));
  if (unassignedActive > 0) warnings.push(pluralize(unassignedActive, 'active queue entry missing a printer assignment.'));
  if (failed > 0) warnings.push(pluralize(failed, 'queue entry is failed and needs operator action.'));
  if (orphaned > 0) warnings.push(pluralize(orphaned, 'queue entry references a missing print request.'));
  if (!warnings.length) warnings.push('No queue blockers detected.');

  const ncriSignals = trades
    .filter(trade => /\bncri\b/i.test(trade.requestedItem || ''))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  return {
    activeRequests: activeRequests.length,
    awaitingPayment,
    paidWithoutQueue,
    inQueue,
    printing,
    warnings,
    queueHealth: {
      unassignedActive,
      failed,
      orphaned,
      blockers: queueBlockers.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5),
    },
    ncriTrades: {
      pending: ncriSignals.filter(trade => trade.status === 'pending_nullcity').length,
      accepted: ncriSignals.filter(trade => trade.status === 'accepted').length,
      failed: ncriSignals.filter(trade => trade.status === 'failed' || trade.status === 'rejected' || trade.status === 'cancelled').length,
      recent: ncriSignals.slice(0, 3).map(trade => ({
        id: trade.id,
        residentId: trade.residentId,
        status: trade.status,
        requestedItem: trade.requestedItem || 'NCRI',
        updatedAt: trade.updatedAt,
      })),
    },
  };
}

function pluralize(count: number, text: string): string {
  return `${count.toLocaleString()} ${count === 1 ? text : text.replace('entry is', 'entries are').replace('entry references', 'entries reference').replace('entry has', 'entries have').replace('request', 'requests')}`;
}
