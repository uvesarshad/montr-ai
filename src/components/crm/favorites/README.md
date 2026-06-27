# Favorites Components

This directory contains the UI components for the CRM Favorites system, allowing users to star and quickly access their favorite contacts, companies, deals, and views.

## Components

### FavoriteButton

A star button component that toggles favorite status with animation and optimistic updates.

**Features:**
- Filled/outline star icon based on favorite status
- Smooth animation on toggle
- Optimistic UI updates
- Automatic API sync
- Configurable size and variant
- Optional tooltip
- Click event handling with stopPropagation

**Props:**
```typescript
interface FavoriteButtonProps {
  targetType: FavoriteTargetType;     // 'contact' | 'company' | 'deal' | 'view'
  targetId: string;                   // ID of the entity
  initialIsFavorite?: boolean;        // Initial favorite state
  size?: 'sm' | 'default' | 'lg';    // Button size
  variant?: 'default' | 'ghost';      // Button variant
  showTooltip?: boolean;              // Show tooltip on hover
  onToggle?: (isFavorite: boolean) => void;  // Callback after toggle
}
```

**Usage:**

**In a table header or card:**
```tsx
import { FavoriteButton } from '@/components/crm/favorites';

function ContactCard({ contact }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3>{contact.firstName} {contact.lastName}</h3>
        <FavoriteButton
          targetType="contact"
          targetId={contact._id}
          initialIsFavorite={contact.isFavorite}
          size="sm"
          variant="ghost"
        />
      </div>
    </div>
  );
}
```

**In a detail page header:**
```tsx
function ContactDetailPage({ contact }) {
  const [isFavorite, setIsFavorite] = useState(contact.isFavorite);

  return (
    <div className="page-header">
      <h1>{contact.firstName} {contact.lastName}</h1>
      <FavoriteButton
        targetType="contact"
        targetId={contact._id}
        initialIsFavorite={isFavorite}
        onToggle={setIsFavorite}
        size="default"
      />
    </div>
  );
}
```

**Sizes:**
- `sm` - 28px button, 14px icon (for compact spaces)
- `default` - 36px button, 16px icon (standard)
- `lg` - 44px button, 20px icon (prominent placement)

---

### FavoritesList

A list component displaying all user favorites grouped by entity type.

**Features:**
- Automatic grouping by entity type (Contacts, Companies, Deals, Views)
- Entity icons and counts per group
- Item details (name, subtitle)
- Quick navigation on click
- Integrated favorite button for removal
- Loading and error states
- Empty state with helpful message
- Auto-fetch entity details

**Props:**
```typescript
interface FavoritesListProps {
  className?: string;
  onItemClick?: (targetType: FavoriteTargetType, targetId: string) => void;
}
```

**Usage:**

**In a sidebar:**
```tsx
import { FavoritesList } from '@/components/crm/favorites';

function CrmSidebar() {
  return (
    <div className="sidebar">
      <h2 className="sidebar-title">Favorites</h2>
      <FavoritesList />
    </div>
  );
}
```

**With custom navigation:**
```tsx
import { FavoritesList } from '@/components/crm/favorites';
import { useRouter } from 'next/navigation';

function FavoritesPanel() {
  const router = useRouter();

  const handleItemClick = (targetType, targetId) => {
    // Custom navigation logic
    if (targetType === 'contact') {
      router.push(`/crm/contacts/${targetId}`);
    }
  };

  return (
    <FavoritesList
      onItemClick={handleItemClick}
      className="h-[600px]"
    />
  );
}
```

**Display Format:**

The list shows:
- **Contacts**: Name, job title or email
- **Companies**: Name, industry or domain
- **Deals**: Name, formatted value
- **Views**: View name

---

## Entity Details

The FavoritesList component automatically fetches details for each favorited entity to display:

### Contact Details
- Primary: `firstName lastName`
- Secondary: `jobTitle` or `email`

### Company Details
- Primary: `name`
- Secondary: `industry` or `domain`

### Deal Details
- Primary: `name`
- Secondary: Formatted `value` (e.g., "$50,000")

---

## API Integration

The components work with the `useFavorites()` hook and these endpoints:

**Used by FavoriteButton:**
- `POST /api/v2/crm/favorites` - Add favorite
- `GET /api/v2/crm/favorites?targetType=...` - List favorites (to find ID for removal)
- `DELETE /api/v2/crm/favorites/:id` - Remove favorite

**Used by FavoritesList:**
- `GET /api/v2/crm/favorites` - List all favorites
- `GET /api/v2/crm/contacts/:id` - Fetch contact details
- `GET /api/v2/crm/companies/:id` - Fetch company details
- `GET /api/v2/crm/deals/:id` - Fetch deal details

---

## Integration Examples

### Example 1: Contact List with Favorites

```tsx
import { getContactColumns } from '@/components/crm/contacts/contact-table-columns';
import { FavoriteButton } from '@/components/crm/favorites';

function ContactsPage() {
  const columns = useMemo(() => [
    ...getContactColumns(),
    {
      id: 'favorite',
      header: '',
      cell: ({ row }) => (
        <FavoriteButton
          targetType="contact"
          targetId={row.original._id}
          initialIsFavorite={row.original.isFavorite}
          size="sm"
          variant="ghost"
          showTooltip={false}
        />
      ),
    },
  ], []);

  return <CrmDataGrid columns={columns} data={contacts} />;
}
```

### Example 2: Detail Page with Large Favorite Button

```tsx
import { FavoriteButton } from '@/components/crm/favorites';

function ContactDetailPage({ contact }) {
  return (
    <div className="page-header">
      <div className="flex items-center gap-4">
        <Avatar src={contact.avatar} />
        <div className="flex-1">
          <h1>{contact.firstName} {contact.lastName}</h1>
          <p className="text-muted-foreground">{contact.email}</p>
        </div>
        <FavoriteButton
          targetType="contact"
          targetId={contact._id}
          initialIsFavorite={contact.isFavorite}
          size="lg"
        />
      </div>
    </div>
  );
}
```

### Example 3: Sidebar with Favorites

```tsx
import { FavoritesList } from '@/components/crm/favorites';

function CrmLayout({ children }) {
  return (
    <div className="flex">
      <aside className="w-64 border-r">
        <div className="p-4">
          <h3 className="font-semibold mb-4">Quick Access</h3>
          <FavoritesList />
        </div>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

---

## Styling

All components use:
- Tailwind CSS for styling
- Lucide React icons (Star, User, Building2, Briefcase)
- Custom UI components from `@/components/ui`
- Yellow color for favorited state (`fill-yellow-400 text-yellow-400`)
- Smooth transitions and animations

---

## Animation

The FavoriteButton includes:
- **Pulse animation** on toggle (300ms)
- **Scale animation** (1.25x) when favoriting
- **Smooth transitions** for color changes
- **Optimistic updates** for instant feedback

---

## Accessibility

- Proper `aria-label` on buttons
- Keyboard navigation support
- Focus states with ring
- Screen reader friendly
- Semantic HTML structure

---

## Best Practices

1. **Always provide targetId and targetType** - Required for proper API calls
2. **Use initialIsFavorite when available** - Prevents unnecessary API calls
3. **Handle onToggle callback** - Update parent state or refetch data
4. **Choose appropriate size** - `sm` for tables, `default` for cards, `lg` for headers
5. **Use ghost variant in tables** - Cleaner appearance in dense layouts
6. **Disable tooltip in tables** - Reduces clutter when many buttons are visible
7. **Implement error handling** - Show toasts on API failures
8. **Consider loading states** - Disable button during API calls

---

## Performance Considerations

- **Optimistic updates** - Immediate UI feedback
- **Debounced API calls** - Prevent rapid toggling issues
- **Lazy loading** - FavoritesList fetches details on demand
- **Caching** - useFavorites hook maintains local state
- **Batch operations** - Consider bulk favoriting for power users

---

## Future Enhancements

Potential improvements:
- Drag-and-drop reordering in FavoritesList
- Favorite folders/categories
- Bulk add/remove favorites
- Keyboard shortcuts (e.g., F key to favorite)
- Recent favorites section
- Most accessed favorites
- Export favorites list
