import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';

// Note: You must import `toolRegistry.register` at the end or in a central file.

export const createContactTool = {
    name: 'createContact',
    description: 'Create a new CRM contact for the organization. Use this when a user asks to add or save a new lead, contact, or customer.',
    parameters: z.object({
        firstName: z.string().describe("The given name of the contact."),
        lastName: z.string().optional().describe("The family name of the contact."),
        email: z.string().email().optional().describe("The email address."),
        phone: z.string().optional().describe("The phone number (preferably with country code)."),
        company: z.string().optional().describe("The company they work for."),
        jobTitle: z.string().optional().describe("Their job title."),
        tags: z.array(z.string()).optional().describe("Tags to categorize this contact (e.g. 'lead', 'vip').")
    }),
    factory: (context: AgentContext) => tool({
        description: 'Create a new CRM contact for the organization.',
        parameters: z.object({
            firstName: z.string(),
            lastName: z.string().optional(),
            email: z.string().email().optional(),
            phone: z.string().optional(),
            company: z.string().optional(),
            jobTitle: z.string().optional(),
            tags: z.array(z.string()).optional()
        }),
        execute: async (args) => {
            try {
                console.log(`[Agent Tool - createContact] Agent ${context.userId} is creating a contact.`);
                const newContact = await contactRepository.create({
                    createdById: context.userId,
                    firstName: args.firstName,
                    lastName: args.lastName,
                    email: args.email,
                    phone: args.phone,
                    jobTitle: args.jobTitle,
                    customFields: args.company ? { companyName: args.company } : {},
                    tags: args.tags || [],
                    status: 'lead' // Default status
                });
                return {
                    success: true,
                    message: `Contact ${args.firstName} created successfully.`,
                    contactId: newContact._id.toString()
                };
            } catch (error: unknown) {
                console.error('Failed to create contact via agent:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to create contact'
                };
            }
        }
    })
};

export const getContactTool = {
    name: 'getContact',
    description: 'Search for an existing CRM contact by email, phone, or name.',
    parameters: z.object({
        query: z.string().describe("The email, phone number, or name to search for.")
    }),
    factory: (context: AgentContext) => tool({
        description: 'Search for an existing CRM contact.',
        parameters: z.object({ query: z.string() }),
        execute: async (args) => {
            try {
                console.log(`[Agent Tool - getContact] Agent ${context.userId} searching for: ${args.query}`);

                // Use the repository's built-in search filter
                const result = await contactRepository.find({
                    search: args.query
                }, { limit: 10 });
                const contacts = result.data || [];

                if (contacts.length === 0) {
                    return { success: true, message: 'No contacts found matching the query.', contacts: [] };
                }

                return {
                    success: true,
                    contacts: contacts.map((c: { _id: { toString(): string }; firstName: string; lastName?: string; email?: string; phone?: string; status?: string }) => ({
                        id: c._id.toString(),
                        name: `${c.firstName} ${c.lastName || ''}`.trim(),
                        email: c.email,
                        phone: c.phone,
                        status: c.status
                    }))
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to search contacts' };
            }
        }
    })
};

// ── 3. listContacts ────────────────────────────────────────────

export const listContactsTool = {
    name: 'listContacts',
    description: 'List CRM contacts with optional filters. Use this to survey existing contacts before acting on them.',
    parameters: z.object({
        search: z.string().optional().describe('Search by name, email, or phone.'),
        status: z.enum(['lead', 'prospect', 'customer', 'churned', 'inactive']).optional().describe('Filter by contact status.'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results to return (default 10).'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'List CRM contacts with optional filters.',
        parameters: z.object({
            search: z.string().optional(),
            status: z.enum(['lead', 'prospect', 'customer', 'churned', 'inactive']).optional(),
            limit: z.number().int().min(1).max(50).optional(),
        }),
        execute: async (args) => {
            try {
                const result = await contactRepository.find({
                    search: args.search,
                    status: args.status,
                }, { limit: args.limit ?? 10 });
                const contacts = result.data || [];

                return {
                    success: true,
                    total: result.pagination.total,
                    contacts: contacts.map((c: { _id: { toString(): string }; firstName: string; lastName?: string; email?: string; phone?: string; status?: string; lifecycle?: string; jobTitle?: string }) => ({
                        id: c._id.toString(),
                        name: `${c.firstName} ${c.lastName || ''}`.trim(),
                        email: c.email,
                        phone: c.phone,
                        status: c.status,
                        lifecycle: c.lifecycle,
                        jobTitle: c.jobTitle,
                    })),
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to list contacts' };
            }
        },
    }),
};

// ── 4. updateContact ───────────────────────────────────────────

export const updateContactTool = {
    name: 'updateContact',
    description: 'Update fields on an existing CRM contact. Use the contact ID from listContacts or createContact.',
    parameters: z.object({
        contactId: z.string().describe('The ID of the contact to update.'),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        jobTitle: z.string().optional(),
        status: z.enum(['lead', 'prospect', 'customer', 'churned', 'inactive']).optional(),
        tags: z.array(z.string()).optional().describe('Replace the contact\'s tags with this list.'),
        notes: z.string().optional().describe('Plain-text notes to store on the contact.'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Update fields on an existing CRM contact.',
        parameters: z.object({
            contactId: z.string(),
            firstName: z.string().optional(),
            lastName: z.string().optional(),
            email: z.string().email().optional(),
            phone: z.string().optional(),
            jobTitle: z.string().optional(),
            status: z.enum(['lead', 'prospect', 'customer', 'churned', 'inactive']).optional(),
            tags: z.array(z.string()).optional(),
            notes: z.string().optional(),
        }),
        execute: async (args) => {
            try {
                const { contactId, notes, ...rest } = args;
                const updateData: Record<string, unknown> = { ...rest };
                if (notes) {
                    updateData.notes = [{ content: notes, createdAt: new Date(), createdById: context.userId }];
                }
                const updated = await contactRepository.update(contactId, updateData);
                if (!updated) return { success: false, error: 'Contact not found.' };
                return {
                    success: true,
                    message: `Contact updated successfully.`,
                    contactId,
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to update contact' };
            }
        },
    }),
};

// ── 5. createActivity ──────────────────────────────────────────

export const createActivityTool = {
    name: 'createActivity',
    description: 'Log an activity (note, call, task, meeting) against a CRM contact, company, or deal. Use this to record what was done or schedule follow-ups.',
    parameters: z.object({
        type: z.enum(['note', 'call', 'task', 'meeting', 'email']).describe('The type of activity.'),
        targetType: z.enum(['contact', 'company', 'deal']).describe('What this activity is attached to.'),
        targetId: z.string().describe('The ID of the contact, company, or deal.'),
        subject: z.string().describe('Short title or subject of the activity.'),
        body: z.string().optional().describe('Detailed notes or description.'),
        dueDate: z.string().optional().describe('ISO date string for when this should be done (for tasks/meetings).'),
        priority: z.enum(['low', 'medium', 'high']).optional().describe('Priority for tasks.'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Log an activity against a CRM record.',
        parameters: z.object({
            type: z.enum(['note', 'call', 'task', 'meeting', 'email']),
            targetType: z.enum(['contact', 'company', 'deal']),
            targetId: z.string(),
            subject: z.string(),
            body: z.string().optional(),
            dueDate: z.string().optional(),
            priority: z.enum(['low', 'medium', 'high']).optional(),
        }),
        execute: async (args) => {
            try {
                const activity = await activityRepository.create({
                    type: args.type,
                    targetType: args.targetType,
                    targetId: args.targetId,
                    subject: args.subject,
                    body: args.body,
                    dueDate: args.dueDate ? new Date(args.dueDate) : undefined,
                    priority: args.priority,
                    createdById: context.userId,
                });
                return {
                    success: true,
                    message: `${args.type} logged successfully.`,
                    activityId: activity._id.toString(),
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to create activity' };
            }
        },
    }),
};

// ── 6. createCompany ───────────────────────────────────────────

export const createCompanyTool = {
    name: 'createCompany',
    description: 'Create a new CRM company (account). Use when a user mentions a business/organization that should be tracked.',
    parameters: z.object({
        name: z.string().describe('The company name.'),
        domain: z.string().optional().describe('Primary domain, e.g. acme.com.'),
        website: z.string().optional().describe('Website URL.'),
        industry: z.string().optional().describe('Industry, e.g. SaaS, retail.'),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        tags: z.array(z.string()).optional().describe('Tags to categorize this company.'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Create a new CRM company.',
        parameters: z.object({
            name: z.string(),
            domain: z.string().optional(),
            website: z.string().optional(),
            industry: z.string().optional(),
            phone: z.string().optional(),
            email: z.string().email().optional(),
            tags: z.array(z.string()).optional(),
        }),
        execute: async (args) => {
            try {
                const company = await companyRepository.create({
                    createdById: context.userId,
                    name: args.name,
                    domain: args.domain,
                    website: args.website,
                    industry: args.industry,
                    phone: args.phone,
                    email: args.email,
                    tags: args.tags,
                });
                return {
                    success: true,
                    message: `Company "${args.name}" created successfully.`,
                    companyId: company._id.toString(),
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to create company' };
            }
        },
    }),
};

// ── 7. getCompany ──────────────────────────────────────────────

export const getCompanyTool = {
    name: 'getCompany',
    description: 'Fetch a CRM company by its ID. Returns full details including industry, size, and contact info.',
    parameters: z.object({
        companyId: z.string().describe('The ID of the company (from listCompanies or createCompany).'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Fetch a CRM company by ID.',
        parameters: z.object({ companyId: z.string() }),
        execute: async (args) => {
            try {
                const c = await companyRepository.findById(args.companyId);
                if (!c) return { success: false, error: 'Company not found.' };
                return {
                    success: true,
                    company: {
                        id: c._id.toString(),
                        name: c.name,
                        domain: c.domain,
                        website: c.website,
                        industry: c.industry,
                        type: c.type,
                        size: c.size,
                        phone: c.phone,
                        email: c.email,
                        tags: c.tags,
                    },
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch company' };
            }
        },
    }),
};

// ── 8. listCompanies ───────────────────────────────────────────

export const listCompaniesTool = {
    name: 'listCompanies',
    description: 'List or search CRM companies. Use this to find a company\'s ID before logging activities or linking deals.',
    parameters: z.object({
        search: z.string().optional().describe('Search by name or domain.'),
        industry: z.string().optional().describe('Filter by industry.'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results to return (default 10).'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'List CRM companies with optional filters.',
        parameters: z.object({
            search: z.string().optional(),
            industry: z.string().optional(),
            limit: z.number().int().min(1).max(50).optional(),
        }),
        execute: async (args) => {
            try {
                const result = await companyRepository.find({
                    search: args.search,
                    industry: args.industry,
                }, { limit: args.limit ?? 10 });
                const companies = result.data || [];
                return {
                    success: true,
                    total: result.pagination.total,
                    companies: companies.map((c) => ({
                        id: c._id.toString(),
                        name: c.name,
                        domain: c.domain,
                        industry: c.industry,
                        size: c.size,
                    })),
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to list companies' };
            }
        },
    }),
};

toolRegistry.register(createContactTool);
toolRegistry.register(getContactTool);
toolRegistry.register(listContactsTool);
toolRegistry.register(updateContactTool);
toolRegistry.register(createActivityTool);
toolRegistry.register(createCompanyTool);
toolRegistry.register(getCompanyTool);
toolRegistry.register(listCompaniesTool);
