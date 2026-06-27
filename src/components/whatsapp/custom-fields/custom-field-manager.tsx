'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Settings } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui-kit';

interface CustomField {
  _id: string;
  name: string;
  fieldKey: string;
  fieldType: string;
  options?: string[];
  isRequired: boolean;
  order: number;
  createdAt: string;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
];

interface FieldListItemProps {
  field: CustomField;
  onEdit: (field: CustomField) => void;
  onDelete: (fieldId: string) => void;
}

function FieldListItem({ field, onEdit, onDelete }: FieldListItemProps) {
  return (
    <Card>
      <div className="flex items-start justify-between p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">{field.name}</span>
            {field.isRequired && (
              <Chip tone="brand">Required</Chip>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
            <code className="rounded bg-muted px-2 py-0.5 text-xs">
              {field.fieldKey}
            </code>
            <span>•</span>
            <Chip tone="gray">
              {FIELD_TYPES.find((t) => t.value === field.fieldType)?.label}
            </Chip>
            {field.fieldType === 'dropdown' && field.options && (
              <span className="text-xs text-muted-foreground">
                ({field.options.length} options)
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            icon={Edit}
            iconSize={16}
            aria-label="Edit field"
            onClick={() => onEdit(field)}
          />
          <IconButton
            icon={Trash2}
            iconSize={16}
            aria-label="Delete field"
            onClick={() => onDelete(field._id)}
          />
        </div>
      </div>
    </Card>
  );
}

export function CustomFieldManager() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<CustomField | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    fieldKey: '',
    fieldType: 'text',
    options: '',
    isRequired: false,
  });

  // Fetch custom fields
  const fetchFields = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/whatsapp/custom-fields');
      const data = await response.json();

      if (response.ok) {
        setFields(data.data || []);
      } else {
        toast.error('Failed to fetch custom fields');
      }
    } catch (error) {
      toast.error('Error fetching custom fields');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Create field
  const handleCreateField = async () => {
    if (!formData.name.trim() || !formData.fieldKey.trim()) {
      toast.error('Field name and key are required');
      return;
    }

    // Parse options for dropdown
    const options =
      formData.fieldType === 'dropdown' && formData.options
        ? formData.options.split('\n').filter((opt) => opt.trim())
        : undefined;

    try {
      const response = await fetch('/api/whatsapp/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          fieldKey: formData.fieldKey,
          fieldType: formData.fieldType,
          options,
          isRequired: formData.isRequired,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Custom field created successfully');
        setIsCreateDialogOpen(false);
        resetForm();
        fetchFields();
      } else {
        toast.error(data.error || 'Failed to create field');
      }
    } catch (error) {
      toast.error('Error creating field');
      console.error(error);
    }
  };

  // Update field
  const handleUpdateField = async () => {
    if (!selectedField || !formData.name.trim()) {
      toast.error('Field name is required');
      return;
    }

    // Parse options for dropdown
    const options =
      formData.fieldType === 'dropdown' && formData.options
        ? formData.options.split('\n').filter((opt) => opt.trim())
        : undefined;

    try {
      const response = await fetch(`/api/whatsapp/custom-fields/${selectedField._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          options,
          isRequired: formData.isRequired,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Custom field updated successfully');
        setIsEditDialogOpen(false);
        setSelectedField(null);
        resetForm();
        fetchFields();
      } else {
        toast.error(data.error || 'Failed to update field');
      }
    } catch (error) {
      toast.error('Error updating field');
      console.error(error);
    }
  };

  // Delete field
  const handleDeleteField = async (fieldId: string) => {
    if (!confirm('Are you sure you want to delete this field? This will remove all associated contact field values.')) {
      return;
    }

    try {
      const response = await fetch(`/api/whatsapp/custom-fields/${fieldId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Custom field deleted successfully');
        fetchFields();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to delete field');
      }
    } catch (error) {
      toast.error('Error deleting field');
      console.error(error);
    }
  };

  // Open edit dialog
  const openEditDialog = (field: CustomField) => {
    setSelectedField(field);
    setFormData({
      name: field.name,
      fieldKey: field.fieldKey,
      fieldType: field.fieldType,
      options: field.options?.join('\n') || '',
      isRequired: field.isRequired,
    });
    setIsEditDialogOpen(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      fieldKey: '',
      fieldType: 'text',
      options: '',
      isRequired: false,
    });
  };

  // Generate field key from name
  const generateFieldKey = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  // Auto-generate field key when name changes (only for create)
  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      fieldKey: isCreateDialogOpen ? generateFieldKey(name) : formData.fieldKey,
    });
  };

  // Load fields on mount
  useEffect(() => {
    fetchFields();
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Custom Contact Fields</h2>
          <p className="text-[13px] text-muted-foreground">
            Define custom fields to capture additional contact information
          </p>
        </div>
        <Button size="sm" icon={Plus} onClick={() => setIsCreateDialogOpen(true)}>
          Create Field
        </Button>
      </div>

      {/* Fields List */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : fields.length === 0 ? (
        <Card>
          <EmptyState
            icon={Settings}
            title="No custom fields yet"
            note="Create custom fields to capture additional contact information"
            cta={
              <Button size="sm" icon={Plus} onClick={() => setIsCreateDialogOpen(true)}>
                Create First Field
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {fields.map((field) => (
            <FieldListItem
              key={field._id}
              field={field}
              onEdit={openEditDialog}
              onDelete={handleDeleteField}
            />
          ))}
        </div>
      )}

      {/* Create Field Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Custom Field</DialogTitle>
            <DialogDescription>
              Add a new custom field to capture additional contact information
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Field Name" required htmlFor="name">
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g., Company Name, Job Title, Birthday"
              />
            </Field>
            <Field
              label="Field Key"
              required
              htmlFor="fieldKey"
              hint={`Used in templates as {{field_${formData.fieldKey}}}`}
            >
              <Input
                id="fieldKey"
                value={formData.fieldKey}
                onChange={(e) =>
                  setFormData({ ...formData, fieldKey: e.target.value })
                }
                placeholder="e.g., company_name, job_title, birthday"
              />
            </Field>
            <Field label="Field Type" required>
              <Select
                value={formData.fieldType}
                onChange={(value) =>
                  setFormData({ ...formData, fieldType: value })
                }
                options={FIELD_TYPES}
              />
            </Field>
            {formData.fieldType === 'dropdown' && (
              <Field label="Dropdown Options" required htmlFor="options">
                <Textarea
                  id="options"
                  value={formData.options}
                  onChange={(e) =>
                    setFormData({ ...formData, options: e.target.value })
                  }
                  placeholder="Enter each option on a new line"
                  rows={4}
                />
              </Field>
            )}
            <div className="flex items-center gap-x-2">
              <input
                type="checkbox"
                id="isRequired"
                checked={formData.isRequired}
                onChange={(e) =>
                  setFormData({ ...formData, isRequired: e.target.checked })
                }
                className="rounded"
              />
              <label htmlFor="isRequired" className="text-sm text-foreground cursor-pointer">Required field</label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateField}>Create Field</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Field Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Custom Field</DialogTitle>
            <DialogDescription>
              Update field properties (field key and type cannot be changed)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Field Name" required htmlFor="edit-name">
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </Field>
            <Field label="Field Key" hint="Field key cannot be changed after creation">
              <Input value={formData.fieldKey} disabled />
            </Field>
            <Field label="Field Type">
              <Input
                value={
                  FIELD_TYPES.find((t) => t.value === formData.fieldType)?.label
                }
                disabled
              />
            </Field>
            {formData.fieldType === 'dropdown' && (
              <Field label="Dropdown Options" required htmlFor="edit-options">
                <Textarea
                  id="edit-options"
                  value={formData.options}
                  onChange={(e) =>
                    setFormData({ ...formData, options: e.target.value })
                  }
                  placeholder="Enter each option on a new line"
                  rows={4}
                />
              </Field>
            )}
            <div className="flex items-center gap-x-2">
              <input
                type="checkbox"
                id="edit-isRequired"
                checked={formData.isRequired}
                onChange={(e) =>
                  setFormData({ ...formData, isRequired: e.target.checked })
                }
                className="rounded"
              />
              <label htmlFor="edit-isRequired" className="text-sm text-foreground cursor-pointer">Required field</label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setSelectedField(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateField}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
