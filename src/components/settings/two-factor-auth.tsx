'use client';

import Image from 'next/image';
import { useState } from 'react';
import QRCode from 'qrcode';
import { Button, Card, Banner, Chip, Field, Input, Spinner, FormDialog } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { authClient } from '@/lib/auth-client';
import { Shield, Check, Copy, AlertTriangle } from 'lucide-react';

interface TwoFactorAuthProps {
    isEnabled: boolean;
    onStatusChange: () => void;
}

export function TwoFactorAuth({ isEnabled, onStatusChange }: TwoFactorAuthProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [step, setStep] = useState<'idle' | 'qr' | 'verify' | 'success'>('idle');

    // Enable Flow Data
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [totpUri, setTotpUri] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [password, setPassword] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);

    // Disable Flow Data
    const [disablePassword, setDisablePassword] = useState('');
    const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);

    const startEnableFlow = async () => {
        if (!password) {
            toast({
                variant: 'destructive',
                title: 'Password required',
                description: 'Please enter your current password to begin 2FA setup.',
            });
            return;
        }

        setIsLoading(true);
        try {
            const { data, error } = await authClient.twoFactor.enable({ password });
            if (error) throw new Error(error.message || 'Failed to start 2FA setup.');
            if (!data) throw new Error('Failed to start 2FA setup.');

            // BetterAuth returns a `totpURI` (otpauth://...) and one-time `backupCodes`.
            // 2FA is NOT active until a code is verified, so stash codes for the success step.
            setTotpUri(data.totpURI);
            setBackupCodes(data.backupCodes ?? []);
            const dataUrl = await QRCode.toDataURL(data.totpURI);
            setQrCodeUrl(dataUrl);
            setStep('qr');
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to start 2FA setup. Please try again.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const verifyAndEnable = async () => {
        if (!verificationCode) {
            toast({
                variant: 'destructive',
                title: 'Missing fields',
                description: 'Please enter the verification code from your authenticator app.',
            });
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await authClient.twoFactor.verifyTotp({ code: verificationCode });
            if (error) throw new Error(error.message || 'Invalid verification code.');

            setStep('success');
            onStatusChange(); // Notify parent to refresh user profile/status
            toast({
                title: '2FA Enabled',
                description: 'Two-factor authentication has been enabled successfully.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Verification Failed',
                description: error instanceof Error ? error.message : 'Invalid code. Please try again.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const disable2FA = async () => {
        if (!disablePassword) return;

        setIsLoading(true);
        try {
            const { error } = await authClient.twoFactor.disable({ password: disablePassword });
            if (error) throw new Error(error.message || 'Failed to disable 2FA.');

            setDisablePassword('');
            onStatusChange();
            toast({
                title: '2FA Disabled',
                description: 'Two-factor authentication has been disabled.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to disable 2FA.',
            });
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const copyBackupCodes = () => {
        navigator.clipboard.writeText(backupCodes.join('\n'));
        toast({
            title: 'Copied',
            description: 'Backup codes copied to clipboard.',
        });
    };

    if (isEnabled) {
        return (
            <Card icon={Shield} title="Two-Factor Authentication" meta="your account is secured with 2FA" bodyClassName="px-4 pb-4">
                <div className="flex items-center justify-between">
                    <Chip tone="ok" icon={Check}>Enabled</Chip>

                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger-muted"
                        onClick={() => setIsDisableDialogOpen(true)}
                    >
                        Disable 2FA
                    </Button>
                </div>

                <FormDialog
                    open={isDisableDialogOpen}
                    onOpenChange={setIsDisableDialogOpen}
                    title="Disable Two-Factor Authentication?"
                    description="This will remove the extra layer of security from your account. You will need to re-configure it if you enable it again."
                    icon={Shield}
                    destructive
                    submitLabel="Disable 2FA"
                    submitDisabled={!disablePassword}
                    submitting={isLoading}
                    onSubmit={disable2FA}
                >
                    <Field label="Confirm with Password">
                        <Input
                            type="password"
                            value={disablePassword}
                            onChange={(e) => setDisablePassword(e.target.value)}
                            placeholder="Current Password"
                        />
                    </Field>
                </FormDialog>
            </Card>
        );
    }

    // ENABLE FLOW
    return (
        <Card
            icon={Shield}
            title="Two-Factor Authentication"
            meta="add an extra layer of security"
            bodyClassName="px-4 pb-4"
            footer={
                (step === 'qr' || step === 'success') ? (
                    <div className="flex w-full justify-end">
                        {step === 'qr' && (
                            <div className="flex gap-2">
                                <Button variant="ghost" onClick={() => setStep('idle')}>Cancel</Button>
                                <Button variant="primary" onClick={verifyAndEnable} disabled={isLoading || !verificationCode}>
                                    {isLoading ? 'Verifying...' : 'Verify & Enable'}
                                </Button>
                            </div>
                        )}
                        {step === 'success' && (
                            <Button variant="primary" onClick={() => setStep('idle')}>Done</Button>
                        )}
                    </div>
                ) : undefined
            }
        >
            {step === 'idle' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Chip tone="gray" icon={Shield}>Currently Disabled</Chip>
                    </div>
                    <Field label="Confirm Password">
                        <Input
                            type="password"
                            placeholder="Your current password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </Field>
                    <div className="flex justify-end">
                        <Button variant="primary" onClick={startEnableFlow} disabled={isLoading || !password}>
                            {isLoading ? <Spinner size={13} className="border-current" /> : null}
                            Enable 2FA
                        </Button>
                    </div>
                </div>
            )}

            {step === 'qr' && (
                <div className="space-y-6">
                    <div className="flex flex-col items-center space-y-4 border border-border p-4 rounded-md bg-muted/30">
                        {qrCodeUrl ? (
                            <Image src={qrCodeUrl} alt="2FA QR Code" width={192} height={192} className="bg-white p-2 rounded" unoptimized />
                        ) : (
                            <Spinner size={48} />
                        )}
                        <div className="text-center space-y-1">
                            <p className="font-medium text-sm">Scan this QR code with your authenticator app</p>
                            <p className="text-xs text-muted-foreground">Google Authenticator, Authy, etc.</p>
                            {totpUri ? (
                                <p className="text-[10px] text-muted-foreground break-all max-w-xs pt-1">{totpUri}</p>
                            ) : null}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Field label="Verification Code">
                            <Input
                                placeholder="Enter 6-digit code"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            />
                        </Field>
                    </div>
                </div>
            )}

            {step === 'success' && (
                <div className="space-y-6">
                    <Banner tone="ok" icon={Check} title="Success!">
                        Two-factor authentication is now enabled.
                    </Banner>

                    {backupCodes.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="font-medium text-sm">Backup Codes</h4>
                                <Button variant="ghost" size="sm" icon={Copy} onClick={copyBackupCodes}>
                                    Copy
                                </Button>
                            </div>
                            <Banner tone="danger" icon={AlertTriangle} title="Save these codes!">
                                If you lose access to your device, these codes are the only way to access your account.
                            </Banner>
                            <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-md font-mono text-sm">
                                {backupCodes.map((code) => (
                                    <div key={code}>{code}</div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}
