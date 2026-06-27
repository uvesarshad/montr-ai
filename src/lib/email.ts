/**
 * Email Service Module
 * Provides email sending functionality across the platform
 */

import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

/**
 * Send an email using SMTP configuration
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    // Create transporter using environment variables
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // Verify transporter configuration
    await transporter.verify();

    // Send email
    await transporter.sendMail({
      from: options.from || process.env.SMTP_FROM || process.env.SMTP_USER,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
      replyTo: options.replyTo,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    console.log(`Email sent successfully to ${options.to}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Send form submission notification email
 */
export async function sendFormSubmissionEmail(params: {
  formTitle: string;
  formId: string;
  submissionData: Record<string, unknown>;
  recipientEmail: string;
  submittedAt: Date;
}): Promise<void> {
  const { formTitle, formId, submissionData, recipientEmail, submittedAt } = params;

  // Build HTML email content
  const dataRows = Object.entries(submissionData)
    .filter(([key]) => !key.startsWith('_')) // Filter out internal fields like _honeypot
    .map(([key, value]) => {
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      return `
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">
            ${key}
          </td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;">
            ${displayValue || '-'}
          </td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Form Submission</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">
              📋 New Form Submission
            </h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 30px;">
            <p style="margin: 0 0 20px 0; font-size: 16px;">
              You have received a new submission for <strong>${formTitle}</strong>.
            </p>
            
            <div style="background-color: #f9fafb; border-left: 4px solid #667eea; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
              <p style="margin: 0; font-size: 14px; color: #6b7280;">
                <strong>Submitted:</strong> ${submittedAt.toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
  })}
              </p>
            </div>
            
            <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 16px 0; color: #1f2937;">
              Submission Details
            </h2>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              ${dataRows}
            </table>
            
            <div style="text-align: center; margin-top: 32px;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/forms/${formId}/submissions" 
                 style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                View All Submissions
              </a>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; font-size: 12px; color: #6b7280;">
              This email was sent by <strong>MontrAI</strong> form notification system.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
New Form Submission - ${formTitle}

Submitted: ${submittedAt.toLocaleString()}

Submission Details:
${Object.entries(submissionData)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}`)
      .join('\n')}

View all submissions: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/forms/${formId}/submissions
  `;

  await sendEmail({
    to: recipientEmail,
    subject: `New submission for "${formTitle}"`,
    html,
    text,
  });
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  );
}
