'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { WorkflowTemplate } from './template-gallery';

interface TemplateInstallerProps {
  template: WorkflowTemplate | null;
  open: boolean;
  onClose: () => void;
  onInstall: (templateId: string, params: Record<string, unknown>) => Promise<void>;
}

export function TemplateInstaller({
  template,
  open,
  onClose,
  onInstall,
}: TemplateInstallerProps) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [parameters, setParameters] = useState<Record<string, unknown>>({});

  React.useEffect(() => {
    if (template && open) {
      // Initialize parameters with default values
      const initialParams: Record<string, unknown> = {};
      template.parameters?.forEach((param) => {
        if (param.defaultValue !== undefined) {
          initialParams[param.key] = param.defaultValue;
        }
      });
      setParameters(initialParams);
      setInstalled(false);
    }
  }, [template, open]);

  const handleInstall = async () => {
    if (!template) return;

    // Validate required parameters
    const missingParams = template.parameters?.filter(
      (param) => param.required && !parameters[param.key]
    );

    if (missingParams && missingParams.length > 0) {
      toast.error(
        `Please fill in required fields: ${missingParams.map((p) => p.label).join(', ')}`
      );
      return;
    }

    try {
      setIsInstalling(true);
      await onInstall(template._id, parameters);
      setInstalled(true);
      toast.success('Template installed successfully!');

      // Close after short delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error: unknown) {
      toast.error(`Failed to install template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleParameterChange = (key: string, value: unknown) => {
    setParameters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const renderParameterField = (param: { key: string; label: string; description: string; type: string; required: boolean; defaultValue?: unknown; options?: Array<{ label: string; value: string }> }) => {
    switch (param.type) {
      case 'string':
        return (
          <Input
            value={(parameters[param.key] as string | undefined) ?? ''}
            onChange={(e) => handleParameterChange(param.key, e.target.value)}
            placeholder={param.description}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={(parameters[param.key] as string | number | undefined) ?? ''}
            onChange={(e) => handleParameterChange(param.key, Number(e.target.value))}
            placeholder={param.description}
          />
        );

      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={param.key}
              checked={!!parameters[param.key]}
              onCheckedChange={(checked) => handleParameterChange(param.key, checked)}
            />
            <label
              htmlFor={param.key}
              className="text-sm text-gray-600 cursor-pointer"
            >
              {param.description}
            </label>
          </div>
        );

      case 'select':
        return (
          <Select
            value={(parameters[param.key] as string | undefined) ?? undefined}
            onValueChange={(value) => handleParameterChange(param.key, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {param.options?.map((option: { label: string; value: string }) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      default:
        return (
          <Input
            value={(parameters[param.key] as string | undefined) ?? ''}
            onChange={(e) => handleParameterChange(param.key, e.target.value)}
          />
        );
    }
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {installed ? 'Installation Complete!' : `Install ${template.name}`}
          </DialogTitle>
          <DialogDescription>
            {installed
              ? 'Your workflow has been created and is ready to use.'
              : 'Configure the template parameters before installation.'}
          </DialogDescription>
        </DialogHeader>

        {installed ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="size-16 text-green-600 mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">Template Installed!</p>
            <p className="text-sm text-gray-600">
              You can now edit and customize your new workflow.
            </p>
          </div>
        ) : (
          <>
            {template.parameters && template.parameters.length > 0 ? (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 pr-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Fill in the required information to customize this template for your
                    needs.
                  </p>

                  {template.parameters.map((param) => (
                    <div key={param.key} className="space-y-2">
                      <Label>
                        {param.label}
                        {param.required && (
                          <span className="text-red-500 ml-1">*</span>
                        )}
                      </Label>
                      {renderParameterField(param)}
                      {param.description && param.type !== 'boolean' && (
                        <p className="text-xs text-gray-500">{param.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="py-8 text-center text-gray-600">
                <p>This template requires no additional configuration.</p>
                <p className="text-sm mt-2">Click &quot;Install&quot; to create your workflow.</p>
              </div>
            )}
          </>
        )}

        {!installed && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isInstalling}>
              Cancel
            </Button>
            <Button onClick={handleInstall} disabled={isInstalling}>
              {isInstalling ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Installing...
                </>
              ) : (
                'Install Template'
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
