# Export and Import

Export your database to a file for backup, sharing, or migration. Import to restore from a backup or load data from another source.

## Prerequisites

Before starting, you should:

- [Create a database](Your-First-Database) with some data

## Overview

We'll handle database files by:

1. Exporting to a Uint8Array
2. Downloading as a file
3. Importing from a Uint8Array
4. Loading from a file upload

## Step 1: Export to Uint8Array

The `export()` method returns the entire database as a binary blob:

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase()
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])

const data = db.export()
console.log(data) // Uint8Array(...)
console.log(data.length) // Size in bytes
```

The exported data is a valid SQLite database file.

## Step 2: Download as a File

Use browser APIs to save the exported data:

```typescript
function downloadDatabase(db: Database, filename: string = 'database.sqlite') {
  const data = db.export()
  const blob = new Blob([data], { type: 'application/x-sqlite3' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()

  URL.revokeObjectURL(url)
}

// Usage
downloadDatabase(db, 'my-app-backup.sqlite')
```

## Step 3: Import from Uint8Array

Replace the current database contents with imported data:

```typescript
// Assume `backupData` is a Uint8Array from a previous export
db.import(backupData)

// Database now contains the imported data
const users = db.all('SELECT * FROM users')
console.log(users)
```

Warning: `import()` replaces everything. The previous database contents are lost.

## Step 4: Load from File Upload

Handle user file selection:

```typescript
async function handleFileUpload(file: File, db: Database): Promise<void> {
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)

  try {
    db.import(data)
    console.log('Database imported successfully')
  } catch (error) {
    console.error('Invalid database file:', error.message)
    throw error
  }
}

// With an <input type="file">
const input = document.querySelector<HTMLInputElement>('#db-file')
input?.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    await handleFileUpload(file, db)
  }
})
```

## Complete Example

A backup and restore UI:

```typescript
import { createDatabase, SqlError } from '@motioneffector/sql'

const db = await createDatabase({
  persist: { key: 'my-app', storage: 'indexeddb' }
})

// Export button
document.querySelector('#export-btn')?.addEventListener('click', () => {
  const data = db.export()
  const blob = new Blob([data], { type: 'application/x-sqlite3' })
  const url = URL.createObjectURL(blob)

  const timestamp = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `backup-${timestamp}.sqlite`
  a.click()

  URL.revokeObjectURL(url)
})

// Import input
document.querySelector<HTMLInputElement>('#import-file')?.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  const confirmed = confirm(
    'This will replace all current data. Are you sure?'
  )
  if (!confirmed) return

  try {
    const buffer = await file.arrayBuffer()
    db.import(new Uint8Array(buffer))
    alert('Import successful!')
    location.reload() // Refresh UI with new data
  } catch (error) {
    if (error instanceof SqlError) {
      alert('Invalid database file. Please select a valid SQLite backup.')
    } else {
      alert('Import failed: ' + (error as Error).message)
    }
  }
})
```

## Variations

### Creating a New Database from File

Instead of replacing an existing database:

```typescript
async function openDatabaseFile(file: File): Promise<Database> {
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)

  // Create new database from the file data
  return createDatabase({ data })
}
```

### Backup Before Destructive Operations

Save a restore point:

```typescript
async function dangerousOperation(db: Database) {
  // Create backup
  const backup = db.export()

  try {
    await db.transaction(() => {
      db.exec('DROP TABLE old_data')
      db.exec('DELETE FROM logs WHERE created_at < date("now", "-1 year")')
    })
  } catch (error) {
    // Restore from backup
    db.import(backup)
    throw error
  }
}
```

### Cloning a Database

Create an independent copy:

```typescript
const original = await createDatabase()
original.exec('CREATE TABLE test (id INTEGER)')
original.run('INSERT INTO test VALUES (1)')

// Clone via export/import
const cloneData = original.export()
const clone = await createDatabase({ data: cloneData })

// Or use the convenience method
const clone2 = await original.clone()

// Changes to clone don't affect original
clone.run('INSERT INTO test VALUES (2)')
console.log(original.all('SELECT * FROM test').length) // 1
console.log(clone.all('SELECT * FROM test').length) // 2
```

### Sharing Databases

Generate a shareable link (requires server):

```typescript
async function shareDatabase(db: Database): Promise<string> {
  const data = db.export()

  const response = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: data
  })

  const { shareId } = await response.json()
  return `${location.origin}/shared/${shareId}`
}
```

## Troubleshooting

### SqlError: Invalid SQLite file

**Symptom:** `SqlError: Invalid SQLite file: not a valid SQLite database format`

**Cause:** The file isn't a SQLite database (wrong file type, corrupted, etc.)

**Solution:** Verify the file was exported from this library or is a valid .sqlite file. Check the file isn't truncated.

### Large Export Size

**Symptom:** Exported file is unexpectedly large.

**Cause:** Database contains lots of data, or deleted data hasn't been vacuumed.

**Solution:** Run `db.exec('VACUUM')` before export to reclaim space from deleted rows.

### Import Doesn't Trigger Persistence Save

**Symptom:** After import, data isn't auto-saved to storage.

**Cause:** Import schedules a save, but if you close immediately it might not complete.

**Solution:** Call `await db.save()` after import if you need guaranteed persistence.

## See Also

- **[Setting Up Persistence](Guide-Setting-Up-Persistence)** - Automatic browser storage
- **[Export and Import API](API-Export-And-Import)** - Method reference
- **[Lifecycle Methods API](API-Lifecycle-Methods)** - clone() for copying databases
