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

export function cityPath(route: string): string {
  return normalizePath(route);
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

function normalizePath(pathname: string): string {
  const [pathOnly = '/'] = pathname.split(/[?#]/);
  const withSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : '/';
}

function normalizeResidentName(name: string): string {
  return name.trim();
}

function normalizeRuntimeSection(section: string): string {
  return section.trim().replace(/^\/+|\/+$/g, '');
}
