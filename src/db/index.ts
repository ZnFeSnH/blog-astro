import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

export function createDbClient(d1: D1Database) {
  return drizzle(d1, { schema, logger: false });
}

export type DbClient = ReturnType<typeof createDbClient>;

export { articles, users } from './schema';
export type { Article, NewArticle, User, NewUser } from './schema';
