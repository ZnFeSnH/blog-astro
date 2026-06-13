import { defineMiddleware } from 'astro:middleware';
import { authService } from './lib/auth';
import { createRateLimiter } from './lib/rate-limit';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, method } = context.url;
  const isApi = pathname.startsWith('/api/');
  const isAdmin = pathname.startsWith('/admin');
  const isProtectedApi = isApi && !pathname.startsWith('/api/public/') && !pathname.startsWith('/api/login');
  const isProtected = isProtectedApi || isAdmin;

  const traceId = crypto.randomUUID();
  context.locals.traceId = traceId;

  if (isProtected) {
    const clientIp = context.request.headers.get('cf-connecting-ip') || 
                     context.request.headers.get('x-forwarded-for') || 'unknown';
    
    // 👉 修复点：从 runtime.env 获取 KV
    const kvBinding = context.locals.runtime?.env?.RATE_LIMIT_KV;
    const limiter = createRateLimiter(kvBinding);
    const allowed = await limiter.checkLimit(
      `ip:${clientIp}:${pathname}`,
      30,
      60
    );
    
    if (!allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'ERR_RATE_LIMITED', message: 'Rate limit exceeded', traceId }
        }),
        { 
          status: 429, 
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } 
        }
      );
    }

    const user = await authService.getCurrentUser(context);
    
    if (!user) {
      if (isApi) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: { code: 'ERR_UNAUTHORIZED', message: 'Authentication required', traceId } 
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const returnTo = encodeURIComponent(pathname);
      return context.redirect(`/login?returnTo=${returnTo}`);
    }

    context.locals.user = user;
    context.locals.isAdmin = user.role === 'admin';
  }

/*
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && (isApi || isAdmin)) {
    const origin = context.request.headers.get('origin');
    const referer = context.request.headers.get('referer');
    const allowedOrigin = import.meta.env.PUBLIC_SITE_URL || 'http://localhost:4321';
    
    const isValidOrigin = origin === allowedOrigin || 
                          (referer && referer.startsWith(allowedOrigin));
    
    if (!isValidOrigin) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: { code: 'ERR_FORBIDDEN', message: 'Invalid origin', traceId } 
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
*/

  const response = await next();

  if (response instanceof Response) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (isApi) {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }

  return response;
});
