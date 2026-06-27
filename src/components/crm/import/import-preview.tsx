'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, ArrowRight, Loader2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ImportPreviewProps {
  importId: string;
  fieldMapping: Record<string, string>;
  totalRows: number;
  onComplete: (duplicateHandling: 'skip' | 'update' | 'create') => void;
  onBack: () => void;
}

interface PreviewRow {
  _rowNumber?: number;
  [key: string]: unknown;
}

interface PreviewDuplicate {
  row: number;
  field: string;
  value: string;
  existingName: string;
}

interface PreviewError {
  row: number;
  error: string;
  field?: string;
}

interface PreviewData {
  validRows: PreviewRow[];
  invalidRows: PreviewRow[];
  duplicates: PreviewDuplicate[];
  errors: PreviewError[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
}

export function ImportPreview({
  importId,
  fieldMapping,
  totalRows: _totalRows,
  onComplete,
  onBack,
}: ImportPreviewProps) {
  const [duplicateHandling, setDuplicateHandling] = useState<'skip' | 'update' | 'create'>('skip');
  const [loading, setLoading] = useState(true);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId, fieldMapping, duplicateHandling]);

  const loadPreview = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/crm/import/${importId}/preview`, {
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
        throw new Error('Failed to preview import');
      }

      const data = await response.json();
      setPreviewData(data);
    } catch (err) {
      console.error('Preview error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    onComplete(duplicateHandling);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Validating your data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!previewData) {
    return null;
  }

  const { stats, validRows, invalidRows, duplicates, errors } = previewData;

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-muted-foreground">Total Rows</div>
        </div>
        <div className="border rounded-lg p-4 border-green-500/50 bg-green-500/5">
          <div className="text-2xl font-bold text-green-600">{stats.valid}</div>
          <div className="text-sm text-muted-foreground">Valid</div>
        </div>
        <div className="border rounded-lg p-4 border-yellow-500/50 bg-yellow-500/5">
          <div className="text-2xl font-bold text-yellow-600">{stats.duplicates}</div>
          <div className="text-sm text-muted-foreground">Duplicates</div>
        </div>
        <div className="border rounded-lg p-4 border-red-500/50 bg-red-500/5">
          <div className="text-2xl font-bold text-red-600">{stats.invalid}</div>
          <div className="text-sm text-muted-foreground">Invalid</div>
        </div>
      </div>

      {/* Duplicate Handling Options */}
      {stats.duplicates > 0 && (
        <div className="border rounded-lg p-4 space-y-3">
          <Label className="text-base font-medium">
            How should duplicates be handled?
          </Label>
          <RadioGroup
            value={duplicateHandling}
            onValueChange={(value: string) => setDuplicateHandling(value as 'skip' | 'update' | 'create')}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="skip" id="skip" />
              <Label htmlFor="skip" className="font-normal cursor-pointer">
                Skip duplicates - Don&apos;t import duplicate records
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="update" id="update" />
              <Label htmlFor="update" className="font-normal cursor-pointer">
                Update duplicates - Update existing records with new data
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="create" id="create" />
              <Label htmlFor="create" className="font-normal cursor-pointer">
                Create anyway - Create duplicate records
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {/* Validation Errors */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            <p className="font-medium mb-2">
              Found {errors.length} validation errors:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {errors.slice(0, 10).map((error: PreviewError) => (
                <li key={`${error.row}-${error.error}`}>
                  Row {error.row}: {error.error}
                  {error.field && ` (${error.field})`}
                </li>
              ))}
              {errors.length > 10 && (
                <li className="text-muted-foreground">
                  ... and {errors.length - 10} more errors
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Duplicates List */}
      {duplicates.length > 0 && (
        <div className="space-y-2">
          <Label className="text-base font-medium">
            Duplicate Records ({duplicates.length})
          </Label>
          <div className="border rounded-lg max-h-[200px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Existing Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {duplicates.slice(0, 10).map((dup: PreviewDuplicate) => (
                  <TableRow key={`${dup.row}-${dup.field}`}>
                    <TableCell>{dup.row}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{dup.field}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{dup.value}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {dup.existingName}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {duplicates.length > 10 && (
              <div className="p-2 text-center text-sm text-muted-foreground border-t">
                ... and {duplicates.length - 10} more duplicates
              </div>
            )}
          </div>
        </div>
      )}

      {/* Valid Records Preview */}
      {validRows.length > 0 && (
        <div className="space-y-2">
          <Label className="text-base font-medium">
            Valid Records Preview ({stats.valid} total)
          </Label>
          <div className="border rounded-lg max-h-[300px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Row</TableHead>
                  {Object.keys(validRows[0])
                    .filter((key) => key !== '_rowNumber')
                    .map((key) => (
                      <TableHead key={key}>{key}</TableHead>
                    ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {validRows.slice(0, 5).map((row: PreviewRow) => (
                  <TableRow key={row._rowNumber}>
                    <TableCell className="font-mono text-sm">
                      {row._rowNumber}
                    </TableCell>
                    {Object.entries(row)
                      .filter(([key]) => key !== '_rowNumber')
                      .map(([key, value]) => (
                        <TableCell key={key} className="text-sm">
                          {String(value || '')}
                        </TableCell>
                      ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {validRows.length > 5 && (
              <div className="p-2 text-center text-sm text-muted-foreground border-t">
                ... and {validRows.length - 5} more valid records
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invalid Records */}
      {invalidRows.length > 0 && (
        <div className="space-y-2">
          <Label className="text-base font-medium">
            Invalid Records ({stats.invalid} total)
          </Label>
          <Alert variant="destructive">
            <XCircle className="size-4" />
            <AlertDescription>
              {stats.invalid} records have validation errors and will not be imported.
              Please fix these errors in your CSV file and try again.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Action Summary */}
      <div className="border-t pt-4">
        <div className="flex items-center space-x-2 text-sm">
          {stats.valid > 0 ? (
            <CheckCircle2 className="size-5 text-green-500" />
          ) : (
            <XCircle className="size-5 text-red-500" />
          )}
          <span>
            {stats.valid > 0
              ? `Ready to import ${stats.valid} record${stats.valid !== 1 ? 's' : ''}`
              : 'No valid records to import'}
          </span>
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" />
          Back
        </Button>
        <Button onClick={handleNext} disabled={stats.valid === 0}>
          Next: Import
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
