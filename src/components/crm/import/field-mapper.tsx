'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FieldMapperProps {
  importId: string;
  entityType: 'contact' | 'company';
  csvHeaders: string[];
  csvPreview: Record<string, unknown>[];
  onComplete: (mapping: Record<string, string>) => void;
  onBack: () => void;
}

// Define available CRM fields for each entity type
const contactFields = [
  { value: 'firstName', label: 'First Name', required: true },
  { value: 'lastName', label: 'Last Name', required: false },
  { value: 'email', label: 'Email', required: true },
  { value: 'phone', label: 'Phone', required: false },
  { value: 'companyName', label: 'Company', required: false },
  { value: 'jobTitle', label: 'Job Title', required: false },
  { value: 'status', label: 'Status', required: false },
  { value: 'lifecycle', label: 'Lifecycle Stage', required: false },
  { value: 'rating', label: 'Rating', required: false },
  { value: 'address', label: 'Address', required: false },
  { value: 'city', label: 'City', required: false },
  { value: 'state', label: 'State', required: false },
  { value: 'country', label: 'Country', required: false },
  { value: 'postalCode', label: 'Postal Code', required: false },
  { value: 'website', label: 'Website', required: false },
  { value: 'source', label: 'Source', required: false },
  { value: 'notes', label: 'Notes', required: false },
];

const companyFields = [
  { value: 'name', label: 'Company Name', required: true },
  { value: 'domain', label: 'Domain', required: false },
  { value: 'type', label: 'Type', required: false },
  { value: 'industry', label: 'Industry', required: false },
  { value: 'size', label: 'Company Size', required: false },
  { value: 'revenue', label: 'Annual Revenue', required: false },
  { value: 'employees', label: 'Number of Employees', required: false },
  { value: 'phone', label: 'Phone', required: false },
  { value: 'email', label: 'Email', required: false },
  { value: 'address', label: 'Address', required: false },
  { value: 'city', label: 'City', required: false },
  { value: 'state', label: 'State', required: false },
  { value: 'country', label: 'Country', required: false },
  { value: 'postalCode', label: 'Postal Code', required: false },
  { value: 'website', label: 'Website', required: false },
  { value: 'linkedIn', label: 'LinkedIn', required: false },
  { value: 'twitter', label: 'Twitter', required: false },
  { value: 'description', label: 'Description', required: false },
];

export function FieldMapper({
  importId: _importId,
  entityType,
  csvHeaders,
  csvPreview,
  onComplete,
  onBack,
}: FieldMapperProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const crmFields = entityType === 'contact' ? contactFields : companyFields;
  const requiredFields = crmFields.filter((f) => f.required);

  // Auto-detect common field names
  useEffect(() => {
    const autoMapping: Record<string, string> = {};

    csvHeaders.forEach((csvHeader) => {
      const lowerHeader = csvHeader.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Try to match with CRM fields
      const matchedField = crmFields.find((field) => {
        const lowerFieldValue = field.value.toLowerCase();
        const lowerFieldLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');

        return (
          lowerHeader === lowerFieldValue ||
          lowerHeader === lowerFieldLabel ||
          lowerHeader.includes(lowerFieldValue) ||
          lowerFieldValue.includes(lowerHeader)
        );
      });

      if (matchedField) {
        autoMapping[csvHeader] = matchedField.value;
      }
    });

    setMapping(autoMapping);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvHeaders, entityType]);

  const handleMappingChange = (csvColumn: string, crmField: string) => {
    setMapping((prev) => ({
      ...prev,
      [csvColumn]: crmField,
    }));
  };

  const validateMapping = () => {
    const errors: string[] = [];
    const mappedFields = Object.values(mapping).filter((v) => v && v !== '__ignore__');

    // Check if required fields are mapped
    requiredFields.forEach((field) => {
      if (!mappedFields.includes(field.value)) {
        errors.push(`Required field "${field.label}" is not mapped`);
      }
    });

    // Check for duplicate mappings
    const fieldCounts: Record<string, number> = {};
    mappedFields.forEach((field) => {
      fieldCounts[field] = (fieldCounts[field] || 0) + 1;
    });

    Object.entries(fieldCounts).forEach(([field, count]) => {
      if (count > 1) {
        const fieldLabel = crmFields.find((f) => f.value === field)?.label || field;
        errors.push(`Field "${fieldLabel}" is mapped multiple times`);
      }
    });

    return errors;
  };

  const handleNext = () => {
    const validationErrors = validateMapping();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    // Remove unmapped or ignored fields
    const cleanedMapping = Object.fromEntries(
      Object.entries(mapping).filter(([_, v]) => v && v !== '__ignore__')
    );

    onComplete(cleanedMapping);
  };

  // Get sample values for a CSV column
  const getSampleValues = (csvColumn: string) => {
    return csvPreview
      .map((row) => row[csvColumn])
      .filter((v) => v)
      .slice(0, 3);
  };

  // Check if a CRM field is already mapped
  const isFieldMapped = (fieldValue: string) => {
    return Object.values(mapping).includes(fieldValue);
  };

  return (
    <div className="space-y-6">
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b">
          <div>
            <p className="font-medium">CSV Column</p>
            <p className="text-xs text-muted-foreground">Sample values</p>
          </div>
          <div className="flex-1 px-4" />
          <div>
            <p className="font-medium">CRM Field</p>
            <p className="text-xs text-muted-foreground">
              {requiredFields.length} required fields
            </p>
          </div>
        </div>

        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {csvHeaders.map((csvHeader) => {
            const samples = getSampleValues(csvHeader);
            const mappedValue = mapping[csvHeader];

            return (
              <div
                key={csvHeader}
                className="flex items-start space-x-4 p-3 border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <Label className="font-medium">{csvHeader}</Label>
                  {samples.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {samples.map((sample, index) => (
                        <Badge
                          key={`${csvHeader}-${index}`}
                          variant="outline"
                          className="text-xs max-w-[150px] truncate"
                        >
                          {String(sample)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-center text-muted-foreground">
                  <ArrowRight className="size-4" />
                </div>

                <div className="flex-1">
                  <Select
                    value={mappedValue || ''}
                    onValueChange={(value) =>
                      handleMappingChange(csvHeader, value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select field..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ignore__">-- Ignore --</SelectItem>
                      {crmFields.map((field) => (
                        <SelectItem
                          key={field.value}
                          value={field.value}
                          disabled={
                            isFieldMapped(field.value) &&
                            mappedValue !== field.value
                          }
                        >
                          {field.label}
                          {field.required && (
                            <span className="text-destructive ml-1">*</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>

        {/* Required Fields Summary */}
        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-2">Required Fields:</p>
          <div className="flex flex-wrap gap-2">
            {requiredFields.map((field) => {
              const isMapped = Object.values(mapping).includes(field.value);
              return (
                <Badge
                  key={field.value}
                  variant={isMapped ? 'default' : 'destructive'}
                >
                  {field.label}
                  {isMapped && ' ✓'}
                </Badge>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" />
          Back
        </Button>
        <Button onClick={handleNext}>
          Next: Preview
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
