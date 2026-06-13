import type { APIContext } from 'astro';

const JWT_SECRET = import.meta.env.JWT_SECRET || 'dev-secret-change-in-prod';
const TOKEN_EXPIRY = 15 * 60;

interface JWTPayload {
  sub: string;
  email: string;
  role: 'admin' | 'editor';
  iat: number;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'editor';
}

export interface IAuthService {
  signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string>;
  verifyToken(token: string): Promise<AuthUser | null>;
  getCurrentUser(context: APIContext): Promise<AuthUser | null>;
}

class WebCryptoJWTAuthService implements IAuthService {
  private readonly secret: string;

  constructor(secret: string = JWT_SECRET) {
    this.secret = secret;
  }

  private async getKey(): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.secret);
    return crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
  }

  async signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload: JWTPayload = {
      ...payload,
      iat: now,
      exp: now + TOKEN_EXPIRY
    };

    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '');
    const encodedPayload = btoa(JSON.stringify(fullPayload)).replace(/=/g, '');

    const key = await this.getKey();
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
    );
    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '');

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
  }

  async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      const [headerB64, payloadB64, signatureB64] = token.split('.');
      if (!headerB64 || !payloadB64 || !signatureB64) return null;

      const key = await this.getKey();
      const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
      const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));

      const isValid = await crypto.subtle.verify('HMAC', key, signature, data);
      if (!isValid) return null;

      const payload: JWTPayload = JSON.parse(atob(payloadB64));
      
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return {
        id: payload.sub,
        email: payload.email,
        role: payload.role
      };
    } catch {
      return null;
    }
  }

  async getCurrentUser(context: APIContext): Promise<AuthUser | null> {
    const cfAccessJWT = context.request.headers.get('cf-access-jwt-assertion');
    if (cfAccessJWT) {
      console.warn('CF Access token detected - implement full verification in prod');
      return { id: 'cf-access', email: 'admin@yourblog.com', role: 'admin' };
    }

    const token = context.cookies.get('auth_token')?.value;
    if (!token) return null;

    return this.verifyToken(token);
  }
}

export function createAuthService(): IAuthService {
  if (import.meta.env.FEATURE_AUTH_V2 === 'true') {
    console.log('Using Auth V2 (hot-swapped)');
  }
  return new WebCryptoJWTAuthService();
}

export const authService = createAuthService();

export function setAuthCookie(context: APIContext, token: string) {
  context.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: TOKEN_EXPIRY
  });
}

export function clearAuthCookie(context: APIContext) {
  context.cookies.delete('auth_token', { path: '/' });
}
