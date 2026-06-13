import { z } from 'zod';

export const articleCreateSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long').trim(),
  content: z.string().min(1, 'Content is required').max(50000, 'Content too large'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, hyphens only').min(1).max(100),
  status: z.enum(['draft', 'published'])
});

export const articleUpdateSchema = articleCreateSchema.partial().extend({
  id: z.number().int().positive()
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format').max(254),
  password: z.string().min(8).max(128)
});

export const apiVersionSchema = z.enum(['v1', 'v2']);

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().regex(/^ERR_[A-Z0-9_]+$/),
    message: z.string(),
    traceId: z.string().optional()
  })
});

export type ArticleCreateInput = z.infer<typeof articleCreateSchema>;
export type ArticleUpdateInput = z.infer<typeof articleUpdateSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
