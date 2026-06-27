/**
 * CRM trash purge — hard-deletes soft-deleted records older than the
 * retention window. Run by the daily cron registered in queue.ts /
 * scheduleCrmTrashPurge.
 */

import { contactRepository } from '../db/repository/crm/contact.repository';
import { companyRepository } from '../db/repository/crm/company.repository';
import { dealRepository } from '../db/repository/crm/deal.repository';
import { activityRepository } from '../db/repository/crm/activity.repository';

/** Records sit in trash this many days before being permanently removed. */
export const TRASH_RETENTION_DAYS = 30;

export interface PurgeResult {
  contacts: number;
  companies: number;
  deals: number;
  activities: number;
  total: number;
}

/**
 * Hard-delete every CRM record whose `deletedAt` is older than the retention
 * window, across all organizations. Idempotent and safe to run repeatedly.
 */
export async function purgeExpiredCrmTrash(
  retentionDays: number = TRASH_RETENTION_DAYS,
): Promise<PurgeResult> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const [contacts, companies, deals, activities] = await Promise.all([
    contactRepository.purgeOlderThan(cutoff),
    companyRepository.purgeOlderThan(cutoff),
    dealRepository.purgeOlderThan(cutoff),
    activityRepository.purgeOlderThan(cutoff),
  ]);

  return {
    contacts,
    companies,
    deals,
    activities,
    total: contacts + companies + deals + activities,
  };
}
