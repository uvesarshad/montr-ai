// OSS single-tenant override of src/lib/db/repository/crm/blocklist.repository.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
import mongoose, { Types } from 'mongoose';
import CrmBlocklist, { ICrmBlocklist } from '../../models/crm/blocklist.model';

export interface CreateBlocklistDto {
  pattern: string;
  reason?: string;
  createdById: string;
}

/** Normalize a raw blocklist pattern: lowercase + trim. */
export function normalizeBlocklistPattern(pattern: string): string {
  return pattern.trim().toLowerCase();
}

/** Extract the domain part of an email (the bit after `@`), lowercased. */
function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

// Small per-process cache of the blocklist patterns (60s TTL). The
// blocklist is tiny and read on every synced inbound message, so a short cache
// avoids a DB round-trip per message without risking meaningfully stale data.
const CACHE_TTL_MS = 60_000;
let patternCache: { patterns: Set<string>; expires: number } | null = null;

function invalidate(): void {
  patternCache = null;
}

export class BlocklistRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async list(): Promise<ICrmBlocklist[]> {
    await this.ensureConnection();
    return CrmBlocklist.find({}).sort({ createdAt: -1 }).exec();
  }

  async create(data: CreateBlocklistDto): Promise<ICrmBlocklist> {
    await this.ensureConnection();
    const doc = new CrmBlocklist({
      pattern: normalizeBlocklistPattern(data.pattern),
      reason: data.reason,
      createdById: new Types.ObjectId(data.createdById),
    });
    const saved = await doc.save();
    invalidate();
    return saved;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmBlocklist.deleteOne({ _id: id }).exec();
    invalidate();
    return result.deletedCount > 0;
  }

  /** Cached set of the lowercased patterns. */
  private async getPatternSet(): Promise<Set<string>> {
    if (patternCache && patternCache.expires > Date.now()) return patternCache.patterns;

    await this.ensureConnection();
    const docs = await CrmBlocklist.find({}).select({ pattern: 1 }).lean().exec();
    const patterns = new Set(docs.map((d) => d.pattern));
    patternCache = { patterns, expires: Date.now() + CACHE_TTL_MS };
    return patterns;
  }

  /**
   * True if `email` is blocked: either the exact email matches a pattern, or
   * `@<domain>` of the email matches a domain pattern. Both candidates are
   * tested against the cached pattern set (effectively a two-key lookup).
   */
  async isBlocked(email: string): Promise<boolean> {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;
    const patterns = await this.getPatternSet();
    if (patterns.has(normalized)) return true;
    const domain = domainOf(normalized);
    if (domain && patterns.has(`@${domain}`)) return true;
    return false;
  }
}

export const blocklistRepository = new BlocklistRepository();
