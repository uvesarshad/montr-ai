'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock } from 'lucide-react';
import { PublicFormView } from './public-form-view';

// Plain data shape — _id is always a string when coming from the API
type PublicFormRecord = {
    _id: string;
    title: string;
    content: string;
    slug: string;
    settings: {
        theme?: string;
        emailNotifications?: boolean;
        notificationEmail?: string;
        description?: string;
        submitButtonText?: string;
        thankYouMessage?: string;
        thankYouUrl?: string;
    };
    coverImage?: string | null;
};

export function FormPasswordGate({ formId }: { formId: string }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState<PublicFormRecord | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`/api/public/forms/${formId}`, {
                headers: { 'x-form-password': password },
            });

            if (res.status === 401) {
                setError('Incorrect password. Please try again.');
                return;
            }

            if (!res.ok) {
                setError('Something went wrong. Please try again.');
                return;
            }

            const data = await res.json();
            setForm(data);
        } finally {
            setLoading(false);
        }
    }

    if (form) {
        return <PublicFormView form={form} />;
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef3ff_0%,#f8fafc_38%,#ffffff_100%)] flex items-center justify-center px-4">
            <div className="w-full max-w-sm rounded-[12px] border bg-background/95 shadow-[0_20px_60px_rgba(15,23,42,0.08)] p-8">
                <div className="flex flex-col items-center gap-3 mb-6">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <Lock className="size-5 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-lg font-semibold">Password required</h1>
                        <p className="text-sm text-muted-foreground mt-1">This form is protected. Enter the password to continue.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Enter password"
                            autoFocus
                            required
                        />
                        {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? 'Checking…' : 'Continue'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
