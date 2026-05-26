import type {
  ControllerStatus,
  EventReadinessSummary,
  GatewayStatus,
  PatronActivitySummary,
  ReadinessCheckSummary,
  ReadinessLevel,
  RecentLetterSummary,
  ResidentDashboardRow,
  SoulSummary,
} from '@nullcity-dashboard/shared';

export interface EventReadinessInput {
  gateway: GatewayStatus;
  controller: ControllerStatus;
  residents: ResidentDashboardRow[];
  souls: SoulSummary[];
  recentLetters: RecentLetterSummary[];
  patrons?: PatronActivitySummary;
  now?: string;
}

export function buildEventReadinessSummary(input: EventReadinessInput): EventReadinessSummary {
  const checks = [
    gatewayCheck(input.gateway),
    controllerCheck(input.controller),
    residentCohortCheck(input.residents, input.controller),
    soulsCheck(input.souls),
    patronsCheck(input.patrons),
    lettersCheck(input.recentLetters),
  ];
  return {
    level: rollupLevel(checks),
    updatedAt: input.now || new Date().toISOString(),
    checks,
  };
}

function gatewayCheck(gateway: GatewayStatus): ReadinessCheckSummary {
  if (gateway.connected) {
    return {
      id: 'gateway',
      label: 'Gateway',
      level: 'ok',
      detail: 'Gateway connected',
    };
  }
  return {
    id: 'gateway',
    label: 'Gateway',
    level: 'fail',
    detail: `Gateway offline${safeReason(gateway.lastError)}`,
  };
}

function controllerCheck(controller: ControllerStatus): ReadinessCheckSummary {
  if (controller.available) {
    return {
      id: 'controller',
      label: 'Controller data',
      level: 'ok',
      count: controller.residentsWithRuntime,
      detail: `${controller.residentsWithRuntime} resident runtimes visible`,
    };
  }
  return {
    id: 'controller',
    label: 'Controller data',
    level: 'fail',
    count: controller.residentsWithRuntime,
    detail: `Controller data unavailable${safeReason(controller.lastError)}`,
  };
}

function residentCohortCheck(residents: ResidentDashboardRow[], controller: ControllerStatus): ReadinessCheckSummary {
  const known = residents.length > 0 ? residents.length : controller.residentsWithRuntime;
  const online = residents.filter(resident => resident.online).length;
  if (known === 0) {
    return {
      id: 'resident-cohort',
      label: 'Resident cohort',
      level: 'fail',
      count: 0,
      detail: 'No residents discovered by gateway or controller',
    };
  }
  if (online === 0) {
    return {
      id: 'resident-cohort',
      label: 'Resident cohort',
      level: 'warn',
      count: known,
      detail: `${known} residents known, none online`,
    };
  }
  return {
    id: 'resident-cohort',
    label: 'Resident cohort',
    level: 'ok',
    count: online,
    detail: `${online} online of ${known} known residents`,
  };
}

function soulsCheck(souls: SoulSummary[]): ReadinessCheckSummary {
  if (souls.length > 0) {
    return {
      id: 'souls',
      label: 'SOUL catalog',
      level: 'ok',
      count: souls.length,
      detail: `${souls.length} SOUL files available`,
    };
  }
  return {
    id: 'souls',
    label: 'SOUL catalog',
    level: 'fail',
    count: 0,
    detail: 'No SOUL files discovered',
  };
}

function patronsCheck(patrons: PatronActivitySummary | undefined): ReadinessCheckSummary {
  if (!patrons || patrons.totalPatrons === 0) {
    return {
      id: 'patrons',
      label: 'Patron ledgers',
      level: 'warn',
      count: 0,
      detail: 'No patrons registered yet',
    };
  }
  if (patrons.totalShardBalance <= 0) {
    return {
      id: 'patrons',
      label: 'Patron ledgers',
      level: 'warn',
      count: patrons.totalPatrons,
      detail: `${patrons.totalPatrons} patrons registered, no Shards currently held`,
    };
  }
  return {
    id: 'patrons',
    label: 'Patron ledgers',
    level: 'ok',
    count: patrons.totalPatrons,
    detail: `${patrons.totalPatrons} patrons, ${patrons.totalShardBalance.toLocaleString()} Shards visible`,
  };
}

function lettersCheck(recentLetters: RecentLetterSummary[]): ReadinessCheckSummary {
  if (recentLetters.length > 0) {
    return {
      id: 'letters',
      label: 'Letters',
      level: 'ok',
      count: recentLetters.length,
      detail: `${recentLetters.length} recent letters visible`,
    };
  }
  return {
    id: 'letters',
    label: 'Letters',
    level: 'warn',
    count: 0,
    detail: 'No recent patron letters visible',
  };
}

function rollupLevel(checks: ReadinessCheckSummary[]): ReadinessLevel {
  if (checks.some(check => check.level === 'fail')) return 'fail';
  if (checks.some(check => check.level === 'warn')) return 'warn';
  return 'ok';
}

function safeReason(message: string | undefined): string {
  if (!message) return '';
  const normalized = message.toUpperCase();
  if (normalized.includes('ECONNREFUSED')) return ' (connection refused)';
  if (normalized.includes('ETIMEDOUT')) return ' (timed out)';
  if (normalized.includes('EACCES') || normalized.includes('EPERM')) return ' (permission denied)';
  if (normalized.includes('ENOENT')) return ' (missing file)';
  return ' (see server logs)';
}
