# Batch Operations API

Methods for bulk data operations.

---

## `insertMany()`

Inserts multiple rows efficiently in a single transaction.

**Signature:**

```typescript
insertMany(
  tableName: string,
  rows: Record<string, unknown>[]
): number[]
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableName` | `string` | Yes | Table to insert into |
| `rows` | `Record<string, unknown>[]` | Yes | Array of row objects |

**Returns:** `number[]` — Array of inserted row IDs

**Example:**

```typescript
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)')

const ids = db.insertMany('users', [
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'bob@example.com' },
  { name: 'Charlie', email: 'charlie@example.com' }
])

console.log(ids) // [1, 2, 3]
```

**Behavior:**

- All rows must have the same columns (based on first row)
- Wraps all inserts in a transaction
- If any insert fails, all are rolled back
- Uses the table helper internally

**Throws:**

- `Error` — If rows have inconsistent columns
- `SqlConstraintError` — On constraint violation (all rows rolled back)
- `SqlNotFoundError` — If table doesn't exist

**Notes:**

- More efficient than individual `insert()` calls
- Returns early with empty array if rows is empty
- Column order is determined by the first row

**Example with Error Handling:**

```typescript
try {
  const ids = db.insertMany('users', [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'alice@example.com' }, // Duplicate email!
    { name: 'Charlie', email: 'charlie@example.com' }
  ])
} catch (error) {
  if (error instanceof SqlConstraintError) {
    console.log('Batch failed: duplicate or constraint violation')
    // No rows were inserted
  }
}
```
