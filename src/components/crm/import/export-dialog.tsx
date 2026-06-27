'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Download, Loader2 } from 'lucide-react';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: 'contacts' | 'companies' | 'deals';
  availableFields: { value: string; label: string }[];
  filters?: object;
  selectedIds?: string[];
}

export function ExportDialog({
  open,
  onOpenChange,
  entityType,
  availableFields,
  filters = {},
  selectedIds = [],
}: ExportDialogProps) {
  const { toast } = useToast();
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [applyFilters, setApplyFilters] = useState(true);
  const [exporting, setExporting] = useState(false);

  const handleToggleField = (field: string) => {
    setSelectedFields((prev) =>
      prev.includes(field)
        ? prev.filter((f) => f !== field)
        : [...prev, field]
    );
  };

  const handleSelectAll = () => {
    if (selectedFields.length === availableFields.length) {
      setSelectedFields([]);
    } else {
      setSelectedFields(availableFields.map((f) => f.value));
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);

      const exportData: Record<string, unknown> = {
        fields: selectedFields,
      };

      // Include selected IDs if any
      if (selectedIds.length > 0) {
        exportData.selectedIds = selectedIds;
      } else if (applyFilters) {
        // Apply current filters
        exportData.filters = filters;
      }

      const response = await fetch(`/api/v2/crm/export/${entityType}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(exportData),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Download the CSV file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `${entityType}-export.csv`;

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Export successful',
        description: `Your ${entityType} have been exported to CSV.`,
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Export error:', error);
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: 'Failed to export data. Please try again.',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export {entityType}</DialogTitle>
          <DialogDescription>
            Select the fields you want to include in the export.
            {selectedIds.length > 0
              ? ` Exporting ${selectedIds.length} selected ${entityType}.`
              : ' All records matching current filters will be exported.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Select All */}
          <div className="flex items-center space-x-2 pb-2 border-b">
            <Checkbox
              id="select-all"
              checked={selectedFields.length === availableFields.length}
              onCheckedChange={handleSelectAll}
            />
            <Label
              htmlFor="select-all"
              className="font-medium cursor-pointer"
            >
              Select All Fields ({selectedFields.length} of {availableFields.length})
            </Label>
          </div>

          {/* Field Selection */}
          <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
            {availableFields.map((field) => (
              <div
                key={field.value}
                className="flex items-center space-x-2"
              >
                <Checkbox
                  id={`field-${field.value}`}
                  checked={selectedFields.includes(field.value)}
                  onCheckedChange={() => handleToggleField(field.value)}
                />
                <Label
                  htmlFor={`field-${field.value}`}
                  className="text-sm cursor-pointer"
                >
                  {field.label}
                </Label>
              </div>
            ))}
          </div>

          {/* Apply Filters Option */}
          {selectedIds.length === 0 && (
            <div className="flex items-center space-x-2 pt-2 border-t">
              <Checkbox
                id="apply-filters"
                checked={applyFilters}
                onCheckedChange={(checked) => setApplyFilters(checked as boolean)}
              />
              <Label
                htmlFor="apply-filters"
                className="text-sm cursor-pointer"
              >
                Apply current filters to export
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={selectedFields.length === 0 || exporting}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 size-4" />
                Export CSV
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
