'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Languages, Copy, Check } from 'lucide-react';
import { Banner, Button, Chip, Field, IconButton, Select, Textarea } from '@/components/ui-kit';

interface MessageTranslatorProps {
  message: string;
  onTranslated?: (translatedText: string) => void;
}

const LANGUAGES = {
  en: 'English',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  fr: 'French',
  ja: 'Japanese',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
  ko: 'Korean',
};

export function MessageTranslator({ message, onTranslated }: MessageTranslatorProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [translatedText, setTranslatedText] = useState('');
  const [copied, setCopied] = useState(false);

  const handleTranslate = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/whatsapp/ai/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          targetLanguage,
          detectSource: true,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setTranslatedText(data.data.translatedText);
        toast.success('Message translated successfully');
      } else {
        toast.error(data.error || 'Failed to translate message');
      }
    } catch (error) {
      toast.error('Error translating message');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (_error) {
      toast.error('Failed to copy');
    }
  };

  const handleUseTranslation = () => {
    if (onTranslated) {
      onTranslated(translatedText);
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" icon={Languages}>
          Translate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI Translation</DialogTitle>
          <DialogDescription>
            Translate message using AI-powered translation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original Message */}
          <div>
            <p className="mb-1 text-[12.5px] font-medium text-foreground">Original Message</p>
            <div className="p-3 bg-muted rounded-lg text-sm max-h-32 overflow-y-auto border border-border">
              {message}
            </div>
          </div>

          {/* Target Language */}
          <Field label="Translate To">
            <Select
              value={targetLanguage}
              onChange={setTargetLanguage}
              options={Object.entries(LANGUAGES).map(([code, name]) => ({
                value: code,
                label: name,
              }))}
            />
          </Field>

          {/* Translate Button */}
          <Button icon={Languages} onClick={handleTranslate} disabled={loading} className="w-full">
            {loading ? 'Translating…' : 'Translate'}
          </Button>

          {/* Translated Text */}
          {translatedText && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12.5px] font-medium text-foreground">Translated Message</p>
                <div className="flex items-center gap-2">
                  <Chip tone="gray">{LANGUAGES[targetLanguage as keyof typeof LANGUAGES]}</Chip>
                  <IconButton icon={copied ? Check : Copy} aria-label="Copy translation" onClick={handleCopy} />
                </div>
              </div>
              <Textarea
                value={translatedText}
                onChange={(e) => setTranslatedText(e.target.value)}
                rows={6}
              />
            </div>
          )}

          {/* Info */}
          <Banner tone="info">
            <strong>Note:</strong> Translation is powered by AI and may not be perfect.
            Always review the translated text before sending.
          </Banner>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setTranslatedText('');
            }}
          >
            Cancel
          </Button>
          {translatedText && onTranslated && (
            <Button onClick={handleUseTranslation}>Use Translation</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
