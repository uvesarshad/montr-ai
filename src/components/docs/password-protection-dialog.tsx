'use client';

import React, { useState } from 'react';
import { Button, Input } from '@/components/ui-kit';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Lock, Unlock, Loader2, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PasswordProtectionDialogProps {
    isPasswordProtected: boolean;
    onUpdate: (password: string | null) => Promise<void>;
}

export function PasswordProtectionDialog({ isPasswordProtected, onUpdate }: PasswordProtectionDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!password && !isPasswordProtected) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Please enter a password',
            });
            return;
        }

        try {
            setIsLoading(true);
            await onUpdate(password);
            setIsOpen(false);
            setPassword('');
            toast({
                title: 'Success',
                description: password ? 'Password protection enabled' : 'Password protection updated',
            });
        } catch (_error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to update password protection',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemove = async () => {
        try {
            setIsLoading(true);
            await onUpdate(null); // Null means remove password
            setIsOpen(false);
            setPassword('');
            toast({
                title: 'Success',
                description: 'Password protection disabled',
            });
        } catch (_error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to remove password',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-start">
                    {isPasswordProtected ? (
                        <>
                            <Lock className="mr-2 size-4 text-warning" />
                            <span>Password Protected</span>
                        </>
                    ) : (
                        <>
                            <Unlock className="mr-2 size-4" />
                            <span>Password Protection</span>
                        </>
                    )}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Password Protection</DialogTitle>
                    <DialogDescription>
                        {isPasswordProtected
                            ? 'This document is currently password protected. You can update the password or disable protection.'
                            : 'Set a password to restrict access to this document.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={isPasswordProtected ? 'Enter new password to update' : 'Enter password'}
                            required={!isPasswordProtected}
                            trailingIcon={showPassword ? EyeOff : Eye}
                            onTrailingClick={() => setShowPassword(!showPassword)}
                        />
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        {isPasswordProtected && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleRemove}
                                disabled={isLoading}
                                className="mr-auto text-destructive hover:text-destructive"
                            >
                                {isLoading ? <Loader2 className="size-4 animate-spin" /> : 'Disable Protection'}
                            </Button>
                        )}
                        <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" disabled={isLoading || (!password && !isPasswordProtected)}>
                            {isLoading ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
