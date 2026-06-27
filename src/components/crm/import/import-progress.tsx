'use client';

import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface ImportProgressProps {
  importId: string;
  fieldMapping: Record<string, string>;
  duplicateHandling: 'skip' | 'update' | 'create';
  onComplete: () => void;
}

interface ImportError {
  row: number;
  error: string;
  field?: string;
}

interface ImportStatus {
  status: string;
  processedRows: number;
  totalRows: number;
  successCount: number;
  errorCount: number;
  duplicateCount: number;
  importErrors: ImportError[];
}

export function ImportProgress({
  importId,
  fieldMapping,
  duplicateHandling,
  onComplete,
}: ImportProgressProps) {
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startImport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startImport = async () => {
    try {
      setImporting(true);
      setError(null);

      // Start import
      const response = await fetch(`/api/v2/crm/import/${importId}/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          fieldMapping,
          duplicateHandling,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start import');
      }

      // Poll for status
      pollStatus();
    } catch (error) {
      console.error('Import error:', error);
      setError(error instanceof Error ? error.message : 'Failed to start import');
      setImporting(false);
    }
  };

  const pollStatus = async () => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v2/crm/import/${importId}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch status');
        }

        const data = await response.json();
        setStatus(data);

        // Check if import is complete
        if (data.status === 'completed') {
          clearInterval(interval);
          setImporting(false);
          setTimeout(() => {
            onComplete();
          }, 2000);
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          clearInterval(interval);
          setImporting(false);
          setError(
            data.status === 'cancelled'
              ? 'Import was cancelled'
              : 'Import failed. Please check the errors and try again.'
          );
        }
      } catch (error) {
        console.error('Poll status error:', error);
        clearInterval(interval);
        setImporting(false);
        setError('Failed to fetch import status');
      }
    }, 1000); // Poll every second
  };

  const progress = status
    ? Math.round((status.processedRows / status.totalRows) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <XCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : importing ? (
        <>
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="size-8 text-primary animate-spin" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold">Importing your data...</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Please wait while we process your records
              </p>
            </div>
          </div>

          {status && (
            <>
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {status.processedRows} of {status.totalRows} rows processed
                  </span>
                  <span>
                    {status.totalRows - status.processedRows} remaining
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {status.successCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Successful</div>
                </div>
                <div className="border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {status.duplicateCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Duplicates</div>
                </div>
                <div className="border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {status.errorCount}
                  </div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
              </div>

              {/* Recent Errors */}
              {status.importErrors && status.importErrors.length > 0 && (
                <Alert>
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    <p className="font-medium mb-2">Recent Errors:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {status.importErrors.slice(0, 5).map((error: ImportError) => (
                        <li key={`${error.row}-${error.error}`}>
                          Row {error.row}: {error.error}
                        </li>
                      ))}
                      {status.importErrors.length > 5 && (
                        <li className="text-muted-foreground">
                          ... and {status.importErrors.length - 5} more errors
                        </li>
                      )}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </>
      ) : status?.status === 'completed' ? (
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="size-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="size-8 text-green-500" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Import Complete!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Successfully imported {status.successCount} record
              {status.successCount !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Final Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {status.successCount}
              </div>
              <div className="text-sm text-muted-foreground">Successful</div>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {status.duplicateCount}
              </div>
              <div className="text-sm text-muted-foreground">Duplicates</div>
            </div>
            <div className="border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-600">
                {status.errorCount}
              </div>
              <div className="text-sm text-muted-foreground">Errors</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
