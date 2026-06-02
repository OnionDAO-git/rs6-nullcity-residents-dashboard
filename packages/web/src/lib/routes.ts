export const DEBUG_PREFIX = '/debug';

const debugInternalRoots = new Set([
  '/',
  '/index.html',
  '/wall',
  '/wall/',
  '/inbox',
  '/inbox/',
  '/patron',
  '/patron/',
  '/graveyard',
  '/graveyard/',
  '/library',
  '/library/',
  '/residents',
  '/residents/new',
  '/observe',
  '/benchmarks',
  '/souls',
  '/logs',
]);

export function isDebugPath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return normalized === DEBUG_PREFIX || normalized.startsWith(`${DEBUG_PREFIX}/`);
}

export function toDebugInternalRoute(pathname: string): string {
  const normalized = normalizePath(pathname);
  if (!isDebugPath(normalized)) return normalized;
  const stripped = normalized.slice(DEBUG_PREFIX.length);
  return stripped || '/';
}

export function debugPath(route: string): string {
  const normalized = normalizePath(route);
  if (isDebugPath(normalized)) return normalized;
  if (normalized === '/') return DEBUG_PREFIX;
  return `${DEBUG_PREFIX}${normalized}`;
}

export function publicEventPath(route: string, origin?: string): string {
  const path = debugPath(route);
  if (!origin) return path;
  try {
    const url = new URL(origin);
    if (url.port !== '5174') return path;
    url.port = '8787';
    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return path;
  }
}

export function cityPath(route: string): string {
  return normalizeNavigationPath(route);
}

export function residentDebugRoute(name: string): string {
  return `/residents/${encodeURIComponent(normalizeResidentName(name))}`;
}

export function observeResidentDebugRoute(name: string): string {
  return `/observe/resident/${encodeURIComponent(normalizeResidentName(name))}`;
}

export function residentRuntimeApiPath(name: string, section = ''): string {
  const normalizedSection = normalizeRuntimeSection(section);
  return `/api/runtime/${encodeURIComponent(normalizeResidentName(name))}${normalizedSection ? `/${normalizedSection}` : ''}`;
}

export function isDebugInternalRoute(route: string): boolean {
  const normalized = normalizePath(route);
  if (debugInternalRoots.has(normalized)) return true;
  return (
    normalized.startsWith('/residents/') ||
    normalized.startsWith('/observe/') ||
    normalized.startsWith('/benchmarks/')
  );
}

export function isProtectedCityRoute(route: string): boolean {
  const normalized = normalizePath(route);
  return normalized === '/profile' ||
    normalized === '/world' ||
    normalized === '/inbox' ||
    normalized.startsWith('/inbox/') ||
    normalized === '/prints' ||
    normalized.startsWith('/prints/') ||
    normalized === '/story' ||
    normalized.startsWith('/story/') ||
    normalized.startsWith('/admin');
}

export function isStoryRoute(route: string): boolean {
  const normalized = normalizePath(route);
  return normalized === '/story' || normalized.startsWith('/story/');
}

export function cityRouteNeedsStoryDigests(route: string): boolean {
  const normalized = normalizePath(route);
  return normalized === '/' ||
    normalized === '/overview' ||
    normalized === '/residents' ||
    normalized.startsWith('/residents/') ||
    normalized === '/library' ||
    isStoryRoute(normalized);
}

export function cityRouteNeedsSnapshot(route: string): boolean {
  const normalized = normalizePath(route);
  return normalized === '/' ||
    normalized === '/economy' ||
    normalized === '/profile' ||
    normalized === '/world' ||
    normalized === '/embassy' ||
    normalized.startsWith('/embassy/') ||
    normalized === '/residents' ||
    normalized.startsWith('/residents/') ||
    normalized === '/inbox' ||
    normalized.startsWith('/inbox/') ||
    normalized === '/prints' ||
    normalized.startsWith('/prints/') ||
    normalized === '/library' ||
    normalized.startsWith('/admin');
}

export function isKnownCityRoute(route: string): boolean {
  const normalized = normalizePath(route);
  if (normalized === '/' || normalized === '/login') return true;
  if (normalized === '/overview') return true;
  if (normalized === '/economy') return true;
  if (normalized === '/profile' || normalized === '/world' || normalized === '/library') return true;
  if (isStoryRoute(normalized)) return true;
  if (normalized === '/residents') return true;
  if (normalized.startsWith('/residents/') && normalized !== '/residents/new') return true;
  if (normalized === '/embassy' || normalized === '/embassy/new' || normalized.startsWith('/embassy/')) return true;
  if (normalized === '/inbox' || normalized.startsWith('/inbox/')) return true;
  if (normalized === '/prints' || normalized === '/prints/new' || normalized.startsWith('/prints/')) return true;
  return normalized === '/admin' || normalized.startsWith('/admin/');
}

function normalizePath(pathname: string): string {
  const [pathOnly = '/'] = pathname.split(/[?#]/);
  const withSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : '/';
}

function normalizeNavigationPath(route: string): string {
  const hashIndex = route.indexOf('#');
  const routeWithoutHash = hashIndex >= 0 ? route.slice(0, hashIndex) : route;
  const hash = hashIndex >= 0 ? route.slice(hashIndex) : '';
  const queryIndex = routeWithoutHash.indexOf('?');
  const path = queryIndex >= 0 ? routeWithoutHash.slice(0, queryIndex) : routeWithoutHash;
  const query = queryIndex >= 0 ? routeWithoutHash.slice(queryIndex) : '';
  return `${normalizePath(path)}${query}${hash}`;
}

function normalizeResidentName(name: string): string {
  return name.trim();
}

function normalizeRuntimeSection(section: string): string {
  return section.trim().replace(/^\/+|\/+$/g, '');
}
