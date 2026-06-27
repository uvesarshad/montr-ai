'use client';

import { useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, Sparkles } from 'lucide-react';

interface QuickPostModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    brands: { _id: string; name: string }[];
    accounts: { _id: string; platform: string; platformDisplayName: string }[];
    onSuccess?: () => void;
}

export function QuickPostModal({
    open,
    onOpenChange,
    brands,
    accounts,
    onSuccess,
}: QuickPostModalProps) {
    const { data: _session } = useSession();
    const { toast } = useToast();

    const [content, setContent] = useState('');
    const [selectedBrandId, setSelectedBrandId] = useState(brands[0]?._id || '');
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
    const [isPosting, setIsPosting] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);

    const _brandAccounts = accounts.filter(_a =>
        brands.find(b => b._id === selectedBrandId)
    );

    const toggleAccount = (accountId: string) => {
        setSelectedAccounts(prev =>
            prev.includes(accountId)
                ? prev.filter(id => id !== accountId)
                : [...prev, accountId]
        );
    };

    const handleEnhance = async () => {
        if (!content.trim()) return;
        setIsEnhancing(true);
        try {
            const response = await fetch('/api/social/ai/enhance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });
            if (response.ok) {
                const data = await response.json();
                setContent(data.enhancedContent);
                toast({ title: 'Content enhanced!' });
            }
        } catch (_error) {
            toast({ variant: 'destructive', title: 'Failed to enhance' });
        } finally {
            setIsEnhancing(false);
        }
    };

    const handlePost = async () => {
        if (!content.trim() || selectedAccounts.length === 0) {
            toast({ variant: 'destructive', title: 'Add content and select accounts' });
            return;
        }

        setIsPosting(true);
        try {
            const response = await fetch('/api/social/posts/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    accountIds: selectedAccounts,
                    brandId: selectedBrandId,
                }),
            });

            if (response.ok) {
                toast({ title: 'Posted successfully!' });
                setContent('');
                setSelectedAccounts([]);
                onOpenChange(false);
                onSuccess?.();
            } else {
                throw new Error('Failed to post');
            }
        } catch (_error) {
            toast({ variant: 'destructive', title: 'Failed to post' });
        } finally {
            setIsPosting(false);
        }
    };

    const getPlatformColor = (platform: string) => {
        const colors: Record<string, string> = {
            twitter: 'bg-blue-500',
            linkedin: 'bg-blue-700',
            instagram: 'bg-pink-500',
            facebook: 'bg-blue-600',
            tiktok: 'bg-gray-900',
            pinterest: 'bg-red-600',
        };
        return colors[platform] || 'bg-gray-500';
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="size-5" />
                        Quick Post
                    </DialogTitle>
                    <DialogDescription>
                        Create and publish a post instantly.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {brands.length > 1 && (
                        <div>
                            <Label>Brand</Label>
                            <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {brands.map(b => (
                                        <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label>Content</Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleEnhance}
                                disabled={isEnhancing || !content.trim()}
                            >
                                {isEnhancing ? (
                                    <Loader2 className="size-4 mr-1 animate-spin" />
                                ) : (
                                    <Sparkles className="size-4 mr-1" />
                                )}
                                Enhance
                            </Button>
                        </div>
                        <Textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="What's on your mind?"
                            rows={4}
                            className="resize-none"
                        />
                        <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                            <span>{content.length} characters</span>
                        </div>
                    </div>

                    <div>
                        <Label className="mb-2 block">Post to</Label>
                        <div className="flex flex-wrap gap-2">
                            {accounts.map(account => (
                                <Badge
                                    key={account._id}
                                    variant={selectedAccounts.includes(account._id) ? 'default' : 'outline'}
                                    className="cursor-pointer transition-colors"
                                    onClick={() => toggleAccount(account._id)}
                                >
                                    <span className={`size-2 rounded-full mr-2 ${getPlatformColor(account.platform)}`} />
                                    {account.platformDisplayName}
                                </Badge>
                            ))}
                        </div>
                        {accounts.length === 0 && (
                            <p className="text-sm text-muted-foreground">No connected accounts</p>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handlePost}
                        disabled={isPosting || !content.trim() || selectedAccounts.length === 0}
                    >
                        {isPosting ? (
                            <><Loader2 className="size-4 mr-2 animate-spin" />Posting...</>
                        ) : (
                            <><Send className="size-4 mr-2" />Post Now</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
