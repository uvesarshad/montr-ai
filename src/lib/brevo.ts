/**
 * Brevo Transactional Email Utility
 * Sends verification emails via Brevo's v3 SMTP API.
 */

const BREVO_API_URL = 'https://api.brevo.com/v3';

interface BrevoEmailOptions {
    to: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
}

async function sendBrevoEmail(options: BrevoEmailOptions): Promise<{ messageId: string }> {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@montrai.com';
    const senderName = process.env.BREVO_SENDER_NAME || 'MontrAI';

    if (!apiKey) {
        throw new Error('BREVO_API_KEY environment variable is not set');
    }

    const response = await fetch(`${BREVO_API_URL}/smtp/email`, {
        method: 'POST',
        headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: options.to }],
            subject: options.subject,
            htmlContent: options.htmlContent,
            textContent: options.textContent,
        }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Brevo API Error: ${error.message || response.statusText}`);
    }

    return response.json();
}

/**
 * Send a verification email to the user with a clickable link.
 */
export async function sendVerificationEmail(to: string, token: string): Promise<void> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
    const verificationUrl = `${appUrl}/api/auth/verify-email?token=${token}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">MontrAI</h1>
        </div>
        <div style="padding: 32px 24px;">
            <h2 style="color: #18181b; margin: 0 0 12px; font-size: 20px; font-weight: 600;">Verify your email address</h2>
            <p style="color: #52525b; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                Thanks for signing up! Please click the button below to verify your email address and activate your account.
            </p>
            <div style="text-align: center; margin: 0 0 24px;">
                <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
                    Verify Email Address
                </a>
            </div>
            <p style="color: #71717a; margin: 0 0 16px; font-size: 13px; line-height: 1.5;">
                If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="color: #6366f1; margin: 0 0 24px; font-size: 13px; word-break: break-all;">
                ${verificationUrl}
            </p>
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
            <p style="color: #a1a1aa; margin: 0; font-size: 12px; line-height: 1.5;">
                This link expires in 24 hours. If you didn't create an account with MontrAI, you can safely ignore this email.
            </p>
        </div>
    </div>
</body>
</html>`;

    const textContent = `Verify your email address\n\nThanks for signing up for MontrAI! Please verify your email by visiting this link:\n\n${verificationUrl}\n\nThis link expires in 24 hours. If you didn't create an account, you can safely ignore this email.`;

    await sendBrevoEmail({
        to,
        subject: 'Verify your email address — MontrAI',
        htmlContent,
        textContent,
    });
}

/**
 * Send a password reset email to the user with a clickable link.
 */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">MontrAI</h1>
        </div>
        <div style="padding: 32px 24px;">
            <h2 style="color: #18181b; margin: 0 0 12px; font-size: 20px; font-weight: 600;">Reset Your Password</h2>
            <p style="color: #52525b; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                You recently requested to reset your password for your MontrAI account. Click the button below to proceed.
            </p>
            <div style="text-align: center; margin: 0 0 24px;">
                <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
                    Reset Password
                </a>
            </div>
            <p style="color: #71717a; margin: 0 0 16px; font-size: 13px; line-height: 1.5;">
                If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="color: #6366f1; margin: 0 0 24px; font-size: 13px; word-break: break-all;">
                ${resetUrl}
            </p>
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
            <p style="color: #a1a1aa; margin: 0; font-size: 12px; line-height: 1.5;">
                This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.
            </p>
        </div>
    </div>
</body>
</html>`;

    const textContent = `Reset Your Password\n\nYou recently requested to reset your password for your MontrAI account. Please visit this link to proceed:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.`;

    await sendBrevoEmail({
        to,
        subject: 'Reset your password — MontrAI',
        htmlContent,
        textContent,
    });
}

/**
 * Send a passwordless magic sign-in link.
 */
export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">MontrAI</h1>
        </div>
        <div style="padding: 32px 24px;">
            <h2 style="color: #18181b; margin: 0 0 12px; font-size: 20px; font-weight: 600;">Sign in to MontrAI</h2>
            <p style="color: #52525b; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                Click the button below to sign in to your MontrAI account. This link is single-use.
            </p>
            <div style="text-align: center; margin: 0 0 24px;">
                <a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
                    Sign In
                </a>
            </div>
            <p style="color: #71717a; margin: 0 0 16px; font-size: 13px; line-height: 1.5;">
                If the button doesn't work, copy and paste this link into your browser:
            </p>
            <p style="color: #6366f1; margin: 0 0 24px; font-size: 13px; word-break: break-all;">
                ${url}
            </p>
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
            <p style="color: #a1a1aa; margin: 0; font-size: 12px; line-height: 1.5;">
                This link expires shortly. If you didn't request it, you can safely ignore this email.
            </p>
        </div>
    </div>
</body>
</html>`;

    const textContent = `Sign in to MontrAI\n\nUse this single-use link to sign in:\n\n${url}\n\nIf you didn't request it, you can safely ignore this email.`;

    await sendBrevoEmail({
        to,
        subject: 'Sign in to MontrAI',
        htmlContent,
        textContent,
    });
}

/**
 * Send an OTP login code.
 */
export async function sendOtpEmail(to: string, code: string): Promise<void> {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">MontrAI</h1>
        </div>
        <div style="padding: 32px 24px;">
            <h2 style="color: #18181b; margin: 0 0 12px; font-size: 20px; font-weight: 600;">Your Login Code</h2>
            <p style="color: #52525b; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
                Use the one-time code below to sign in to your MontrAI account.
            </p>
            <div style="text-align: center; margin: 0 0 24px;">
                <div style="display: inline-block; background: #f3f4f6; color: #111827; letter-spacing: 4px; padding: 12px 32px; border-radius: 8px; font-size: 32px; font-weight: 700;">
                    ${code}
                </div>
            </div>
            <p style="color: #71717a; margin: 0 0 16px; font-size: 13px; line-height: 1.5;">
                This code will expire in 10 minutes. Please do not share this code with anyone.
            </p>
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;">
            <p style="color: #a1a1aa; margin: 0; font-size: 12px; line-height: 1.5;">
                If you did not request this login code, you can safely ignore this email.
            </p>
        </div>
    </div>
</body>
</html>`;

    const textContent = `Your Login Code\n\nUse the one-time code below to sign in to your MontrAI account:\n\n${code}\n\nThis code will expire in 10 minutes.`;

    await sendBrevoEmail({
        to,
        subject: 'Your MontrAI Login Code',
        htmlContent,
        textContent,
    });
}
