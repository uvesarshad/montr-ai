import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappContactGroupRepository } from '@/lib/db/repository/whatsapp-contact-group.repository';

// GET - List all groups for organization
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const accountId = searchParams.get('accountId');
        const includeDeleted = searchParams.get('includeDeleted') === 'true';

        let groups;
        if (accountId) {
            groups = await whatsappContactGroupRepository.findByAccount(accountId, includeDeleted);
        } else {
            groups = await whatsappContactGroupRepository.findByOrganization(
                includeDeleted
            );
        }

        return NextResponse.json({
            groups,
            total: groups.length,
        });
    } catch (error) {
        console.error('Error fetching groups:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST - Create new group
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, description, whatsappAccountId } = body;

        if (!name || !whatsappAccountId) {
            return NextResponse.json(
                { error: 'Name and whatsappAccountId are required' },
                { status: 400 }
            );
        }

        const group = await whatsappContactGroupRepository.create({
            whatsappAccountId,
            name,
            description,
            createdById: session.user.id,
        });

        return NextResponse.json({
            success: true,
            group,
        });
    } catch (error) {
        console.error('Error creating group:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
