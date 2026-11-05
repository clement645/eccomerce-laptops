import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { isKnownTag } from '@/lib/cache-tags';
import { getServerEnv } from '@/lib/env';

const MAX_TAGS = 50;

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * On-demand cache refresh, called by the API after catalog or content changes.
 * POST { "tags": ["catalog", "product:hp-elitebook-840-g10"] } with header X-Revalidate-Secret.
 */
export async function POST(request: NextRequest) {
  const secret = getServerEnv().REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: 'NOT_CONFIGURED', message: 'Revalidation is not configured' } },
      { status: 503 },
    );
  }
  if (!secretMatches(request.headers.get('x-revalidate-secret'), secret)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid secret' } },
      { status: 401 },
    );
  }

  let tags: unknown;
  try {
    tags = ((await request.json()) as { tags?: unknown }).tags;
  } catch {
    tags = undefined;
  }
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.length > MAX_TAGS ||
    !tags.every((t) => typeof t === 'string' && isKnownTag(t))
  ) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Expected { tags: string[] } with known tags' } },
      { status: 400 },
    );
  }

  // "max": visitors keep getting the cached page while it refreshes in the background.
  for (const tag of tags as string[]) revalidateTag(tag, 'max');
  return NextResponse.json({ revalidated: tags });
}
