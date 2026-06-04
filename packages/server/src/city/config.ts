export interface CityConfig {
  cityDatabaseUrl?: string;
  landingDatabaseUrl?: string;
  landingAuthBaseUrl: string;
  authCookieName: string;
  authCookieDomain?: string;
  sessionCookieSecure: boolean;
  publicBaseUrl?: string;
  printBridgeToken?: string;
  nullcityControlBaseUrl?: string;
  nullcityControlToken?: string;
  // Dev's onion consent-spend API (landing). When onionSpendMode === 'real', the
  // support flow creates a burn request the attendee approves; on the callback we
  // credit City. Default 'standin' keeps the labelled non-production stand-in.
  onionSpendMode: 'standin' | 'real';
  onionApiBaseUrl: string;
  onionApiKey?: string;
  onionCallbackSecret?: string;
  baseBirthApCost: number;
  skillLevelApCost: number;
  equipmentGpPerAp: number;
  inventoryGpPerAp: number;
  complexityApCost: number;
  csrfDisabled: boolean;
}

export function cityConfigFromEnv(env: Record<string, string | undefined> = process.env): CityConfig {
  return {
    cityDatabaseUrl: clean(env.CITY_DATABASE_URL),
    landingDatabaseUrl: clean(env.LANDING_DATABASE_URL),
    landingAuthBaseUrl: clean(env.LANDING_AUTH_BASE_URL) || 'https://oniondao.dev',
    authCookieName: clean(env.AUTH_COOKIE_NAME) || 'session',
    authCookieDomain: clean(env.AUTH_COOKIE_DOMAIN),
    sessionCookieSecure: env.SESSION_COOKIE_SECURE === 'true',
    publicBaseUrl: clean(env.CITY_PUBLIC_BASE_URL),
    printBridgeToken: clean(env.CITY_PRINT_BRIDGE_TOKEN) || clean(env.PRINT_BRIDGE_CITY_TOKEN),
    nullcityControlBaseUrl: normalizeNullCityControlBaseUrl(clean(env.NULLCITY_CITY_API_URL) || clean(env.CITY_DASHBOARD_NULLCITY_URL)),
    nullcityControlToken: clean(env.NULLCITY_CITY_API_TOKEN) || clean(env.CITY_DASHBOARD_NULLCITY_TOKEN),
    onionSpendMode: env.ONION_SPEND_MODE === 'real' ? 'real' : 'standin',
    onionApiBaseUrl: (clean(env.ONION_API_BASE_URL) || clean(env.LANDING_AUTH_BASE_URL) || 'https://oniondao.dev').replace(/\/+$/, ''),
    onionApiKey: clean(env.ONION_EXTERNAL_API_KEY),
    onionCallbackSecret: clean(env.ONION_CALLBACK_SECRET),
    baseBirthApCost: numberEnv(env.CITY_SOUL_BASE_BIRTH_AP, 500),
    skillLevelApCost: numberEnv(env.CITY_SOUL_SKILL_LEVEL_AP, 10),
    equipmentGpPerAp: numberEnv(env.CITY_SOUL_EQUIPMENT_GP_PER_AP, 1),
    inventoryGpPerAp: numberEnv(env.CITY_SOUL_INVENTORY_GP_PER_AP, 1),
    complexityApCost: numberEnv(env.CITY_SOUL_COMPLEXITY_AP, 0),
    csrfDisabled: env.CITY_CSRF_DISABLED === 'true' || env.NODE_ENV === 'test',
  };
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeNullCityControlBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const withoutTrailingSlash = value.replace(/\/+$/, '');
  try {
    const url = new URL(withoutTrailingSlash);
    if (url.pathname === '' || url.pathname === '/') {
      url.pathname = '/api/nullcity';
      return url.toString().replace(/\/+$/, '');
    }
  } catch {
    return withoutTrailingSlash;
  }
  return withoutTrailingSlash;
}

function numberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
