'use client';

import { useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, CheckCircle2 } from 'lucide-react';
import { FieldMapper } from './field-mapper';
import { ImportPreview } from './import-preview';
import { ImportProgress } from './import-progress';

interface ImportWizardProps {
  entityType: 'contact' | 'company';
}

type Step = 'upload' | 'map' | 'preview' | 'import' | 'complete';

interface WizardState {
  currentStep: Step;
  importId: string | null;
  csvHeaders: string[];
  csvPreview: Record<string, unknown>[];
  totalRows: number;
  fileName: string;
  fieldMapping: Record<string, string>;
  duplicateHandling: 'skip' | 'update' | 'create';
}

const initialWizardState: WizardState = {
  currentStep: 'upload',
  importId: null,
  csvHeaders: [],
  csvPreview: [],
  totalRows: 0,
  fileName: '',
  fieldMapping: {},
  duplicateHandling: 'skip',
};

type WizardAction =
  | {
      type: 'uploaded';
      importId: string;
      csvHeaders: string[];
      csvPreview: Record<string, unknown>[];
      totalRows: number;
      fileName: string;
    }
  | { type: 'mapComplete'; fieldMapping: Record<string, string> }
  | { type: 'previewComplete'; duplicateHandling: 'skip' | 'update' | 'create' }
  | { type: 'importComplete' }
  | { type: 'goToStep'; step: Step }
  | { type: 'reset' };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'uploaded':
      return {
        ...state,
        importId: action.importId,
        csvHeaders: action.csvHeaders,
        csvPreview: action.csvPreview,
        totalRows: action.totalRows,
        fileName: action.fileName,
        currentStep: 'map',
      };
    case 'mapComplete':
      return { ...state, fieldMapping: action.fieldMapping, currentStep: 'preview' };
    case 'previewComplete':
      return { ...state, duplicateHandling: action.duplicateHandling, currentStep: 'import' };
    case 'importComplete':
      return { ...state, currentStep: 'complete' };
    case 'goToStep':
      return { ...state, currentStep: action.step };
    case 'reset':
      return initialWizardState;
    default:
      return state;
  }
}

export function ImportWizard({ entityType }: ImportWizardProps) {
  const { push } = useRouter();
  const { toast } = useToast();
  const [state, dispatch] = useReducer(wizardReducer, initialWizardState);
  const {
    currentStep,
    importId,
    csvHeaders,
    csvPreview,
    totalRows,
    fieldMapping,
    duplicateHandling,
  } = state;
  const [uploading, setUploading] = useState(false);

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Only CSV files are supported.',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'File size must be less than 10MB.',
      });
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', entityType);

      const response = await fetch('/api/v2/crm/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();
      dispatch({
        type: 'uploaded',
        importId: data.importId,
        csvHeaders: data.headers,
        csvPreview: data.preview,
        totalRows: data.totalRows,
        fileName: data.fileName,
      });

      toast({
        title: 'File uploaded successfully',
        description: `Found ${data.totalRows} rows. Proceed to map fields.`,
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Failed to upload file. Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  const handleMapComplete = (mapping: Record<string, string>) => {
    dispatch({ type: 'mapComplete', fieldMapping: mapping });
  };

  const handlePreviewComplete = (handling: 'skip' | 'update' | 'create') => {
    dispatch({ type: 'previewComplete', duplicateHandling: handling });
  };

  const handleImportComplete = () => {
    dispatch({ type: 'importComplete' });
  };

  const handleReset = () => {
    dispatch({ type: 'reset' });
  };

  const stepTitles = {
    upload: 'Upload CSV File',
    map: 'Map Fields',
    preview: 'Preview & Validate',
    import: 'Import Progress',
    complete: 'Import Complete',
  };

  const steps: Step[] = ['upload', 'map', 'preview', 'import', 'complete'];
  const currentStepIndex = steps.indexOf(currentStep);

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`size-10 rounded-full flex items-center justify-center text-sm font-medium ${
                  index < currentStepIndex
                    ? 'bg-primary text-primary-foreground'
                    : index === currentStepIndex
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {index < currentStepIndex ? (
                  <CheckCircle2 className="size-5" />
                ) : (
                  index + 1
                )}
              </div>
              <div className="text-xs mt-2 text-center">
                {stepTitles[step]}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-2 ${
                  index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{stepTitles[currentStep]}</CardTitle>
          <CardDescription>
            {currentStep === 'upload' && 'Upload a CSV file to import your data'}
            {currentStep === 'map' && 'Map CSV columns to CRM fields'}
            {currentStep === 'preview' && 'Review and validate your data before importing'}
            {currentStep === 'import' && 'Importing your data...'}
            {currentStep === 'complete' && 'Your data has been imported successfully'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 'upload' && (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary hover:bg-primary/5'
              } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center space-y-4">
                {uploading ? (
                  <>
                    <div className="size-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    <p className="text-sm text-muted-foreground">
                      Uploading and processing file...
                    </p>
                  </>
                ) : (
                  <>
                    <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Upload className="size-8 text-primary" />
                    </div>
                    <div>
                      <p className="text-lg font-medium">
                        {isDragActive
                          ? 'Drop your CSV file here'
                          : 'Drag & drop your CSV file here'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        or click to browse (max 10MB)
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                      <FileText className="size-4" />
                      <span>Supported format: CSV</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {currentStep === 'map' && importId && (
            <FieldMapper
              importId={importId}
              entityType={entityType}
              csvHeaders={csvHeaders}
              csvPreview={csvPreview}
              onComplete={handleMapComplete}
              onBack={handleReset}
            />
          )}

          {currentStep === 'preview' && importId && (
            <ImportPreview
              importId={importId}
              fieldMapping={fieldMapping}
              totalRows={totalRows}
              onComplete={handlePreviewComplete}
              onBack={() => dispatch({ type: 'goToStep', step: 'map' })}
            />
          )}

          {currentStep === 'import' && importId && (
            <ImportProgress
              importId={importId}
              fieldMapping={fieldMapping}
              duplicateHandling={duplicateHandling}
              onComplete={handleImportComplete}
            />
          )}

          {currentStep === 'complete' && (
            <div className="text-center py-8 space-y-6">
              <div className="flex justify-center">
                <div className="size-16 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="size-8 text-green-500" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold">Import Complete!</h3>
                <p className="text-muted-foreground mt-2">
                  Your {entityType === 'contact' ? 'contacts' : 'companies'} have been imported successfully.
                </p>
              </div>
              <div className="flex justify-center space-x-3">
                <Button onClick={handleReset}>
                  Import Another File
                </Button>
                <Button
                  variant="outline"
                  onClick={() => push(`/crm/${entityType === 'contact' ? 'contacts' : 'companies'}`)}
                >
                  View {entityType === 'contact' ? 'Contacts' : 'Companies'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
