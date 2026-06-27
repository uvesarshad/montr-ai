'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button, Chip, Field, Spinner, Textarea } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Wand2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface PostIdea {
    contentType: string;
    content: string;
}

interface SocialAIAssistantDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectIdea: (idea: string) => void;
    platforms: string[];
    /** When set, the ideas endpoint loads this brand's voice profile (audit §D). */
    brandId?: string;
}

export function SocialAIAssistantDialog({
    open,
    onOpenChange,
    onSelectIdea,
    platforms,
    brandId,
}: SocialAIAssistantDialogProps) {
    const [topic, setTopic] = useState('');
    const [loading, setLoading] = useState(false);
    const [ideas, setIdeas] = useState<PostIdea[]>([]);
    const { toast } = useToast();

    const handleGenerate = async () => {
        if (!topic.trim()) {
            toast({
                title: 'Topic required',
                description: 'Please describe what you want to post about.',
                variant: 'destructive',
            });
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/social/ai/ideas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic,
                    platform: platforms.length > 0 ? platforms[0] : 'general',
                    count: 3,
                    ...(brandId ? { brandId } : {}),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate ideas');
            }

            if (data.ideas && data.ideas.length > 0) {
                setIdeas(data.ideas);
            } else {
                toast({
                    title: 'No ideas generated',
                    description: 'Try a different topic.',
                    variant: 'destructive',
                });
            }
        } catch (error: unknown) {
            toast({
                title: 'Error generating ideas',
                description: error instanceof Error ? error.message : 'An error occurred',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSelectIdea = (content: string) => {
        onSelectIdea(content);
        onOpenChange(false);
        setTopic('');
        setIdeas([]);
    };

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!val) {
                setTopic('');
                setIdeas([]);
            }
            onOpenChange(val);
        }}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Wand2 className="size-5 text-primary" />
                        AI Assistant
                    </DialogTitle>
                    <DialogDescription>
                        Describe your topic and let AI generate post ideas for you.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <Field label="What do you want to post about?">
                        <Textarea
                            placeholder="e.g. Announcing our new product feature..."
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            rows={3}
                        />
                    </Field>

                    {ideas.length > 0 && (
                        <div className="space-y-3 mt-4">
                            <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <Sparkles className="size-4" />
                                Generated Ideas
                            </h4>
                            <ScrollArea className="h-[250px] pr-4">
                                <div className="space-y-4">
                                    {ideas.map((idea, idx) => (
                                        <div key={idx} className="p-4 rounded-lg bg-muted/50 border space-y-3">
                                            <Chip tone="brand">{idea.contentType}</Chip>
                                            <p className="text-sm whitespace-pre-wrap">{idea.content}</p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={() => handleSelectIdea(idea.content)}
                                            >
                                                Use this idea
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button variant="primary" icon={loading ? undefined : Sparkles} onClick={handleGenerate} disabled={loading || !topic.trim()}>
                        {loading ? <Spinner size={14} className="border-current" /> : null}
                        Generate
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
