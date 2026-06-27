import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { whatsappMessageRepository } from '@/lib/db/repository/whatsapp-message.repository';
import { z } from 'zod';

const updateStatusSchema = z.object({
  status: z.enum(['scheduled', 'sending', 'sent', 'delivered', 'read', 'failed']),
  errorMessage: z.string().optional(),
  deliveredAt: z.string().datetime().optional(),
  readAt: z.string().datetime().optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const body = await request.json();
    const validatedData = updateStatusSchema.parse(body);

    const message = await whatsappMessageRepository.findById(params.id);

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      );
    }

    // Verify message belongs to organization
    // Prepare update data
    const updateData: Record<string, unknown> = {
      status: validatedData.status,
    };

    if (validatedData.errorMessage) {
      updateData.errorMessage = validatedData.errorMessage;
    }

    if (validatedData.deliveredAt) {
      updateData.deliveredAt = new Date(validatedData.deliveredAt);
    }

    if (validatedData.readAt) {
      updateData.readAt = new Date(validatedData.readAt);
    }

    // Auto-set timestamps based on status
    if (validatedData.status === 'sent' && !message.sentAt) {
      updateData.sentAt = new Date();
    }

    if (validatedData.status === 'delivered' && !updateData.deliveredAt && !message.deliveredAt) {
      updateData.deliveredAt = new Date();
    }

    if (validatedData.status === 'read' && !updateData.readAt && !message.readAt) {
      updateData.readAt = new Date();
    }

    // Update message
    const updatedMessage = await whatsappMessageRepository.update(
      params.id,
      updateData
    );

    return NextResponse.json({
      message: 'Message status updated successfully',
      data: updatedMessage,
    });
  } catch (error) {
    console.error('Error updating message status:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update message status', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
