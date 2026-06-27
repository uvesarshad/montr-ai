'use client';

import React, { useCallback } from 'react';
import { LayoutTemplate, Sparkles, Zap, Workflow } from 'lucide-react';
import { Card, EmptyState, Button } from '@/components/ui-kit';

/**
 * Empty-canvas onboarding overlay (TODO 2.15).
 *
 * Rendered by the canvas editor when the graph has no nodes and the canvas is
 * editable. Offers three ways to get started, each of which dispatches a
 * `canvas-onboarding` event that the toolbar listens for to open its existing
 * dialogs (template picker, AI workflow generator, node collection → triggers).
 *
 * It is purely additive — it does not intercept canvas interaction (the overlay
 * container is `pointer-events-none`; only the card itself is interactive), so
 * users can still drag nodes from the palette onto the canvas. It disappears
 * automatically once a node exists because the editor stops rendering it.
 */
function emit(action: 'template' | 'ai' | 'trigger') {
    window.dispatchEvent(new CustomEvent('canvas-onboarding', { detail: { action } }));
}

export function EmptyCanvasOnboarding() {
    const startFromTemplate = useCallback(() => emit('template'), []);
    const generateWithAI = useCallback(() => emit('ai'), []);
    const addTrigger = useCallback(() => emit('trigger'), []);

    return (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center p-6">
            <Card className="pointer-events-auto w-full max-w-md shadow-xl" bodyClassName="p-2">
                <EmptyState
                    icon={Workflow}
                    title="Start building your automation"
                    note="Pick a proven template, describe it to AI, or drop a trigger to start from scratch."
                    cta={
                        <Button variant="brand" size="sm" icon={Sparkles} onClick={generateWithAI}>
                            Generate with AI
                        </Button>
                    }
                    secondary={
                        <Button variant="outline" size="sm" icon={LayoutTemplate} onClick={startFromTemplate}>
                            Start from a template
                        </Button>
                    }
                />
                <div className="border-t border-border px-6 pb-4 pt-3 text-center">
                    <Button variant="ghost" size="sm" icon={Zap} onClick={addTrigger}>
                        Add a trigger
                    </Button>
                </div>
            </Card>
        </div>
    );
}

export default EmptyCanvasOnboarding;
