/**
 * Update Contact Processor
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { contactRepository } from '../../../db/repository/crm/contact.repository';

export class UpdateContactProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    // Get contact ID
    const contactId = config.contactId ? String(config.contactId) : execution.contactId?.toString();

    if (!contactId) {
      throw new Error('Contact ID is required');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (config.firstName !== undefined) updateData.firstName = config.firstName;
    if (config.lastName !== undefined) updateData.lastName = config.lastName;
    if (config.email !== undefined) updateData.email = config.email;
    if (config.phone !== undefined) updateData.phone = config.phone;
    if (config.company !== undefined) updateData.companyId = config.company;
    if (config.status !== undefined) updateData.status = config.status;
    if (config.tags !== undefined) updateData.tags = config.tags;

    // Update contact
    const contact = await contactRepository.update(
      contactId,
      updateData
    );

    if (!contact) {
      throw new Error(`Contact not found: ${contactId}`);
    }

    return {
      success: true,
      contactId: contact._id.toString(),
      updated: Object.keys(updateData),
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

    if (!config.contactId) {
      errors.push('Contact ID is required');
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
