
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { generateTemplateSchema } from '@/validations/marketing-email/template.schema';
import { templateService } from '@/lib/marketing-email/services/template.service';
import { applyAiRateLimit } from '@/lib/ai/rate-limit';

// Single-tenant override (oss-build): the strip narrows `session.user.id` to a
// definite `string` (the org auth-gate is rewritten to `.id`), which makes the
// original `// @ts-expect-error` on the `userId` argument an UNUSED directive — so it
// is dropped here. `templateService.generateWithAI(prompt, _organizationId, _userId)`
// keeps its 3 params (the `_organizationId` underscore-name is OUT of the org sweep);
// owner-as-org supplies the caller's own id for the retained org slot.
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // AI template generation is one of the most expensive flows — cap it.
        const limited = await applyAiRateLimit(
            req,
            'ai:marketing-email-template',
            session.user.id,
        );
        if (limited) return limited;

        const body = await req.json();
        const validated = generateTemplateSchema.safeParse(body);

        if (!validated.success) {
            return NextResponse.json({ error: validated.error.flatten() }, { status: 400 });
        }

        // TODO: Check and deduct credits here

        try {
            const result = await templateService.generateWithAI(
                validated.data.prompt,
                session.user.id,
                session.user.id,
            );

            return NextResponse.json(result);
        } catch (error) {
            return NextResponse.json({ error: 'AI Generation Failed: ' + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
        }

    } catch (error) {
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
