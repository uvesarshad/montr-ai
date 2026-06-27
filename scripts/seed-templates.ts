
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { FORM_TEMPLATES } from '@/lib/forms/templates';
import FormTemplate from '@/lib/db/models/form-template.model';
import DocTemplate from '@/lib/db/models/doc-template.model';
import User from '@/lib/db/models/user.model';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('Please define the MONGODB_URI environment variable inside .env.local');
    process.exit(1);
}

// Sample Doc Templates
const DOC_TEMPLATES = [
    {
        title: 'Project Proposal',
        description: 'A comprehensive project proposal template with sections for objectives, scope, timeline, and budget.',
        icon: 'FileText',
        content: JSON.stringify({
            type: 'doc',
            content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Project Proposal' }] },
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Executive Summary' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Brief overview of the project...' }] },
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Objectives' }] },
                {
                    type: 'bulletList', content: [
                        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Objective 1' }] }] },
                        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Objective 2' }] }] }
                    ]
                }
            ]
        }),
        settings: { coverImage: '' }
    },
    {
        title: 'Meeting Notes',
        description: 'Standard template for capturing meeting minutes, action items, and attendees.',
        icon: 'PenSquare',
        content: JSON.stringify({
            type: 'doc',
            content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Meeting Notes' }] },
                { type: 'paragraph', content: [{ type: 'text', text: `Date: ${new Date().toLocaleDateString()}` }] },
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Attendees' }] },
                {
                    type: 'bulletList', content: [
                        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Person 1' }] }] }
                    ]
                },
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agenda' }] },
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Action Items' }] }
            ]
        }),
        settings: { coverImage: '' }
    },
    {
        title: 'Marketing Plan',
        description: 'Strategic marketing plan template including target audience, channels, and budget.',
        icon: 'Compass',
        content: JSON.stringify({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Marketing Plan' }] }] }),
        settings: { coverImage: '' }
    }
];

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI as string);
        console.log('Connected to database');

        // Find a super admin to assign as creator
        let superAdmin = await User.findOne({ role: 'super_admin' });

        if (!superAdmin) {
            console.warn('No super_admin found. Using first user found or creating placeholder ID.');
            superAdmin = await User.findOne({});
        }

        const creatorId = superAdmin ? superAdmin._id : new mongoose.Types.ObjectId();
        console.log(`Assigning templates to creator: ${creatorId}`);

        // Seed Form Templates
        console.log('Seeding Form Templates...');
        for (const t of FORM_TEMPLATES) {
            const exists = await FormTemplate.findOne({ title: t.title });
            if (!exists) {
                await FormTemplate.create({
                    title: t.title,
                    description: t.description,
                    icon: t.icon,
                    content: t.content,
                    settings: t.settings,
                    isActive: true,
                    createdBy: creatorId,
                    sortOrder: 0
                });
                console.log(`Created form template: ${t.title}`);
            } else {
                console.log(`Form template already exists: ${t.title}`);
            }
        }

        // Seed Doc Templates
        console.log('Seeding Doc Templates...');
        for (const t of DOC_TEMPLATES) {
            const exists = await DocTemplate.findOne({ title: t.title });
            if (!exists) {
                await DocTemplate.create({
                    title: t.title,
                    description: t.description,
                    icon: t.icon,
                    content: t.content,
                    settings: t.settings,
                    isActive: true,
                    createdBy: creatorId,
                    sortOrder: 0
                });
                console.log(`Created doc template: ${t.title}`);
            } else {
                console.log(`Doc template already exists: ${t.title}`);
            }
        }

        console.log('Seeding completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding templates:', error);
        process.exit(1);
    }
}

seed();
