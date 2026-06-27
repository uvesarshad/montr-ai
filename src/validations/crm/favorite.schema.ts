import { z } from 'zod';

// Create favorite schema
export const createFavoriteSchema = z.object({
  targetType: z.enum(['contact', 'company', 'deal', 'view']),
  targetId: z.string().min(1),
  folderId: z.string().optional(),
  order: z.number().default(0),
});

// Update favorite schema
export const updateFavoriteSchema = z.object({
  folderId: z.string().optional(),
  order: z.number().optional(),
});

// Reorder favorites schema
export const reorderFavoritesSchema = z.object({
  favorites: z.array(z.object({
    id: z.string(),
    order: z.number(),
  })),
});

// Favorite filter schema
export const favoriteFilterSchema = z.object({
  targetType: z.enum(['contact', 'company', 'deal', 'view']).optional(),
  folderId: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
  sort: z.string().default('order'),
});

// Type exports
export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;
export type UpdateFavoriteInput = z.infer<typeof updateFavoriteSchema>;
export type ReorderFavoritesInput = z.infer<typeof reorderFavoritesSchema>;
export type FavoriteFilterInput = z.infer<typeof favoriteFilterSchema>;
