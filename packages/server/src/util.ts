import fs from 'node:fs/promises';
import path from 'node:path';

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      'cache-control': 'no-store',
      ...init.headers,
    },
  });
}

export function textResponse(text: string, init: ResponseInit = {}): Response {
  return new Response(text, {
    ...init,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...init.headers,
    },
  });
}

export function notFound(): Response {
  return jsonResponse({ error: 'not_found' }, { status: 404 });
}

export async function readJsonFile<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

export async function readTextFile(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

export async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export function safeJoin(root: string, relative: string): string {
  const normalized = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(root, normalized);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error('Path escapes configured root');
  }
  return resolved;
}

export function residentSlug(resident: string): string {
  return resident
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export async function listFiles(root: string, extensions?: string[]): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as Array<{ name: string; isDirectory(): boolean }>;
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (!extensions || extensions.some(ext => entry.name.endsWith(ext))) {
        out.push(path.relative(root, full));
      }
    }
  }
  await walk(root);
  return out.sort();
}

export async function readJsonl<T>(file: string, limit = 100): Promise<T[]> {
  const text = await readTextFile(file);
  if (!text) return [];
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map(line => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is T => entry !== undefined);
}

export function latestDatedJsonl(root: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(root, `${today}.jsonl`);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
