import { cityConfigFromEnv, type CityConfig } from './config';
import { BunSqlLandingCheckinReader, type LandingCheckinReader } from './checkins';
import { createLandingSessionAuthenticator, type LandingSessionAuthenticator } from './landing-session';
import { InMemoryCityStore } from './memory-store';
import { PostgresCityStore } from './postgres-store';
import type { CityStore } from './store';

export interface CityServices {
  config: CityConfig;
  auth: LandingSessionAuthenticator;
  store: CityStore;
  landingCheckins?: LandingCheckinReader;
}

export function createCityServicesFromEnv(env: Record<string, string | undefined> = process.env): CityServices {
  const config = cityConfigFromEnv(env);
  const store = config.cityDatabaseUrl ? new PostgresCityStore(config.cityDatabaseUrl) : new InMemoryCityStore();
  return {
    config,
    auth: createLandingSessionAuthenticator(config),
    store,
    landingCheckins: config.landingDatabaseUrl ? new BunSqlLandingCheckinReader(config.landingDatabaseUrl) : undefined,
  };
}

export async function initializeCityServices(services: CityServices): Promise<void> {
  const maybeMigratingStore = services.store as CityStore & { runMigrations?: () => Promise<void> };
  await maybeMigratingStore.runMigrations?.();
}
