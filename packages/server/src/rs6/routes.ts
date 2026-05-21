import { APPEARANCE_SLOTS, COLOR_CHANNELS, type Appearance } from './types';
import { buildPlayerMesh } from './compose/player';
import { mergedMeshToGlb } from './compose/rs-to-glb';

export async function routeRs6Api(request: Request, pathname: string): Promise<Response | undefined> {
  if (pathname !== '/api/rs6/compose') return undefined;
  if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }));
  if (request.method !== 'POST') return undefined;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(Response.json({ error: 'invalid JSON body' }, { status: 400 }));
  }

  const appearance = parseAppearance(body);
  if (!appearance) return withCors(Response.json({ error: 'invalid appearance' }, { status: 400 }));

  try {
    const mesh = buildPlayerMesh(appearance, { hiddenFaceCulling: true });
    const glb = mergedMeshToGlb(mesh);
    const responseBody = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
    return withCors(new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Length': String(glb.byteLength),
        'Cache-Control': 'no-store',
      },
    }));
  } catch (error) {
    console.error('[dashboard rs6 compose] failed', error);
    return withCors(Response.json({ error: 'compose failed', detail: String(error) }, { status: 500 }));
  }
}

function withCors(response: Response): Response {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'content-type');
  return response;
}

function parseAppearance(value: unknown): Appearance | undefined {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const source = typeof record.appearance === 'object' && record.appearance !== null
    ? record.appearance as Record<string, unknown>
    : record;
  const gender = source.gender === 'F' ? 'F' : source.gender === 'M' ? 'M' : undefined;
  const parts = Array.isArray(source.parts) ? source.parts.map(Number) : [];
  const colors = Array.isArray(source.colors) ? source.colors.map(Number) : [];

  if (!gender || parts.length !== APPEARANCE_SLOTS || colors.length !== COLOR_CHANNELS) return undefined;
  if (!parts.every(Number.isInteger) || !colors.every(Number.isInteger)) return undefined;
  return { gender, parts, colors };
}
