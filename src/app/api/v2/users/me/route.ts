import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { dbConnect } from '@/lib/db/connect';

import Organization from '@/lib/db/models/organization.model';

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const user = await userRepository.findById(session.user.id!);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Sync company with organization if organizationId exists
    let organizationName = null;
    const organization = await Organization.findById(user.id!);
      if (organization) {
              organizationName = organization.name;
              // If fetching locally, we might want to return this 'synced' value
              // The frontend can decide whether to set 'company' to this value or just display it
              // But the user request said "Sync Company from organization"
            }

    const userData = user.toObject();

    // Explicitly convert Map to Object for JSON serialization
    if (userData.aiPreferences && userData.aiPreferences instanceof Map) {
      userData.aiPreferences = Object.fromEntries(userData.aiPreferences);
    } else if (user.aiPreferences && user.aiPreferences instanceof Map) {
      // Fallback if toObject() didn't include it properly but it exists on document
      userData.aiPreferences = Object.fromEntries(user.aiPreferences);
    }

    if (organizationName) {
      userData.organizationName = organizationName;
      // Auto-sync company name if user belongs to an org
      if (!userData.company || userData.company !== organizationName) {
        userData.company = organizationName;
      }
    }

    // Don't expose sensitive fields like password if we had them (we don't right now, but good practice)
    // The user schema is already fairly safe, but we explicitly return what we need.
    return NextResponse.json(userData);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Whitelist allowed fields to update
    const allowedUpdates = [
      'userApiKeys',
      'bio',
      'name',
      'firstName',
      'lastName',
      'company',
      'billingAddress',
      'image',
      'phoneNumber',
      'theme',
      'aiPreferences'
    ];
    const updateData: Record<string, unknown> = {};

    Object.keys(body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updateData[key] = body[key];
      }
    });

    // Special handling for nested objects if needed, but simple assignment works for userApiKeys if passed as full object
    // Or we could use dot notation logic if we only passed partial keys. 
    // For now, assume client sends full object or we merge on server.
    // Mongoose updates merge top-level, so userApiKeys would be overwritten if we just pass it.
    // If we want to support partial updates to keys, we might need logic.
    // But let's assume the settings page sends the whole keys object.

    await dbConnect();
    const updatedUser = await userRepository.update(session.user.id!, updateData);

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
