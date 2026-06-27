/**
 * Credential Vault API
 *
 * CRUD operations for encrypted credential storage.
 * Credentials are encrypted with AES-256-GCM per-user.
 *
 * GET    - List credentials (masked values)
 * POST   - Create a new credential
 * DELETE - Delete a credential by name
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import {
  encryptCredential,
  decryptCredential,
  maskCredentialValue,
} from '@/lib/workflow/credential-encryption';
import { logCreate, logUpdate, logDelete, getRequestMetadata } from '@/lib/crm/audit';

const SINGLE_TENANT_KEY_SCOPE = 'local';

// In-memory store key = orgId, each org has a Map<credentialName, encryptedData>
// In production this would be a MongoDB collection — we use a simple model here
async function getCredentialModel() {
  await dbConnect();
  const mongoose = await import('mongoose');

  // Define schema if not already defined
  if (!mongoose.default.models.WorkflowCredential) {
    const schema = new mongoose.Schema({
      userId: { type: String, required: true },
      name: { type: String, required: true },
      type: { type: String, enum: ['api_key', 'oauth', 'basic_auth', 'custom'], required: true },
      encryptedValue: { type: String, required: true },
      iv: { type: String, required: true },
      authTag: { type: String, required: true },
      salt: { type: String, required: true },
      metadata: { type: Object, default: {} },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
    });
    schema.index({ name: 1 }, { unique: true });
    mongoose.default.model('WorkflowCredential', schema);
  }

  return mongoose.default.models.WorkflowCredential;
}

/**
 * GET /api/v2/credentials — List all credentials (masked)
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const Credential = await getCredentialModel();
    const credentials = await Credential.find({
}).sort({ updatedAt: -1 });

    // Return credentials with masked values
    type CredentialDoc = { _id: { toString(): string }; name: string; type: string; userId?: string; toObject(): Record<string, unknown>; metadata: unknown; createdAt: Date; updatedAt: Date };
    const masked = credentials.map((c: CredentialDoc) => {
      try {
        // Org-scoped credentials are keyed by organizationId; fall back to the
        // original creator's userId for legacy rows encrypted before org-scoping.
        const decrypted = decryptCredential(c.toObject() as { name: string; type: string; encryptedValue: string; iv: string; authTag: string; salt: string; metadata?: Record<string, unknown> }, SINGLE_TENANT_KEY_SCOPE, c.userId);
        return {
          _id: c._id.toString(),
          name: c.name,
          type: c.type,
          maskedValue: maskCredentialValue(
            typeof decrypted.value === 'string' ? decrypted.value : JSON.stringify(decrypted.value)
          ),
          metadata: c.metadata,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        };
      } catch {
        return {
          _id: c._id.toString(),
          name: c.name,
          type: c.type,
          maskedValue: '***',
          metadata: c.metadata,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        };
      }
    });

    return NextResponse.json({ credentials: masked });
  } catch (error) {
    console.error('Failed to list credentials:', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}

/**
 * POST /api/v2/credentials — Create or update a credential
 * Body: { name, type, value, metadata? }
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, type, value, metadata } = body;

    if (!name || !type || !value) {
      return NextResponse.json(
        { error: 'name, type, and value are required' },
        { status: 400 }
      );
    }

    if (!['api_key', 'oauth', 'basic_auth', 'custom'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be one of: api_key, oauth, basic_auth, custom' },
        { status: 400 }
      );
    }

    // Encrypt under the organization scope so any member of the org can decrypt
    // the shared credential (the vault row is unique per {organizationId, name}).
    const encrypted = encryptCredential(name, type, value, SINGLE_TENANT_KEY_SCOPE, metadata);

    const Credential = await getCredentialModel();

    // Detect whether this is a true create or an update so we can audit log
    // the right action. Existence check uses the same uniqueness predicate
    // the upsert below relies on.
    const existing = await Credential.findOne({
      name,
    });

    // Upsert — update if name exists, otherwise create
    const result = await Credential.findOneAndUpdate(
      { name },
      {
        ...encrypted,
        userId: session.user.id,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Never log the cleartext value, only safe metadata.
    const auditMetadata = getRequestMetadata(request);
    const userName = session.user.name || session.user.email || 'User';
    if (existing) {
      await logUpdate(
        'workflow_credential',
        result._id.toString(),
        { type: existing.type, metadata: existing.metadata },
        { type: result.type, metadata: result.metadata },
        session.user.id!,
        userName,
        'ui',
        auditMetadata,
      ).catch(err => console.error('[audit] credential update:', err));
    } else {
      await logCreate(
        'workflow_credential',
        result._id.toString(),
        { name: result.name, type: result.type, metadata: result.metadata },
        session.user.id!,
        userName,
        'ui',
        auditMetadata,
      ).catch(err => console.error('[audit] credential create:', err));
    }

    return NextResponse.json({
      credential: {
        _id: result._id.toString(),
        name: result.name,
        type: result.type,
        maskedValue: maskCredentialValue(typeof value === 'string' ? value : JSON.stringify(value)),
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      },
    });
  } catch (error) {
    console.error('Failed to create credential:', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}

/**
 * DELETE /api/v2/credentials — Delete a credential
 * Query: ?name=credential_name
 */
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return NextResponse.json({ error: 'name query parameter is required' }, { status: 400 });
    }

    const Credential = await getCredentialModel();
    // Fetch first so we have the document for the audit log entry.
    const existing = await Credential.findOne({
      name,
    });
    if (!existing) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    }
    await Credential.deleteOne({ _id: existing._id });

    const userName = session.user.name || session.user.email || 'User';
    await logDelete(
      'workflow_credential',
      existing._id.toString(),
      { name: existing.name, type: existing.type, metadata: existing.metadata },
      session.user.id!,
      userName,
      'ui',
      getRequestMetadata(request),
    ).catch(err => console.error('[audit] credential delete:', err));

    return NextResponse.json({ deleted: true, name });
  } catch (error) {
    console.error('Failed to delete credential:', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
