import type { APIRoute } from 'astro';
import { z } from 'zod';
import { articleCreateSchema, articleUpdateSchema } from '../../../lib/validation';
import { createDbClient, articles } from '../../../db';
import { eq, desc, and, isNull } from 'drizzle-orm';

function jsonError(code: string, message: string, traceId: string, status = 500, details?: any) {
  return new Response(JSON.stringify({
    success: false,
    error: { code, message: message || 'An error occurred', traceId, ...(details && { details }) }
  }), { 
    status, 
    headers: { 'Content-Type': 'application/json' } 
  });
}

export const GET: APIRoute = async ({ url, locals }) => {
  const traceId = locals.traceId || crypto.randomUUID();
  const db = locals.DB ? createDbClient(locals.DB) : null;
  
  if (!db) {
    return jsonError('ERR_INTERNAL', 'DB unavailable', traceId, 503);
  }

  try {
    const status = url.searchParams.get('status') || 'published';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
    
    const whereClause = status === 'published' 
      ? and(eq(articles.status, 'published'), isNull(articles.deletedAt))
      : and(eq(articles.status, status as any), isNull(articles.deletedAt));

    const results = await db.select().from(articles)
      .where(whereClause)
      .orderBy(desc(articles.createdAt))
      .limit(limit);

    return new Response(JSON.stringify({
      success: true,
      data: results,
      meta: { count: results.length, traceId }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return jsonError('ERR_INTERNAL', 'Failed to fetch articles', traceId);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const traceId = locals.traceId || crypto.randomUUID();
  
  if (!locals.user) {
    return jsonError('ERR_UNAUTHORIZED', 'Auth required', traceId, 401);
  }

  const db = locals.DB ? createDbClient(locals.DB) : null;
  if (!db) return jsonError('ERR_INTERNAL', 'DB unavailable', traceId, 503);

  try {
    const body = await request.json();
    const validated = articleCreateSchema.parse(body);

    if (validated.status === 'published' && locals.user.role !== 'admin') {
      validated.status = 'draft';
    }

    const [newArticle] = await db.insert(articles).values({
      title: validated.title,
      slug: validated.slug,
      content: validated.content,
      status: validated.status,
      authorId: parseInt(locals.user.id) || 1
    }).returning();

    return new Response(JSON.stringify({
      success: true,
      data: newArticle
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonError('ERR_VALIDATION', 'Invalid article data', traceId, 400, error.errors);
    }
    return jsonError('ERR_INTERNAL', 'Failed to create article', traceId);
  }
};

export const PUT: APIRoute = async ({ request, locals, url }) => {
  const traceId = locals.traceId || crypto.randomUUID();
  if (!locals.user) return jsonError('ERR_UNAUTHORIZED', '', traceId, 401);

  const db = locals.DB ? createDbClient(locals.DB) : null;
  if (!db) return jsonError('ERR_INTERNAL', '', traceId, 503);

  try {
    const body = await request.json();
    const validated = articleUpdateSchema.parse(body);
    
    const [updated] = await db.update(articles)
      .set({
        title: validated.title,
        content: validated.content,
        status: validated.status,
        slug: validated.slug,
        updatedAt: new Date()
      })
      .where(eq(articles.id, validated.id))
      .returning();

    if (!updated) return jsonError('ERR_NOT_FOUND', 'Article not found', traceId, 404);

    return new Response(JSON.stringify({ success: true, data: updated }), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError('ERR_VALIDATION', '', traceId, 400);
    return jsonError('ERR_INTERNAL', '', traceId);
  }
};

export const DELETE: APIRoute = async ({ locals, url }) => {
  const traceId = locals.traceId || crypto.randomUUID();
  if (!locals.user || locals.user.role !== 'admin') {
    return jsonError('ERR_FORBIDDEN', 'Admin only', traceId, 403);
  }

  const id = parseInt(url.searchParams.get('id') || '0');
  if (!id) return jsonError('ERR_VALIDATION', 'ID required', traceId, 400);

  const db = locals.DB ? createDbClient(locals.DB) : null;
  if (!db) return jsonError('ERR_INTERNAL', '', traceId, 503);

  await db.update(articles)
    .set({ deletedAt: new Date() })
    .where(eq(articles.id, id));

  return new Response(JSON.stringify({ success: true, message: 'Article soft-deleted' }), { status: 200 });
};
