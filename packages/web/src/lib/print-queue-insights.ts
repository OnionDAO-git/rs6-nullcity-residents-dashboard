import type { PrintQueueEntry, PrintRequest, ResidentTrade, ResidentTradeStatus } from './city-api';

const closedRequestStatuses = new Set<PrintRequest['status']>(['completed', 'cancelled', 'refunded', 'failed']);
const queuedStatuses = new Set(['queued', 'printing', 'completed']);

type NcriTradeSignal = {
  id: string;
  residentId: string;
  status: ResidentTradeStatus;
  requestedItem: string;
  updatedAt: string;
};

export type PrintQueueInsightSummary = {
  activeRequests: number;
  awaitingPayment: number;
  paidWithoutQueue: number;
  inQueue: number;
  printing: number;
  warnings: string[];
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

  const awaitingPayment = activeRequests.filter(request => request.status === 'awaiting_gp_confirmation').length;
  const paidWithoutQueue = activeRequests.filter(
    request => (request.status === 'paid' || request.status === 'approved') && !queueRequestIds.has(request.id),
  ).length;

  const inQueue = queue.filter(item => queuedStatuses.has(item.status)).length;
  const printing = queue.filter(item => item.status === 'printing').length;

  const warnings: string[] = [];
  if (awaitingPayment > 0) warnings.push(pluralize(awaitingPayment, 'request awaiting GP confirmation.'));
  if (paidWithoutQueue > 0) warnings.push(pluralize(paidWithoutQueue, 'paid request missing a queue entry.'));
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
  return `${count.toLocaleString()} ${count === 1 ? text : text.replace('request', 'requests')}`;
}
