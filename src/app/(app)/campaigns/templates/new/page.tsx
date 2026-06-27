'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';

import { Button, Card, Field, Input, Textarea } from '@/components/ui-kit';
import { ModuleShell } from '@/components/shell/module-shell';

export default function TemplateEditorPage(props: { params: Promise<{ id?: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    htmlContent: '',
    textContent: '',
  });

  const isEdit = !!params?.id; // Note: for 'new' route, this component structure might differ unless we use [id] with 'new' check or separate route

  useEffect(() => {
    if (isEdit && params.id !== 'new') {
      // Fetch existing
    }
  }, [isEdit, params.id]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/marketing-email/templates', {
        method: 'POST', // or PATCH if edit
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Template saved');
      router.push('/campaigns/templates');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleShell
      title={isEdit ? 'Edit template' : 'New template'}
      icon={FileText}
      editor
      breadcrumb={[
        { label: 'Templates', href: '/campaigns/templates' },
        { label: isEdit ? 'Edit' : 'New' },
      ]}
      primaryAction={
        <Button variant="brand" onClick={handleSave} disabled={loading}>
          Save template
        </Button>
      }
      contentClassName="min-h-0 flex-1"
    >
      <div className="grid h-full grid-cols-2 gap-4">
        <Card title="Template details" bodyClassName="p-4">
          <div className="flex flex-col gap-3.5">
            <Field label="Template name">
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Monthly Newsletter"
              />
            </Field>
            <Field label="Subject line">
              <Input
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Check out our latest news!"
              />
            </Field>
            <Field label="HTML content">
              <Textarea
                className="h-[360px] font-mono"
                value={formData.htmlContent}
                onChange={(e) => setFormData({ ...formData, htmlContent: e.target.value })}
                placeholder="<html><body>...</body></html>"
              />
            </Field>
            <Field label="Text content">
              <Textarea
                className="h-[100px]"
                value={formData.textContent}
                onChange={(e) => setFormData({ ...formData, textContent: e.target.value })}
                placeholder="Plain text version..."
              />
            </Field>
          </div>
        </Card>

        <Card title="Preview" bodyClassName="flex min-h-0 flex-col p-4">
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-white p-4">
            <iframe srcDoc={formData.htmlContent} className="h-full w-full" title="Preview" />
          </div>
        </Card>
      </div>
    </ModuleShell>
  );
}
