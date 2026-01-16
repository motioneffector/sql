# Prepared Statements API

Methods for reusable compiled queries.

---

## `prepare()`

Creates a prepared statement for repeated execution.

**Signature:**

```typescript
prepare<T>(sql: string): PreparedStatement<T>
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sql` | `string` | Yes | SQL statement to prepare |

**Returns:** `PreparedStatement<T>` — Reusable statement object

**Example:**

```typescript
const stmt = db.prepare<{ id: number; name: string }>(
  'SELECT * FROM users WHERE age > ?'
)

const young = stmt.all([18])
const old = stmt.all([65])

stmt.finalize()
```

**Throws:**

- `SqlSyntaxError` — If SQL is invalid

---

## `PreparedStatement.run()`

Executes the statement for mutations.

**Signature:**

```typescript
run(params?: ParamArray | ParamObject): RunResult
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `params` | `ParamArray \| ParamObject` | No | Parameters to bind |

**Returns:** `RunResult` — Object with `changes` and `lastInsertRowId`

**Example:**

```typescript
const stmt = db.prepare('INSERT INTO users (name) VALUES (?)')

const result1 = stmt.run(['Alice'])
const result2 = stmt.run(['Bob'])

console.log(result1.lastInsertRowId) // 1
console.log(result2.lastInsertRowId) // 2

stmt.finalize()
```

**Throws:**

- `Error` — If statement has been finalized

---

## `PreparedStatement.get()`

Executes the statement and returns the first row.

**Signature:**

```typescript
get(params?: ParamArray | ParamObject): T | undefined
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `params` | `ParamArray \| ParamObject` | No | Parameters to bind |

**Returns:** `T | undefined` — First row or undefined

**Example:**

```typescript
const stmt = db.prepare<{ id: number; name: string }>(
  'SELECT * FROM users WHERE id = ?'
)

const user1 = stmt.get([1])
const user2 = stmt.get([2])

stmt.finalize()
```

**Throws:**

- `Error` — If statement has been finalized

---

## `PreparedStatement.all()`

Executes the statement and returns all rows.

**Signature:**

```typescript
all(params?: ParamArray | ParamObject): T[]
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `params` | `ParamArray \| ParamObject` | No | Parameters to bind |

**Returns:** `T[]` — Array of matching rows

**Example:**

```typescript
const stmt = db.prepare<{ name: string }>(
  'SELECT name FROM users WHERE role = ?'
)

const admins = stmt.all(['admin'])
const users = stmt.all(['user'])

stmt.finalize()
```

**Throws:**

- `Error` — If statement has been finalized

---

## `PreparedStatement.finalize()`

Releases statement resources.

**Signature:**

```typescript
finalize(): void
```

**Returns:** `void`

**Example:**

```typescript
const stmt = db.prepare('SELECT * FROM users')

try {
  // Use statement...
} finally {
  stmt.finalize()
}

// After finalize, methods throw
stmt.all() // Error: Statement has been finalized
```

**Notes:**

- Safe to call multiple times
- Always call when done to prevent memory leaks
- Use try/finally to ensure cleanup

---

## Types

### `PreparedStatement<T>`

```typescript
interface PreparedStatement<T> {
  run(params?: ParamArray | ParamObject): RunResult
  get(params?: ParamArray | ParamObject): T | undefined
  all(params?: ParamArray | ParamObject): T[]
  finalize(): void
}
```
