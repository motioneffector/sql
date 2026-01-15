# Export and Import API

Methods for database file I/O.

---

## `export()`

Exports the database as a binary blob.

**Signature:**

```typescript
export(): Uint8Array
```

**Returns:** `Uint8Array` — The complete database as a SQLite file

**Example:**

```typescript
const data = db.export()
console.log(`Database size: ${data.length} bytes`)

// Download as file
const blob = new Blob([data], { type: 'application/x-sqlite3' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'backup.sqlite'
a.click()
URL.revokeObjectURL(url)
```

**Notes:**

- Returns a valid SQLite database file
- Can be opened in SQLite clients (DB Browser, etc.)
- Use before destructive operations for backup

---

## `import()`

Replaces the database contents with imported data.

**Signature:**

```typescript
import(data: Uint8Array | ArrayBuffer): void
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `data` | `Uint8Array \| ArrayBuffer` | Yes | SQLite database file contents |

**Returns:** `void`

**Example:**

```typescript
// From file upload
const file = await fileInput.files[0].arrayBuffer()
db.import(new Uint8Array(file))

// From previous export
const backup = db.export()
// ... make changes ...
db.import(backup) // Restore
```

**Behavior:**

- Closes current database and opens new one from data
- Schedules auto-save if persistence configured
- Validates SQLite file format before import

**Throws:**

- `SqlError` — If data is not valid SQLite format (must start with "SQLite format 3\0")
- `SqlError` — If file is too small to be valid

**Warning:** This replaces all current data. The previous database contents are lost.
