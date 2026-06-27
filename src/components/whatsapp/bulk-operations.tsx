'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, Download, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button, Field } from '@/components/ui-kit';
import { Input as ShadcnInput } from '@/components/ui/input';

export function BulkContactImport() {
    const [isOpen, setIsOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const { toast } = useToast();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/whatsapp/contacts/import', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (response.ok) {
                toast({
                    title: 'Import Successful',
                    description: `Imported ${data.imported} contacts. Skipped ${data.skipped} duplicates.`,
                });
                setIsOpen(false);
                setFile(null);
            } else {
                toast({
                    title: 'Import Failed',
                    description: data.error || 'Failed to import contacts',
                    variant: 'destructive',
                });
            }
        } catch (_error) {
            toast({
                title: 'Error',
                description: 'Failed to upload file',
                variant: 'destructive',
            });
        } finally {
            setUploading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" icon={Upload} size="sm">
                    Import Contacts
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Import Contacts</DialogTitle>
                    <DialogDescription>
                        Upload a CSV or Excel file with contact information
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <Field label="Select File" htmlFor="file" hint="Supported formats: CSV, Excel (.xlsx, .xls)">
                        <ShadcnInput
                            id="file"
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileChange}
                        />
                    </Field>

                    {file && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <FileSpreadsheet className="size-4" />
                            {file.name}
                        </div>
                    )}

                    <Button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="w-full"
                    >
                        {uploading ? 'Uploading…' : 'Upload'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function ConversationExport({ contactId }: { contactId?: string }) {
    const [exporting, setExporting] = useState(false);
    const { toast } = useToast();

    const handleExport = async (format: 'csv' | 'json') => {
        setExporting(true);
        try {
            const params = new URLSearchParams({ format });
            if (contactId) params.append('contactId', contactId);

            const response = await fetch(`/api/whatsapp/conversations/export?${params}`);

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `conversations_${new Date().toISOString().split('T')[0]}.${format}`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                toast({
                    title: 'Export Successful',
                    description: `Conversations exported as ${format.toUpperCase()}`,
                });
            } else {
                toast({
                    title: 'Export Failed',
                    description: 'Failed to export conversations',
                    variant: 'destructive',
                });
            }
        } catch (_error) {
            toast({
                title: 'Error',
                description: 'Failed to export conversations',
                variant: 'destructive',
            });
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="flex gap-2">
            <Button
                variant="outline"
                size="sm"
                icon={Download}
                onClick={() => handleExport('csv')}
                disabled={exporting}
            >
                Export CSV
            </Button>
            <Button
                variant="outline"
                size="sm"
                icon={Download}
                onClick={() => handleExport('json')}
                disabled={exporting}
            >
                Export JSON
            </Button>
        </div>
    );
}
