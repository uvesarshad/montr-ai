# CRM Notes - TipTap Rich Text Editor

This directory contains the TipTap-powered rich text editor components for the MontrAI CRM.

## Components

### RichTextEditor

The main editable rich text editor component.

**Features:**
- Text formatting (bold, italic, underline, strikethrough)
- Headings (H1, H2, H3)
- Lists (bullet, numbered, task lists with checkboxes)
- Links (insert, edit, remove)
- Blockquotes and code blocks
- Text alignment (left, center, right)
- Undo/Redo

**Usage:**
```tsx
import { RichTextEditor } from '@/components/crm/notes/rich-text-editor';

function MyForm() {
  const [content, setContent] = useState('');
  const [plainText, setPlainText] = useState('');

  return (
    <RichTextEditor
      value={content}
      onChange={(json, text) => {
        setContent(json);      // TipTap JSON format
        setPlainText(text);    // Plain text for search
      }}
      placeholder="Write something..."
      minHeight="200px"
    />
  );
}
```

**Props:**
- `value?: string` - JSON string or HTML content
- `onChange: (json: string, text: string) => void` - Callback with JSON and plain text
- `placeholder?: string` - Placeholder text (default: "Write something...")
- `editable?: boolean` - Enable/disable editing (default: true)
- `className?: string` - Additional CSS classes
- `minHeight?: string` - Minimum height (default: "200px")

**Data Storage:**
The editor returns two values:
1. **JSON** (`json`): Store this in your database in a `content` field
2. **Plain Text** (`text`): Store this in a `plainText` field for search indexing

Example schema:
```typescript
notes: {
  content: String,    // TipTap JSON
  plainText: String,  // For search
  updatedAt: Date,
  updatedById: ObjectId
}
```

### NoteViewer

A read-only component for displaying rich text notes.

**Usage:**
```tsx
import { NoteViewer } from '@/components/crm/notes/note-viewer';

function ActivityItem({ activity }) {
  return (
    <div>
      <h3>{activity.subject}</h3>
      <NoteViewer content={activity.body} />
    </div>
  );
}
```

**Props:**
- `content: string` - JSON string or HTML content
- `className?: string` - Additional CSS classes

**Features:**
- Renders TipTap JSON content
- Links open in new tab
- Task list checkboxes are interactive (read-only)
- Gracefully handles plain text (migration from old format)

### EditorToolbar

The formatting toolbar component (used internally by RichTextEditor).

**Buttons:**
- Bold, Italic, Underline, Strikethrough
- Headings (H1, H2, H3)
- Bullet List, Numbered List, Task List
- Blockquote, Code Block
- Link (with dialog)
- Text Alignment (Left, Center, Right)
- Undo, Redo

## Integration Examples

### Activity Form (Notes/Tasks)

```tsx
<FormField
  control={form.control}
  name="body"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Description</FormLabel>
      <FormControl>
        <RichTextEditor
          value={field.value}
          onChange={(json, text) => {
            field.onChange(json);
            form.setValue('bodyPlain', text);
          }}
          placeholder="Add details..."
          minHeight="150px"
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

### Contact/Company Notes

```tsx
<FormField
  control={form.control}
  name="notes.content"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Internal Notes</FormLabel>
      <FormControl>
        <RichTextEditor
          value={field.value}
          onChange={(json, text) => {
            field.onChange(json);
            form.setValue('notes.plainText', text);
          }}
          placeholder="Add internal notes..."
          minHeight="200px"
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

### Activity Timeline Display

```tsx
{activity.body && (
  <div className="text-sm text-muted-foreground">
    <NoteViewer content={activity.body} />
  </div>
)}
```

## Migration from Old Format

The components gracefully handle migration from plain text to rich text:

```typescript
// Old format (plain text)
body: "This is a plain text note"

// New format (TipTap JSON)
body: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"This is a rich text note"}]}]}'
```

If the editor receives plain text, it automatically converts it to TipTap JSON format.

## Styling

The components use:
- Tailwind CSS for styling
- Custom CSS classes in `globals.css`:
  - `.prose` - Typography styles
  - `.task-list` - Task list styling
  - `.task-item` - Individual task item styling

## Keyboard Shortcuts

- **Bold**: Ctrl+B (Cmd+B on Mac)
- **Italic**: Ctrl+I (Cmd+I on Mac)
- **Underline**: Ctrl+U (Cmd+U on Mac)
- **Strikethrough**: Ctrl+Shift+S
- **Undo**: Ctrl+Z (Cmd+Z on Mac)
- **Redo**: Ctrl+Shift+Z (Cmd+Shift+Z on Mac)

## Dependencies

- `@tiptap/react`
- `@tiptap/starter-kit`
- `@tiptap/extension-link`
- `@tiptap/extension-placeholder`
- `@tiptap/extension-underline`
- `@tiptap/extension-text-align`
- `@tiptap/extension-task-list`
- `@tiptap/extension-task-item`

All dependencies are already installed in the project.
