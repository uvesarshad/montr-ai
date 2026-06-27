# Views Components

This directory contains the UI components for the CRM Views system, allowing users to create, manage, and apply saved views with custom filters and column configurations.

## Components

### FilterBuilder

A visual filter builder component that allows users to create complex filter criteria.

**Features:**
- Add/remove filter rows
- Field selector based on entity type
- Dynamic operator selection based on field type
- Value input with type-specific controls
- AND/OR conjunction logic
- "Save as View" action button

**Props:**
```typescript
interface FilterBuilderProps {
  entityType: ViewEntityType;         // 'contact' | 'company' | 'deal' | 'activity'
  filters: ViewFilter[];              // Current filters
  onChange: (filters: ViewFilter[]) => void;
  onSaveAsView?: () => void;          // Optional callback for "Save as View" button
}
```

**Usage:**
```tsx
import { FilterBuilder } from '@/components/crm/views';

function MyComponent() {
  const [filters, setFilters] = useState<ViewFilter[]>([]);

  return (
    <FilterBuilder
      entityType="contact"
      filters={filters}
      onChange={setFilters}
      onSaveAsView={() => setShowViewEditor(true)}
    />
  );
}
```

---

### ViewEditor

A dialog component for creating or editing views with filters, columns, and settings.

**Features:**
- Tabbed interface (General, Filters, Columns)
- View name and entity type selection
- Visibility settings (private, team, organization)
- Column selection with checkboxes
- Filter builder integration
- Pin to sidebar toggle
- Set as default toggle

**Props:**
```typescript
interface ViewEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view?: View | null;                    // Existing view to edit (optional)
  entityType?: ViewEntityType;           // Initial entity type
  initialFilters?: ViewFilter[];         // Pre-populate filters
  onSave: (view: View) => void;          // Success callback
}
```

**Usage:**
```tsx
import { ViewEditor } from '@/components/crm/views';

function MyComponent() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingView, setEditingView] = useState<View | null>(null);

  const handleSave = (view: View) => {
    console.log('View saved:', view);
    // Refresh views list
  };

  return (
    <>
      <Button onClick={() => setEditorOpen(true)}>Create View</Button>

      <ViewEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        view={editingView}
        entityType="contact"
        onSave={handleSave}
      />
    </>
  );
}
```

---

### ViewSidebar

A sidebar component displaying all views with management actions.

**Features:**
- Pinned views section
- All views section
- View item with name, icon, and actions
- Quick actions menu (edit, pin/unpin, set default, delete)
- Default view indicator
- Create new view button
- Loading and empty states

**Props:**
```typescript
interface ViewSidebarProps {
  views: View[];
  loading?: boolean;
  entityType: ViewEntityType;
  selectedViewId?: string;
  onViewSelect: (view: View) => void;
  onViewCreated?: (view: View) => void;
  onViewUpdated?: (view: View) => void;
  onViewDeleted?: (viewId: string) => void;
}
```

**Usage:**
```tsx
import { ViewSidebar } from '@/components/crm/views';
import { useViews } from '@/hooks/crm/use-views';

function MyLayout() {
  const { views, loading, refetch } = useViews({ entityType: 'contact' });
  const [selectedViewId, setSelectedViewId] = useState<string>();

  return (
    <div className="flex">
      <ViewSidebar
        views={views}
        loading={loading}
        entityType="contact"
        selectedViewId={selectedViewId}
        onViewSelect={(view) => setSelectedViewId(view._id)}
        onViewCreated={() => refetch()}
        onViewUpdated={() => refetch()}
        onViewDeleted={() => refetch()}
      />
      <div className="flex-1">
        {/* Main content */}
      </div>
    </div>
  );
}
```

---

### ViewSelector

A dropdown component for selecting views in the page header.

**Features:**
- Dropdown with all available views
- Grouped by pinned/other
- Default view indicator
- Filter count badge
- "Create New View" action
- Integrates ViewEditor dialog

**Props:**
```typescript
interface ViewSelectorProps {
  entityType: ViewEntityType;
  selectedViewId?: string;
  onViewSelect: (view: View | null) => void;
  className?: string;
}
```

**Usage:**
```tsx
import { ViewSelector } from '@/components/crm/views';

function MyPage() {
  const [selectedView, setSelectedView] = useState<View | null>(null);

  return (
    <div className="flex items-center gap-4">
      <h1>Contacts</h1>
      <ViewSelector
        entityType="contact"
        selectedViewId={selectedView?._id}
        onViewSelect={setSelectedView}
      />
    </div>
  );
}
```

---

## Field Definitions

The components use predefined field definitions for each entity type:

### Contact Fields
- firstName, lastName, email, phone
- status, lifecycle, rating, score
- jobTitle, source
- createdAt, lastActivityAt

### Company Fields
- name, domain, industry, type
- size, annualRevenue, employeeCount
- createdAt

### Deal Fields
- name, value, status, priority
- probability, expectedCloseDate
- createdAt

### Activity Fields
- type, title, status, priority
- dueDate, createdAt

---

## Filter Operators

Different operators are available based on field type:

### Text Fields
- equals, not_equals
- contains, not_contains
- is_empty, is_not_empty

### Number Fields
- equals, not_equals
- gt, gte, lt, lte
- is_empty, is_not_empty

### Date Fields
- equals (is on)
- gt (is after), gte (is on or after)
- lt (is before), lte (is on or before)
- is_empty, is_not_empty

### Select Fields
- equals (is), not_equals (is not)
- in (is any of), not_in (is none of)
- is_empty, is_not_empty

---

## Integration Example

See the live contacts page `src/app/(app)/crm/contacts/page.tsx` for a complete integration example showing:

1. View selector in page header
2. Filter builder for creating filters
3. Saving filters as a new view
4. Applying view filters to API queries
5. Converting view filters to API filter parameters

---

## API Integration

The components work with these hooks:

- `useViews()` - Fetch and manage views
- `useView(id)` - Fetch single view

API endpoints used:
- `GET /api/v2/crm/views` - List views
- `POST /api/v2/crm/views` - Create view
- `PATCH /api/v2/crm/views/:id` - Update view
- `DELETE /api/v2/crm/views/:id` - Delete view
- `POST /api/v2/crm/views/:id/pin` - Pin view
- `POST /api/v2/crm/views/:id/unpin` - Unpin view
- `POST /api/v2/crm/views/:id/default` - Set default view

---

## Styling

All components use:
- Tailwind CSS for styling
- Radix UI primitives (Dialog, Select, etc.)
- Custom UI components from `@/components/ui`
- shadcn/ui design system

---

## Best Practices

1. **Always filter by entity type** when fetching views
2. **Reset pagination** when changing views
3. **Show filter count** to indicate active filters
4. **Provide clear empty states** when no views exist
5. **Use optimistic updates** for better UX
6. **Handle loading states** properly
7. **Validate filter values** before applying
8. **Provide tooltips** for better discoverability
