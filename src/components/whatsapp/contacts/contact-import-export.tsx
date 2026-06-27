'use client';

import { useReducer, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Download, FileSpreadsheet, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input as ShadcnInput } from '@/components/ui/input';
import {
  Banner,
  Button,
  Card,
  Field,
  Meter,
  Select,
} from '@/components/ui-kit';

interface ContactImportExportProps {
  accountId?: string;
}

type ImportResult = { imported: number; failed?: number; errors?: string[]; total?: number; updated?: number; skipped?: number };

interface ImportState {
  importFile: File | null;
  importing: boolean;
  importProgress: number;
  importResult: ImportResult | null;
}

type ImportAction =
  | { type: 'setFile'; file: File | null }
  | { type: 'start' }
  | { type: 'progress'; updater: (prev: number) => number }
  | { type: 'setProgress'; value: number }
  | { type: 'success'; result: ImportResult }
  | { type: 'finish' }
  | { type: 'reset' };

const initialImportState: ImportState = {
  importFile: null,
  importing: false,
  importProgress: 0,
  importResult: null,
};

function importReducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case 'setFile':
      return { ...state, importFile: action.file };
    case 'start':
      return { ...state, importing: true, importProgress: 0 };
    case 'progress':
      return { ...state, importProgress: action.updater(state.importProgress) };
    case 'setProgress':
      return { ...state, importProgress: action.value };
    case 'success':
      return { ...state, importResult: action.result };
    case 'finish':
      return { ...state, importing: false };
    case 'reset':
      return { ...state, importFile: null, importProgress: 0, importResult: null };
    default:
      return state;
  }
}

interface ImportCardProps {
  onDownloadTemplate: () => void;
  onOpenImport: () => void;
}

function ImportCard({ onDownloadTemplate, onOpenImport }: ImportCardProps) {
  return (
    <Card icon={Upload} title="Import Contacts" meta="Upload a CSV or Excel file to import contacts">
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Supported formats: CSV, XLS, XLSX
          </p>
          <p className="text-sm text-muted-foreground">Maximum file size: 10MB</p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            icon={FileSpreadsheet}
            onClick={onDownloadTemplate}
            className="flex-1"
          >
            Download Template
          </Button>
          <Button variant="brand" icon={Upload} onClick={onOpenImport} className="flex-1">
            Import Contacts
          </Button>
        </div>

        <Banner tone="info" icon={AlertCircle}>
          Required columns: firstName, phone. Optional: lastName, email, company, tags
        </Banner>
      </div>
    </Card>
  );
}

interface ExportCardProps {
  exportFormat: 'csv' | 'xlsx';
  onFormatChange: (value: 'csv' | 'xlsx') => void;
  exporting: boolean;
  onExport: () => void;
}

function ExportCard({ exportFormat, onFormatChange, exporting, onExport }: ExportCardProps) {
  return (
    <Card icon={Download} title="Export Contacts" meta="Download all your contacts as a spreadsheet">
      <div className="space-y-4 p-4">
        <Field label="Export Format">
          <Select
            value={exportFormat}
            onChange={(value) => onFormatChange(value as 'csv' | 'xlsx')}
            options={[
              { value: 'xlsx', label: 'Excel (.xlsx)' },
              { value: 'csv', label: 'CSV (.csv)' },
            ]}
          />
        </Field>

        <Button
          variant="brand"
          icon={Download}
          onClick={onExport}
          disabled={exporting}
          className="w-full"
        >
          {exporting ? 'Exporting...' : 'Export All Contacts'}
        </Button>

        <Banner tone="ok" icon={AlertCircle}>
          Export includes all contact data, custom fields, and tags
        </Banner>
      </div>
    </Card>
  );
}

export function ContactImportExport({ accountId }: ContactImportExportProps) {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [{ importFile, importing, importProgress, importResult }, dispatchImport] = useReducer(
    importReducer,
    initialImportState,
  );
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('xlsx');

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];

    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a CSV or Excel file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    dispatchImport({ type: 'setFile', file });
  };

  // Handle import
  const handleImport = async () => {
    if (!importFile) {
      toast.error('Please select a file');
      return;
    }

    dispatchImport({ type: 'start' });

    try {
      const formData = new FormData();
      formData.append('file', importFile);
      if (accountId) {
        formData.append('accountId', accountId);
      }

      // Simulate progress (in real implementation, use chunked upload or websocket)
      const progressInterval = setInterval(() => {
        dispatchImport({ type: 'progress', updater: (prev) => Math.min(prev + 10, 90) });
      }, 500);

      const response = await fetch('/api/whatsapp/contacts/import', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      dispatchImport({ type: 'setProgress', value: 100 });

      const data = await response.json();

      if (response.ok) {
        dispatchImport({ type: 'success', result: data.data });
        toast.success(
          `Successfully imported ${data.data.imported} contacts`
        );
      } else {
        toast.error(data.error || 'Failed to import contacts');
      }
    } catch (error: unknown) {
      toast.error('Error importing contacts');
      console.error(error);
    } finally {
      dispatchImport({ type: 'finish' });
    }
  };

  // Handle export
  const handleExport = async () => {
    setExporting(true);

    try {
      const url = accountId
        ? `/api/whatsapp/contacts/export?accountId=${accountId}&format=${exportFormat}`
        : `/api/whatsapp/contacts/export?format=${exportFormat}`;

      const response = await fetch(url);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to export contacts');
      }

      // Get filename from headers or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename =
        filenameMatch?.[1] ||
        `contacts-export-${new Date().toISOString().split('T')[0]}.${exportFormat}`;

      // Download file
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      toast.success('Contacts exported successfully');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Error exporting contacts');
      console.error(error);
    } finally {
      setExporting(false);
    }
  };

  // Reset import
  const resetImport = () => {
    dispatchImport({ type: 'reset' });
    setIsImportOpen(false);
  };

  // Download sample template
  const downloadSampleTemplate = () => {
    // Create sample CSV
    const sampleData = [
      ['firstName', 'lastName', 'email', 'phone', 'company', 'tags'],
      ['John', 'Doe', 'john@example.com', '+1234567890', 'Acme Inc', 'vip,customer'],
      ['Jane', 'Smith', 'jane@example.com', '+0987654321', 'Tech Corp', 'lead'],
    ];

    const csvContent = sampleData.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'contacts-import-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast.success('Sample template downloaded');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Import Card */}
      <ImportCard
        onDownloadTemplate={downloadSampleTemplate}
        onOpenImport={() => setIsImportOpen(true)}
      />

      {/* Export Card */}
      <ExportCard
        exportFormat={exportFormat}
        onFormatChange={setExportFormat}
        exporting={exporting}
        onExport={handleExport}
      />

      {/* Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Contacts</DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file to import your contacts
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!importResult ? (
              <>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                  <FileSpreadsheet className="size-12 mx-auto text-muted-foreground mb-4" />
                  <ShadcnInput
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                  {importFile && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Selected: {importFile.name} (
                      {(importFile.size / 1024).toFixed(2)} KB)
                    </p>
                  )}
                </div>

                {importing && (
                  <div className="space-y-2">
                    <Meter value={importProgress} tone="info" />
                    <p className="text-sm text-center text-muted-foreground">
                      Importing contacts... {importProgress}%
                    </p>
                  </div>
                )}

                <Banner tone="warn" icon={AlertCircle} title="Column Mapping:">
                  <ul className="mt-1 ml-4 list-disc space-y-1">
                    <li>firstName (required)</li>
                    <li>phone (required, with country code e.g., +1234567890)</li>
                    <li>lastName, email, company (optional)</li>
                    <li>tags (comma-separated, e.g., &quot;vip,customer&quot;)</li>
                  </ul>
                </Banner>
              </>
            ) : (
              <div className="space-y-4">
                <Banner tone="ok" title="Import Completed">
                  <div className="grid grid-cols-2 gap-3 mt-1 text-sm">
                    <div><span className="text-muted-foreground">Total rows:</span><span className="ml-2 font-medium">{importResult.total}</span></div>
                    <div><span className="text-muted-foreground">Imported:</span><span className="ml-2 font-medium">{importResult.imported}</span></div>
                    <div><span className="text-muted-foreground">Updated:</span><span className="ml-2 font-medium">{importResult.updated || 0}</span></div>
                    <div><span className="text-muted-foreground">Skipped:</span><span className="ml-2 font-medium">{importResult.skipped || 0}</span></div>
                  </div>
                </Banner>

                {importResult.errors && importResult.errors.length > 0 && (
                  <Banner tone="danger" title="Errors">
                    <ul className="mt-1 space-y-1 text-sm max-h-48 overflow-y-auto">
                      {importResult.errors.map((error: string, i: number) => (
                        <li key={`${error}-${i}`}>• {error}</li>
                      ))}
                    </ul>
                  </Banner>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            {!importResult ? (
              <>
                <Button variant="outline" onClick={() => setIsImportOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="brand"
                  onClick={handleImport}
                  disabled={!importFile || importing}
                >
                  {importing ? 'Importing...' : 'Start Import'}
                </Button>
              </>
            ) : (
              <Button variant="brand" onClick={resetImport}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
