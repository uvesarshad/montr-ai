'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Star, TrendingUp, Zap } from 'lucide-react';
import { WorkflowTemplate } from './template-gallery';

interface TemplatePreviewProps {
  template: WorkflowTemplate | null;
  open: boolean;
  onClose: () => void;
  onInstall: (template: WorkflowTemplate) => void;
}

export function TemplatePreview({
  template,
  open,
  onClose,
  onInstall,
}: TemplatePreviewProps) {
  if (!template) return null;

  const handleInstall = () => {
    onInstall(template);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-2xl mb-2">{template.name}</DialogTitle>
              <DialogDescription className="text-base">
                {template.description}
              </DialogDescription>
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap pt-2">
            <Badge variant="outline">{template.type}</Badge>
            <Badge variant="outline">{template.difficulty}</Badge>
            <Badge variant="secondary">{template.category}</Badge>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm text-gray-600 pt-2">
            <div className="flex items-center gap-1">
              <Download className="size-4" />
              <span>{template.stats.installs.toLocaleString()} installs</span>
            </div>
            <div className="flex items-center gap-1">
              <Star className="size-4 text-yellow-500 fill-yellow-500" />
              <span>{template.stats.rating.toFixed(1)} ({template.stats.reviews} reviews)</span>
            </div>
            <div className="flex items-center gap-1">
              <Zap className="size-4" />
              <span>{template.nodes?.length || 0} nodes</span>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Tags */}
            {template.tags && template.tags.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {template.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Features */}
            {template.features && template.features.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Features</h3>
                <ul className="space-y-2">
                  {template.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-green-600 mt-1">✓</span>
                      <span className="text-sm text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Use Cases */}
            {template.useCases && template.useCases.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Use Cases</h3>
                <ul className="space-y-2">
                  {template.useCases.map((useCase, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <TrendingUp className="size-4 text-blue-600 mt-1" />
                      <span className="text-sm text-gray-700">{useCase}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Requirements */}
            {template.requirements && template.requirements.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Requirements</h3>
                <ul className="space-y-2">
                  {template.requirements.map((req, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-amber-600 mt-1">!</span>
                      <span className="text-sm text-gray-700">{req}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Parameters */}
            {template.parameters && template.parameters.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Configuration Parameters</h3>
                <div className="space-y-3">
                  {template.parameters.map((param) => (
                    <div key={param.key} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between mb-1">
                        <div className="font-medium text-sm">{param.label}</div>
                        {param.required && (
                          <Badge variant="destructive" className="text-xs">
                            Required
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mb-1">
                        {param.description}
                      </p>
                      <div className="text-xs text-gray-500">
                        Type: <span className="font-mono">{param.type}</span>
                        {param.defaultValue !== undefined && (
                          <span className="ml-2">
                            Default: <span className="font-mono">{String(param.defaultValue)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Workflow Structure */}
            <div>
              <h3 className="font-semibold mb-2">Workflow Structure</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600 mb-1">Nodes</div>
                    <div className="font-semibold">{template.nodes?.length || 0}</div>
                  </div>
                  <div>
                    <div className="text-gray-600 mb-1">Connections</div>
                    <div className="font-semibold">{template.edges?.length || 0}</div>
                  </div>
                  <div>
                    <div className="text-gray-600 mb-1">Difficulty</div>
                    <div className="font-semibold capitalize">{template.difficulty}</div>
                  </div>
                  <div>
                    <div className="text-gray-600 mb-1">Category</div>
                    <div className="font-semibold">{template.category}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Author */}
            {template.author && (
              <div>
                <h3 className="font-semibold mb-2">Author</h3>
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-gray-200 flex items-center justify-center font-medium">
                    {template.author.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium">{template.author.name}</div>
                    <div className="text-sm text-gray-600">Template Creator</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Close
          </Button>
          <Button onClick={handleInstall} className="flex-1">
            <Download className="size-4 mr-2" />
            Install Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
