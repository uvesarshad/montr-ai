'use client';

import React, { useState, useRef, useCallback, useReducer } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles, Mic, MicOff, Lightbulb, Check, AlertTriangle } from 'lucide-react';
import { transcribeAudio } from '@/ai/flows/transcribe-audio-flow';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { AnchorPoint } from '../canvas-toolbar';
import type { Node, Edge } from 'reactflow';

interface WorkflowResult {
    nodes: Node[];
    edges: Edge[];
}

interface AIWorkflowDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onWorkflowGenerated: (result: WorkflowResult) => void;
    isCollapsed: boolean;
    anchorPoint: AnchorPoint;
}

const examplePrompts = [
    'When someone submits a form, add them to CRM and send a welcome email',
    'Post my blog content to LinkedIn and Twitter automatically',
    'When I receive a WhatsApp message, respond with AI',
    'Scrape a website, generate a blog post with AI, then create a design for social media',
];

const GENERATION_STEPS = [
    { id: 1, label: 'Understanding workflow...' },
    { id: 2, label: 'Building nodes...' },
    { id: 3, label: 'Validating layout...' },
];

interface ProgressState {
    currentStep: number;
    stepLabel: string;
    description: string;
    warnings: string[];
}

type ProgressAction =
    | { type: 'reset' }
    | { type: 'step'; step: number; label: string }
    | { type: 'description'; text: string }
    | { type: 'warnings'; warnings: string[] };

const initialProgressState: ProgressState = {
    currentStep: 0,
    stepLabel: '',
    description: '',
    warnings: [],
};

function progressReducer(state: ProgressState, action: ProgressAction): ProgressState {
    switch (action.type) {
        case 'reset':
            return initialProgressState;
        case 'step':
            return { ...state, currentStep: action.step, stepLabel: action.label };
        case 'description':
            return { ...state, description: action.text };
        case 'warnings':
            return { ...state, warnings: action.warnings };
        default:
            return state;
    }
}

interface GenerationProgressProps {
    currentStep: number;
    stepLabel: string;
    description: string;
    warnings: string[];
}

function GenerationProgress({ currentStep, stepLabel, description, warnings }: GenerationProgressProps) {
    return (
        <div className="mb-3 p-3 rounded-xl bg-muted/50 border border-border/30 space-y-2">
            {GENERATION_STEPS.map((step) => {
                const isActive = currentStep === step.id;
                const isDone = currentStep > step.id;
                return (
                    <div key={step.id} className="flex items-center gap-2">
                        {isDone ? (
                            <Check className="size-3.5 text-green-500 flex-shrink-0" />
                        ) : isActive ? (
                            <Loader2 className="size-3.5 text-purple-500 animate-spin flex-shrink-0" />
                        ) : (
                            <div className="size-3.5 rounded-full border border-border/50 flex-shrink-0" />
                        )}
                        <span className={cn(
                            "text-xs",
                            isDone ? "text-muted-foreground line-through" :
                                isActive ? "text-foreground font-medium" :
                                    "text-muted-foreground/60"
                        )}>
                            {isActive ? stepLabel : step.label}
                        </span>
                    </div>
                );
            })}

            {description && (
                <div className="mt-2 pt-2 border-t border-border/30">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">AI Plan:</p>
                    <p className="text-[10px] text-muted-foreground/80 whitespace-pre-line line-clamp-6">
                        {description}
                    </p>
                </div>
            )}

            {warnings.length > 0 && (
                <div className="mt-1 flex items-start gap-1">
                    <AlertTriangle className="size-3 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                        {warnings.length} fix{warnings.length > 1 ? 'es' : ''} applied
                    </p>
                </div>
            )}
        </div>
    );
}

export function AIWorkflowDialog({
    open,
    onOpenChange,
    onWorkflowGenerated,
    isCollapsed,
    anchorPoint,
}: AIWorkflowDialogProps) {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, dispatchProgress] = useReducer(progressReducer, initialProgressState);
    const { currentStep, stepLabel, description, warnings } = progress;
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const { toast } = useToast();

    const resetState = useCallback(() => {
        dispatchProgress({ type: 'reset' });
    }, []);

    const handleGenerate = useCallback(async () => {
        if (!prompt.trim()) return;

        setIsGenerating(true);
        resetState();

        try {
            const response = await fetch('/api/v2/ai-workflow/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt.trim() }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({ error: 'Generation failed' }));
                throw new Error(err.error || 'Generation failed');
            }

            // Parse SSE stream
            const reader = response.body?.getReader();
            if (!reader) throw new Error('No response stream');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let eventType = '';
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        eventType = line.slice(7).trim();
                    } else if (line.startsWith('data: ') && eventType) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            switch (eventType) {
                                case 'step':
                                    dispatchProgress({ type: 'step', step: data.step, label: data.label });
                                    break;
                                case 'description':
                                    dispatchProgress({ type: 'description', text: data.text });
                                    break;
                                case 'warnings':
                                    dispatchProgress({ type: 'warnings', warnings: data.warnings || [] });
                                    break;
                                case 'result':
                                    onWorkflowGenerated({
                                        nodes: data.nodes,
                                        edges: data.edges,
                                    });
                                    toast({
                                        title: 'Workflow Generated',
                                        description: `Created ${data.nodeCount} nodes with ${data.edgeCount} connections.`,
                                    });
                                    // Close dialog on success
                                    setTimeout(() => {
                                        onOpenChange(false);
                                        setPrompt('');
                                        resetState();
                                    }, 500);
                                    break;
                                case 'error':
                                    throw new Error(data.message);
                                case 'done':
                                    break;
                            }
                        } catch (parseErr) {
                            if (eventType === 'error' || (parseErr as Error).message !== 'Unexpected end of JSON input') {
                                throw parseErr;
                            }
                        }
                        eventType = '';
                    }
                }
            }
        } catch (error) {
            console.error('Failed to generate workflow:', error);
            toast({
                title: 'Generation Failed',
                description: (error as Error).message || 'Could not generate workflow. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsGenerating(false);
        }
    }, [prompt, onWorkflowGenerated, onOpenChange, toast, resetState]);

    const handleExampleClick = (example: string) => {
        setPrompt(example);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await transcribeRecording(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            toast({ title: 'Recording...', description: 'Speak your workflow description' });
        } catch (error) {
            console.error('Failed to start recording:', error);
            toast({ variant: 'destructive', title: 'Recording failed', description: 'Could not access microphone' });
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const transcribeRecording = async (audioBlob: Blob) => {
        setIsTranscribing(true);
        toast({ title: 'Transcribing...', description: 'Converting speech to text' });

        try {
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
                try {
                    const base64Audio = (reader.result as string).split(',')[1];
                    const result = await transcribeAudio({
                        audioBase64: base64Audio,
                        mimeType: 'audio/webm',
                    });

                    if (result.transcript) {
                        setPrompt(prev => prev ? `${prev}\n${result.transcript}` : result.transcript);
                        toast({ title: 'Transcription complete', description: 'Audio converted to text' });
                    } else {
                        toast({ variant: 'destructive', title: 'No speech detected', description: 'Please try again' });
                    }
                } catch (error) {
                    console.error('Transcription inside callback failed:', error);
                    toast({ variant: 'destructive', title: 'Transcription failed', description: 'Could not convert audio to text' });
                }
            };
        } catch (error) {
            console.error('Transcription failed:', error);
            toast({ variant: 'destructive', title: 'Transcription failed', description: 'Could not convert audio to text' });
        } finally {
            setIsTranscribing(false);
        }
    };

    const dialogTop = 80;
    const dialogLeft = isCollapsed ? 152 : 352;
    const originX = anchorPoint.x - dialogLeft;
    const originY = anchorPoint.y - dialogTop;

    return (
        <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
            <DialogContent
                className={cn(
                    "p-0 max-w-[320px] h-[calc(100vh-10rem)] top-[5rem] translate-x-0 translate-y-0 bg-white/95 dark:bg-black/95 backdrop-blur-xl shadow-2xl dark:shadow-[0_10px_30px_-5px_rgba(255,255,255,0.3)] border border-border/40 rounded-[28px] overflow-hidden",
                    "data-[state=open]:!animate-in data-[state=open]:!fade-in-0 data-[state=open]:!zoom-in-0 data-[state=open]:!slide-in-from-left-0 data-[state=open]:!slide-in-from-top-0 duration-300",
                    isCollapsed ? "left-[9.5rem]" : "left-[22rem]"
                )}
                style={{ transformOrigin: `${originX}px ${originY}px` }}
                onPointerDownOutside={(e) => e.preventDefault()}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogTitle className="sr-only">AI Workflow Generator</DialogTitle>
                <div className="flex flex-col h-full p-4">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="size-4 text-purple-500" />
                        <h2 className="text-sm font-medium text-foreground">AI Workflow Generator</h2>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-muted-foreground mb-3">
                        Describe what you want to automate and AI will create the workflow.
                    </p>

                    {/* Prompt Input */}
                    <Textarea
                        placeholder="Describe your automation workflow..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={4}
                        className="resize-none mb-3 text-sm"
                        disabled={isGenerating || isRecording || isTranscribing}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                handleGenerate();
                            }
                        }}
                    />

                    {/* Audio Recording Button */}
                    <Button
                        variant={isRecording ? "destructive" : "outline"}
                        size="sm"
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isGenerating || isTranscribing}
                        className="w-full mb-3 h-9"
                    >
                        {isTranscribing ? (
                            <>
                                <Loader2 className="size-4 mr-2 animate-spin" />
                                Transcribing...
                            </>
                        ) : isRecording ? (
                            <>
                                <MicOff className="size-4 mr-2" />
                                Stop Recording
                            </>
                        ) : (
                            <>
                                <Mic className="size-4 mr-2" />
                                Record Audio
                            </>
                        )}
                    </Button>

                    {/* Generation Progress */}
                    {isGenerating && (
                        <GenerationProgress
                            currentStep={currentStep}
                            stepLabel={stepLabel}
                            description={description}
                            warnings={warnings}
                        />
                    )}

                    {/* Examples (hidden during generation) */}
                    {!isGenerating && (
                        <div className="flex-1 flex flex-col">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Lightbulb className="size-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Examples:</span>
                            </div>
                            <ScrollArea className="flex-1 pr-2" style={{ maxHeight: 'calc(100vh - 30rem)' }}>
                                <div className="space-y-1.5">
                                    {examplePrompts.map((example) => (
                                        <button
                                            type="button"
                                            key={example}
                                            onClick={() => handleExampleClick(example)}
                                            className="w-full text-xs px-3 py-2 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
                                        >
                                            {example}
                                        </button>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex gap-2 pt-3 mt-3 border-t">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            className="flex-1 h-9 text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleGenerate}
                            disabled={!prompt.trim() || isGenerating || isRecording || isTranscribing}
                            className="flex-1 h-9 text-xs bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="size-3.5 mr-1.5" />
                                    Generate
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
