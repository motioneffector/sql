# Table Helper API

High-level CRUD operations without writing SQL.

---

## `table()`

Creates a helper object for table operations.

**Signature:**

```typescript
table<T extends Record<string, unknown>>(
  tableName: string,
  options?: TableOptions
): TableHelper<T>
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `tableName` | `string` | Yes | Name of the table |
| `options` | `TableOptions` | No | Configuration options |

**Returns:** `TableHelper<T>` — Object with CRUD methods

**Example:**

```typescript
interface User {
  id: number
  name: string
  email: string
}

const users = db.table<User>('users')
const products = db.table('products', { primaryKey: 'sku' })
```

**Throws:**

- `Error` — If tableName is empty

---

## `TableHelper.insert()`

Inserts a row and returns the new ID.

**Signature:**

```typescript
insert(data: Partial<T>): number
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `data` | `Partial<T>` | Yes | Column values to insert |

**Returns:** `number` — The inserted row's primary key value

**Example:**

```typescript
const id = users.insert({ name: 'Alice', email: 'alice@example.com' })
console.log(id) // 1
```

**Notes:**

- Omit columns with defaults (they use the default)
- `undefined` values are omitted from the INSERT
- `null` values insert NULL

**Throws:**

- `SqlConstraintError` — On NOT NULL, UNIQUE, or FK violation
- `SqlNotFoundError` — If table doesn't exist

---

## `TableHelper.find()`

Finds a row by its primary key.

**Signature:**

```typescript
find(id: unknown, options?: { key?: string }): T | undefined
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `unknown` | Yes | Primary key value |
| `options.key` | `string` | No | Override the lookup column for this call |

**Returns:** `T | undefined` — The row object, or undefined if not found

**Example:**

```typescript
const user = users.find(1)
const byEmail = users.find('alice@example.com', { key: 'email' })
```

---

## `TableHelper.where()`

Finds rows matching conditions.

**Signature:**

```typescript
where(conditions: Partial<T>): T[]
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `conditions` | `Partial<T>` | Yes | Column-value pairs to match (AND logic) |

**Returns:** `T[]` — Array of matching rows

**Example:**

```typescript
// Single condition
const admins = users.where({ role: 'admin' })

// Multiple conditions (AND)
const activeAdmins = users.where({ role: 'admin', active: 1 })

// Empty conditions returns all rows
const all = users.where({})

// NULL matching
const unverified = users.where({ verified_at: null })
```

**Throws:**

- `SqlNotFoundError` — If table or column doesn't exist

---

## `TableHelper.update()`

Updates a row by primary key.

**Signature:**

```typescript
update(
  id: unknown,
  data: Partial<T>,
  options?: { key?: string }
): number
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `unknown` | Yes | Primary key value |
| `data` | `Partial<T>` | Yes | Columns to update |
| `options.key` | `string` | No | Override the lookup column |

**Returns:** `number` — Number of rows updated (0 or 1)

**Example:**

```typescript
const changed = users.update(1, { name: 'Alicia' })
console.log(changed) // 1

// Update by different column
users.update('alice@example.com', { active: 0 }, { key: 'email' })
```

**Notes:**

- `undefined` values are ignored (column not updated)
- `null` values set the column to NULL

**Throws:**

- `SqlConstraintError` — On constraint violation

---

## `TableHelper.delete()`

Deletes a row by primary key.

**Signature:**

```typescript
delete(id: unknown, options?: { key?: string }): number
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `unknown` | Yes | Primary key value |
| `options.key` | `string` | No | Override the lookup column |

**Returns:** `number` — Number of rows deleted (0 or 1)

**Example:**

```typescript
const deleted = users.delete(1)
console.log(deleted) // 1

// Delete by different column
users.delete('alice@example.com', { key: 'email' })
```

**Throws:**

- `SqlConstraintError` — If foreign key prevents deletion

---

## `TableHelper.count()`

Counts rows, optionally with conditions.

**Signature:**

```typescript
count(conditions?: Partial<T>): number
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `conditions` | `Partial<T>` | No | Column-value pairs to match |

**Returns:** `number` — Count of matching rows

**Example:**

```typescript
const total = users.count()
const admins = users.count({ role: 'admin' })
const activeAdmins = users.count({ role: 'admin', active: 1 })
```

---

## `TableHelper.all()`

Returns all rows in the table.

**Signature:**

```typescript
all(): T[]
```

**Returns:** `T[]` — Array of all rows

**Example:**

```typescript
const allUsers = users.all()
console.log(allUsers.length)
```

**Notes:**

- No guaranteed order (use raw SQL with ORDER BY if needed)
- Equivalent to `where({})`

---

## Types

### `TableOptions`

```typescript
interface TableOptions {
  primaryKey?: string
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `primaryKey` | `string` | No | Primary key column name. Default: `'id'` |

### `TableHelper<T>`

```typescript
interface TableHelper<T extends Record<string, unknown>> {
  insert(data: Partial<T>): number
  find(id: unknown, options?: { key?: string }): T | undefined
  where(conditions: Partial<T>): T[]
  update(id: unknown, data: Partial<T>, options?: { key?: string }): number
  delete(id: unknown, options?: { key?: string }): number
  count(conditions?: Partial<T>): number
  all(): T[]
}
```
