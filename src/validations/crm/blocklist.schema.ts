import { z } from 'zod';

/**
 * A blocklist pattern is either a full email address (`spammer@evil.com`) or a
 * domain pattern that starts with `@` (`@evil.com`).
 */
export const blocklistPatternSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .transform((v) => v.toLowerCase())
  .refine(
    (v) => {
      if (v.startsWith('@')) {
        // @domain.tld — at least one dot after the @.
        return /^@[a-z0-9.-]+\.[a-z]{2,}$/.test(v);
      }
      // full email
      return /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(v);
    },
    { message: 'Pattern must be a valid email or a domain pattern like @example.com' }
  );

export const createBlocklistSchema = z.object({
  pattern: blocklistPatternSchema,
  reason: z.string().trim().max(500).optional(),
});

export type CreateBlocklistInput = z.infer<typeof createBlocklistSchema>;
