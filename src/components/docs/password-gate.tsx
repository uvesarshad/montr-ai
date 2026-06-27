'use client';

import React, { useState } from 'react';
import { Button, Input, Card } from '@/components/ui-kit';
import { Lock, Loader2 } from 'lucide-react';

interface PasswordGateProps {
    onUnlock: (password: string) => Promise<void>;
    isLoading?: boolean;
    error?: string | null;
}

export function PasswordGate({ onUnlock, isLoading = false, error }: PasswordGateProps) {
    const [password, setPassword] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password) {
            await onUnlock(password);
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <Card className="w-full max-w-md mx-auto">
                <div className="flex flex-col items-center gap-2 text-center pt-2 pb-4">
                    <div className="mx-auto bg-muted p-4 rounded-full w-fit mb-2">
                        <Lock className="size-8 text-muted-foreground" />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight">Password Protected</h2>
                    <p className="text-sm text-muted-foreground">
                        This document is password protected. Please enter the password to view it.
                    </p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Input
                            type="password"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoFocus
                        />
                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading || !password}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                Unlocking...
                            </>
                        ) : (
                            'Unlock Document'
                        )}
                    </Button>
                </form>
            </Card>
        </div>
    );
}
