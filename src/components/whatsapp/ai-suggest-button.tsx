'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui-kit';

interface AISuggestButtonProps {
    contactId: string;
    currentMessage: string;
    onSelectSuggestion: (suggestion: string) => void;
}

export function AISuggestButton({ contactId, currentMessage, onSelectSuggestion }: AISuggestButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const { toast } = useToast();

    const handleGenerateSuggestions = async () => {
        if (!currentMessage.trim()) {
            toast({
                title: 'No Message',
                description: 'Please enter a message first to get AI suggestions',
                variant: 'destructive',
            });
            return;
        }

        setLoading(true);
        try {
            const response = await fetch('/api/whatsapp/ai/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contactId,
                    message: currentMessage,
                    count: 3,
                }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuggestions(data.suggestions || []);
                setIsOpen(true);
            } else {
                toast({
                    title: 'Failed to Generate',
                    description: data.error || 'Could not generate AI suggestions',
                    variant: 'destructive',
                });
            }
        } catch (_error) {
            toast({
                title: 'Error',
                description: 'Failed to generate AI suggestions',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSuggestion = (suggestion: string) => {
        onSelectSuggestion(suggestion);
        setIsOpen(false);
        setSuggestions([]);
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    icon={Sparkles}
                    onClick={handleGenerateSuggestions}
                    disabled={loading}
                >
                    {loading ? 'Generating…' : 'AI Suggest'}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96" align="end">
                <div className="space-y-2">
                    <h4 className="font-medium text-sm">AI Response Suggestions</h4>
                    {suggestions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Click &quot;AI Suggest&quot; to generate response suggestions
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {suggestions.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    onClick={() => handleSelectSuggestion(suggestion)}
                                    className="w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-sm"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
