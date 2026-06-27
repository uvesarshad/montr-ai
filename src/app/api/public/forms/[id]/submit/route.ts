import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';
import FormSubmissionModel from '@/lib/db/models/form-submission.model';
import { knowledgeIngestionService } from '@/lib/knowledge-base/knowledge-ingestion.service';
import { checkFormSubmissionRateLimit, getClientIp } from '@/lib/rate-limiter';
import { ingestFormSubmissionToCrm } from '@/lib/forms/crm-intake';
import mongoose from 'mongoose';
import { z } from 'zod';

/**
 * Returns `value` only if it parses to an http(s) URL or a same-origin path.
 * Anything else (javascript:, data:, file:, vbscript:, malformed) → undefined.
 */
function isSafeRedirectUrl(value: unknown): string | undefined {
    if (typeof value !== 'string' || value.length === 0) return undefined;
    const trimmed = value.trim();
    // Same-origin relative path is always safe.
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
        return undefined;
    } catch {
        return undefined;
    }
}

/**
 * Build dynamic Zod schema from form content (Tiptap JSON)
 */
function buildValidationSchema(formContent: string): z.ZodObject<Record<string, z.ZodTypeAny>> {
    try {
        const content = JSON.parse(formContent) as { content?: unknown[] };
        const shape: Record<string, z.ZodTypeAny> = {};

        // Extract form fields from Tiptap JSON structure
        const extractFields = (node: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }): void => {
            if (node.type === 'formField') {
                const fieldId = (node.attrs?.id || node.attrs?.name) as string | undefined;
                const fieldType = node.attrs?.type || 'text';
                const required = node.attrs?.required || false;
                const label = node.attrs?.label || fieldId;

                if (!fieldId) return;

                let validator: z.ZodString = z.string();

                // Type-specific validation
                if (fieldType === 'email') {
                    validator = z.string().email(`${label} must be a valid email address`);
                } else if (fieldType === 'number') {
                    validator = z.string().regex(/^\d+$/, `${label} must be a number`);
                } else if (fieldType === 'url') {
                    validator = z.string().url(`${label} must be a valid URL`);
                } else if (fieldType === 'tel') {
                    validator = z.string().regex(/^[\d\s\-\+\(\)]+$/, `${label} must be a valid phone number`);
                }

                // Required validation
                if (required) {
                    shape[fieldId] = validator.min(1, `${label} is required`);
                } else {
                    shape[fieldId] = validator.optional();
                }
            };

            // Recursively process child nodes
            if (node.content) {
                node.content.forEach(n => extractFields(n as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }));
            }
        };

        if (content.content) {
            content.content.forEach(n => extractFields(n as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }));
        }

        return z.object(shape);
    } catch (error) {
        console.error('Error building validation schema:', error);
        // Return permissive schema if parsing fails
        return z.object({}).passthrough();
    }
}

/**
 * Send email notification for form submission
 */
async function sendFormNotification(form: { settings?: { emailNotifications?: boolean }; userId?: string; title?: string; _id?: { toString(): string } }, submissionData: Record<string, unknown>) {
    if (!form.settings?.emailNotifications) return;

    try {
        const { sendFormSubmissionEmail, isEmailConfigured } = await import('@/lib/email');

        if (!isEmailConfigured()) {
            console.warn('Email service not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD environment variables.');
            return;
        }

        // Get user's email to send notification
        const User = (await import('@/lib/db/models/user.model')).default;
        const user = await User.findById(form.userId).select('email').lean();

        if (!user?.email) {
            console.warn('User email not found. Cannot send notification.');
            return;
        }

        await sendFormSubmissionEmail({
            formTitle: form.title || '',
            formId: form._id?.toString() || '',
            submissionData,
            recipientEmail: user.email,
            submittedAt: new Date(),
        });

        console.log(`Email notification sent successfully to: ${user.email}`);
    } catch (error) {
        console.error('Error sending form notification email:', error);
        // Don't throw - we don't want to fail the submission if email fails
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();

        // Rate limit by IP per form. Uses TRUST_PROXY_DEPTH-aware parser so a
        // forged `x-forwarded-for` can't bypass per-IP quotas.
        const ip = getClientIp(req.headers);

        const rateLimit = await checkFormSubmissionRateLimit(id, ip);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Too many submissions. Please try again later.' },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.retryAfter) },
                }
            );
        }

        await dbConnect();

        // Get the form to verify existence and get settings
        // Accept ID or Slug
        const query = mongoose.isValidObjectId(id) ? { _id: id } : { slug: id };
        const form = await FormModel.findOne({ ...query, isPublished: true })
            .select('+password');

        if (!form) {
            return NextResponse.json({ error: 'Form not found or not published' }, { status: 404 });
        }

        // Password gate — reject submissions to password-protected forms without valid credentials
        if (form.isPasswordProtected) {
            const providedPassword = body._formPassword;
            let authorized = false;

            if (providedPassword && form.password) {
                const bcrypt = await import('bcryptjs');
                authorized = await bcrypt.compare(String(providedPassword), form.password);
            }

            if (!authorized) {
                return NextResponse.json({ error: 'Password required' }, { status: 401 });
            }

            // Don't treat the password field as a form answer
            delete body.data?._formPassword;
        }

        // Validate body.data exists
        if (!body.data) {
            return NextResponse.json({ error: 'Submission data is missing' }, { status: 400 });
        }

        // HONEYPOT SPAM PROTECTION
        // Check for honeypot field (should be empty if legitimate)
        if (body.data._honeypot || body.data.website) {
            console.warn('Spam detected via honeypot field');
            // Return success to avoid revealing spam detection
            return NextResponse.json({
                success: true,
                message: 'Submitted successfully'
            });
        }

        // SERVER-SIDE VALIDATION
        try {
            const validationSchema = buildValidationSchema(form.content);
            const validatedData = validationSchema.parse(body.data);

            // Save submission with validated data. Capture the doc so we can
            // link contactId back onto it from the CRM intake (B3-4.5.2).
            const submissionDoc = await FormSubmissionModel.create({
                formId: form._id,
                ...(form.brandId ? { brandId: form.brandId } : {}),
                data: validatedData,
                metadata: {
                    ip,
                    userAgent: req.headers.get('user-agent') || 'unknown',
                },
                submittedAt: new Date()
            });

            // Increment submission count
            await FormModel.updateOne({ _id: form._id }, { $inc: { submissionsCount: 1 } });

            // Send email notification (async, non-blocking)
            sendFormNotification(form, validatedData).catch(err =>
                console.error('Email notification failed:', err)
            );

            // Background CRM intake — create contact if form has CRM integration enabled.
            // We chain the workflow trigger dispatch onto the intake result so the
            // form_submission payload carries the created/matched contactId. The
            // whole chain is fire-and-forget — a dispatch error must never fail the
            // public submission. Org is read from the FORM record, never the request.
            const formOrgId = form.userId;
            if (formOrgId) {
                void (async () => {
                    let intakeContactId: string | undefined;
                    if (form.settings?.crmIntegration?.enabled) {
                        try {
                            const intake = await ingestFormSubmissionToCrm({
                                brandId: form.brandId ?? null,
                                formId: form._id.toString(),
                                formTitle: form.title,
                                ownerId: form.userId,
                                crmIntegration: form.settings.crmIntegration!,
                                submissionData: validatedData,
                                submissionId: submissionDoc._id?.toString(),
                            });
                            intakeContactId = intake?.contactId;
                        } catch (err) {
                            console.error('CRM intake failed:', err);
                        }
                    }
                    try {
                        const { dispatchTrigger } = await import('@/lib/workflow/triggers/dispatch');
                        await dispatchTrigger({
                            kind: 'form_submission',
                            brandId: form.brandId ?? undefined,
                            formId: form._id.toString(),
                            formName: form.title,
                            submissionId: submissionDoc._id?.toString() ?? '',
                            fields: validatedData,
                            contactId: intakeContactId,
                        });
                    } catch (err) {
                        console.error('Form submission trigger dispatch failed:', err);
                    }
                })();
            }

            // Background sync to Knowledge Base (Non-blocking)
            const submissionText = Object.entries(validatedData)
                .map(([key, value]) => `${key}: ${value}`)
                .join('\n');

            knowledgeIngestionService.ingestFormContext(
                form.userId.toString(),
                form._id.toString(),
                form.title,
                `A new form submission was received.\n\nFields:\n${submissionText}`
            ).catch(err => console.error('Knowledge Base ingestion failed:', err));

            // Only return the thankYouUrl when it parses to http(s). The form
            // owner controls this value and the client navigates to it on
            // success, so a bare `javascript:alert(...)` or `data:text/html,…`
            // would otherwise become a stored-XSS vector.
            const safeRedirectUrl = isSafeRedirectUrl(form.settings.thankYouUrl);

            return NextResponse.json({
                success: true,
                message: form.settings.thankYouMessage || 'Thank you for your submission!',
                redirectUrl: safeRedirectUrl,
            });

        } catch (validationError) {
            if (validationError instanceof z.ZodError) {
                return NextResponse.json({
                    error: 'Validation failed',
                    details: validationError.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                }, { status: 400 });
            }
            throw validationError;
        }

    } catch (error) {
        console.error('Error submitting form:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            message: 'Failed to submit form. Please try again later.'
        }, { status: 500 });
    }
}
