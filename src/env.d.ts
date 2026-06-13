/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@astrojs/cloudflare" />

declare namespace App {
  interface Locals {
    user?: {
      id: string;
      email: string;
      role: 'admin' | 'editor';
    };
    isAdmin?: boolean;
    traceId?: string;
    RATE_LIMIT_KV?: import('@cloudflare/workers-types').KVNamespace;
    DB?: import('@cloudflare/workers-types').D1Database;
  }
}

declare const __FEATURE_ADMIN_V2__: boolean;
declare const __FEATURE_RATE_LIMIT_V2__: boolean;
