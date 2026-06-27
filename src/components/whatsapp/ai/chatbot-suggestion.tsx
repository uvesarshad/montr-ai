'use client';

import { useReducer, useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Copy, Check, RefreshCw } from 'lucide-react';
import { Banner, Button, Card, Chip, IconButton, Skeleton, type ChipTone } from '@/components/ui-kit';

interface ChatbotSuggestionProps {
  incomingMessage: string;
  contactId: string;
  accountId: string;
  onUseSuggestion?: (suggestion: string) => void;
}

interface SuggestionState {
  suggestion: string;
  confidence: number | null;
  confidenceLevel: 'high' | 'medium' | 'low' | null;
}

type SuggestionAction = {
  type: 'set';
  suggestion: string;
  confidence: number | null;
  confidenceLevel: 'high' | 'medium' | 'low' | null;
};

const initialSuggestionState: SuggestionState = {
  suggestion: '',
  confidence: null,
  confidenceLevel: null,
};

function suggestionReducer(state: SuggestionState, action: SuggestionAction): SuggestionState {
  switch (action.type) {
    case 'set':
      return {
        suggestion: action.suggestion,
        confidence: action.confidence,
        confidenceLevel: action.confidenceLevel,
      };
    default:
      return state;
  }
}

export function ChatbotSuggestion({
  incomingMessage,
  contactId,
  accountId,
  onUseSuggestion,
}: ChatbotSuggestionProps) {
  const [loading, setLoading] = useState(false);
  const [{ suggestion, confidence, confidenceLevel }, dispatch] = useReducer(
    suggestionReducer,
    initialSuggestionState,
  );
  const [copied, setCopied] = useState(false);

  const generateSuggestion = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/whatsapp/ai/chatbot/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: incomingMessage,
          contactId,
          accountId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        dispatch({
          type: 'set',
          suggestion: data.data.suggestion,
          confidence: data.data.confidence,
          confidenceLevel: data.data.confidenceLevel,
        });
      } else {
        toast.error(data.error || 'Failed to generate suggestion');
      }
    } catch (error) {
      toast.error('Error generating AI suggestion');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(suggestion);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (_error) {
      toast.error('Failed to copy');
    }
  };

  const handleUse = () => {
    if (onUseSuggestion) {
      onUseSuggestion(suggestion);
      toast.success('Suggestion applied');
    }
  };

  const confidenceTone: Record<string, ChipTone> = { high: 'ok', medium: 'warn', low: 'danger' };

  const getConfidenceChip = () => {
    if (!confidenceLevel) return null;
    return (
      <Chip tone={confidenceTone[confidenceLevel] ?? 'gray'}>
        {confidence ? `${Math.round(confidence * 100)}% ` : ''}{confidenceLevel} confidence
      </Chip>
    );
  };

  if (!suggestion && !loading) {
    return (
      <Card className="border-dashed">
        <div className="py-6 text-center px-4">
          <Sparkles className="size-10 mx-auto mb-3 text-brand opacity-70" />
          <h4 className="font-medium mb-2">AI Response Suggestion</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Get an AI-powered suggestion for replying to this message
          </p>
          <Button variant="brand" icon={Sparkles} onClick={generateSuggestion}>
            Generate AI Suggestion
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand" />
          <span className="text-sm font-semibold">AI Suggestion</span>
          {getConfidenceChip()}
        </div>
        <IconButton
          icon={RefreshCw}
          aria-label="Regenerate"
          onClick={generateSuggestion}
          disabled={loading}
        />
      </div>
      <p className="px-4 pb-3 text-xs text-muted-foreground">AI-generated response suggestion</p>
      <div className="px-4 pb-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="size-4/6" />
          </div>
        ) : (
          <>
            <div className="bg-muted p-3 rounded-lg text-sm mb-3 border border-border">
              {suggestion}
            </div>

            <div className="flex gap-2">
              {onUseSuggestion && (
                <Button size="sm" onClick={handleUse} className="flex-1">
                  Use Suggestion
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                icon={copied ? Check : Copy}
                onClick={handleCopy}
                className="flex-1"
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            {confidenceLevel === 'low' && (
              <Banner tone="warn" className="mt-3">
                <strong>Note:</strong> Low confidence suggestion. Review carefully before using.
              </Banner>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
