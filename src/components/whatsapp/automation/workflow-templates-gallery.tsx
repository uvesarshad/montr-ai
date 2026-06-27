'use client';

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WORKFLOW_TEMPLATES, WorkflowTemplate } from '@/lib/whatsapp/automation/templates';
import { Button, Card, Chip } from '@/components/ui-kit';

interface WorkflowTemplatesGalleryProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectTemplate: (template: WorkflowTemplate) => void;
}

export function WorkflowTemplatesGallery({
    open,
    onOpenChange,
    onSelectTemplate,
}: WorkflowTemplatesGalleryProps) {
    const [selectedCategory, setSelectedCategory] = React.useState<string>('all');

    const categories = [
        { id: 'all', label: 'All Templates' },
        { id: 'support', label: 'Support' },
        { id: 'sales', label: 'Sales' },
        { id: 'marketing', label: 'Marketing' },
        { id: 'onboarding', label: 'Onboarding' },
        { id: 'utility', label: 'Utility' }
    ];

    const filteredTemplates = selectedCategory === 'all'
        ? WORKFLOW_TEMPLATES
        : WORKFLOW_TEMPLATES.filter(t => t.category === selectedCategory);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col p-0">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle>Workflow Templates</DialogTitle>
                    <DialogDescription>
                        Start with a pre-built workflow to save time.
                    </DialogDescription>
                </DialogHeader>

                <div className="px-6 py-2 border-b flex gap-2 overflow-x-auto">
                    {categories.map(cat => (
                        <Button
                            key={cat.id}
                            variant={selectedCategory === cat.id ? 'primary' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedCategory(cat.id)}
                        >
                            {cat.label}
                        </Button>
                    ))}
                </div>

                <ScrollArea className="flex-1 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredTemplates.map(template => (
                            <Card key={template.id} lift className="flex flex-col">
                                <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
                                    <Chip tone="gray">{template.category}</Chip>
                                    <Chip tone={
                                        template.difficulty === 'beginner' ? 'ok' :
                                        template.difficulty === 'intermediate' ? 'warn' : 'danger'
                                    }>{template.difficulty}</Chip>
                                </div>
                                <div className="px-4 pb-2">
                                    <div className="text-sm font-semibold">{template.name}</div>
                                    <p className="mt-1 text-[12.5px] text-muted-foreground flex-1">{template.description}</p>
                                </div>
                                <div className="mt-auto px-4 pb-4 pt-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => onSelectTemplate(template)}
                                    >
                                        Use Template
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
