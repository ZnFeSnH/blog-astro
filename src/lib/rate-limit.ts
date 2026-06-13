import type { KVNamespace } from '@cloudflare/workers-types';

export interface IRateLimiter {
  checkLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

export class KVRateLimiter implements IRateLimiter {
  constructor(private kv: KVNamespace) {}

  async checkLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const windowKey = `rate:${key}:${Math.floor(now / windowSeconds)}`;
    
    try {
      const current = parseInt((await this.kv.get(windowKey)) || '0', 10);
      
      if (current >= limit) {
        return false;
      }
      
      await this.kv.put(windowKey, (current + 1).toString(), {
        expirationTtl: windowSeconds + 60
      });
      
      return true;
    } catch (err) {
      console.error('Rate limit KV error (graceful allow)', { key });
      return true;
    }
  }
}

class InMemoryRateLimiter implements IRateLimiter {
  private store = new Map<string, { count: number; reset: number }>();

  async checkLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    const entry = this.store.get(key);
    
    if (!entry || entry.reset < now) {
      this.store.set(key, { count: 1, reset: now + windowSeconds * 1000 });
      return true;
    }
    
    if (entry.count >= limit) return false;
    
    entry.count++;
    return true;
  }
}

export function createRateLimiter(kv?: KVNamespace): IRateLimiter {
  if (kv && import.meta.env.PROD) {
    return new KVRateLimiter(kv);
  }
  return new InMemoryRateLimiter();
}

export const rateLimiter = createRateLimiter();

export const RATE_LIMIT_ERROR = {
  code: 'ERR_RATE_LIMITED',
  message: 'Too many requests. Please try again later.'
};
