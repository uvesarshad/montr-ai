/**
 * Create Contact Processor
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { contactRepository } from '../../../db/repository/crm/contact.repository';

export class CreateContactProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;
    const str = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));

    // Get contact data
    const firstName = str(config.firstName);
    const lastName = str(config.lastName);
    const email = str(config.email);
    const phone = str(config.phone);
    const company = str(config.company);
    const tags = Array.isArray(config.tags) ? (config.tags as string[]) : [];

    if (!firstName && !email && !phone) {
      throw new Error('At least one of firstName, email, or phone is required');
    }

    // Dry-run (1.9): simulate the create — no DB write, no variable update.
    if (context.dryRun) {
      return {
        simulated: true,
        success: false,
        wouldCreate: { firstName, lastName, email, phone, company, tags },
      };
    }

    // Create contact
    const contact = await contactRepository.create({
      firstName,
      lastName,
      email,
      phone,
      companyId: company || undefined,
      tags,
      source: 'api',
      createdById: execution.userId.toString()
    });

    // Store contact ID in variables
    await execution.updateVariable('contact_id', contact._id.toString());

    return {
      success: true,
      contactId: contact._id.toString(),
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone
      }
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!config.firstName && !config.email && !config.phone) {
      errors.push('At least one of firstName, email, or phone is required');
    }

    if (config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(config.email))) {
      errors.push('Invalid email format');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}
