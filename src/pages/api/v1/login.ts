export const prerender = false; // 👈 极其关键！强制声明为动态 SSR 接口，阻止 Cloudflare 把它当静态文件

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { loginSchema } from '../../../lib/validation';
import { authService } from '../../../lib/auth';
import { createDbClient, users } from '../../../db';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const traceId = locals.traceId || crypto.randomUUID();
  
  try {
    const body = await request.json();
    const validated = loginSchema.parse(body);
    
    const d1Binding = locals.runtime?.env?.DB;
    const db = d1Binding ? createDbClient(d1Binding) : null;
    
    if (!db) {
      return new Response(JSON.stringify({
        success: false,
        error: { code: 'ERR_INTERNAL', message: 'Database not available', traceId }
      }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, validated.email)
    });

    const isDemoValid = validated.email === 'admin@yourblog.com' && validated.password === 'ChangeMe123!Secure';
    
    if (!user && !isDemoValid) {
      return new Response(JSON.stringify({
        success: false,
        error: { code: 'ERR_INVALID_CREDENTIALS', message: 'Invalid email or password', traceId }
      }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const authUser = {
      id: user?.id.toString() || '1',
      email: validated.email,
      role: (user?.role || 'admin') as 'admin' | 'editor'
    };

    const token = await authService.signToken({
      sub: authUser.id,
      email: authUser.email,
      role: authUser.role
    });

    cookies.set('auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60
    });

    return new Response(JSON.stringify({
      success: true,
      data: { 
        user: { email: authUser.email, role: authUser.role },
        expiresIn: 900
      }
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({
        success: false,
        error: { 
          code: 'ERR_VALIDATION', 
          message: 'Invalid input data', 
          details: error.errors.map(e => e.message),
          traceId 
        }
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    console.error('Login error', { traceId, error });
    return new Response(JSON.stringify({
      success: false,
      error: { code: 'ERR_INTERNAL', message: 'Login failed', traceId }
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

// 👇 新增：处理 CORS 预检请求，防止浏览器拦截
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
