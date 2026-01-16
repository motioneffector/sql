# Query Methods API

Methods for executing SQL queries and statements.

---

## `exec()`

Executes one or more SQL statements without parameters or return values.

**Signature:**

```typescript
exec(sql: string): void
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sql` | `string` | Yes | SQL statement(s) to execute |

**Returns:** `void`

**Example:**

```typescript
// Create table
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')

// Multiple statements
db.exec(`
  CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT);
  CREATE TABLE comments (id INTEGER PRIMARY KEY, post_id INTEGER);
  CREATE INDEX idx_comments_post ON comments(post_id);
`)
```

**Throws:**

- `SqlSyntaxError` — If SQL is invalid
- `SqlNotFoundError` — If referenced table/column doesn't exist
- `SqlConstraintError` — If constraint is violated

---

## `run()`

Executes a single SQL statement with parameters, returning change information.

**Signature:**

```typescript
run(sql: string | SqlTemplate, params?: ParamArray | ParamObject): RunResult
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sql` | `string \| SqlTemplate` | Yes | SQL statement to execute |
| `params` | `ParamArray \| ParamObject` | No | Parameters to bind |

**Returns:** `RunResult` — Object with `changes` and `lastInsertRowId`

**Example:**

```typescript
// Positional parameters
const result = db.run(
  'INSERT INTO users (name, email) VALUES (?, ?)',
  ['Alice', 'alice@example.com']
)
console.log(result.lastInsertRowId) // 1
console.log(result.changes)         // 1

// Named parameters
db.run(
  'UPDATE users SET email = :email WHERE id = :id',
  { email: 'new@example.com', id: 1 }
)

// Template literal
const name = 'Bob'
db.run(db.sql`INSERT INTO users (name) VALUES (${name})`)
```

**Throws:**

- `SqlSyntaxError` — If SQL is invalid
- `SqlError` — If parameter count doesn't match placeholders
- `SqlConstraintError` — If constraint is violated

---

## `get()`

Executes a query and returns the first row.

**Signature:**

```typescript
get<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string | SqlTemplate,
  params?: ParamArray | ParamObject
): T | undefined
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sql` | `string \| SqlTemplate` | Yes | SQL query |
| `params` | `ParamArray \| ParamObject` | No | Parameters to bind |

**Returns:** `T | undefined` — First row as typed object, or undefined if no match

**Example:**

```typescript
interface User {
  id: number
  name: string
  email: string
}

const user = db.get<User>('SELECT * FROM users WHERE id = ?', [1])
if (user) {
  console.log(user.name) // TypeScript knows this is string
}
```

**Throws:**

- `SqlSyntaxError` — If SQL is invalid
- `SqlError` — If parameter count doesn't match placeholders

---

## `all()`

Executes a query and returns all matching rows.

**Signature:**

```typescript
all<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string | SqlTemplate,
  params?: ParamArray | ParamObject
): T[]
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `sql` | `string \| SqlTemplate` | Yes | SQL query |
| `params` | `ParamArray \| ParamObject` | No | Parameters to bind |

**Returns:** `T[]` — Array of row objects (empty array if no matches)

**Example:**

```typescript
interface User {
  id: number
  name: string
}

const users = db.all<User>('SELECT * FROM users WHERE name LIKE ?', ['A%'])
console.log(users.length)
users.forEach(u => console.log(u.name))
```

**Throws:**

- `SqlSyntaxError` — If SQL is invalid
- `SqlError` — If parameter count doesn't match placeholders

---

## `sql`

Tagged template literal for safe query building.

**Signature:**

```typescript
sql(strings: TemplateStringsArray, ...values: unknown[]): SqlTemplate
```

**Returns:** `SqlTemplate` — Object with `sql` string and `params` array

**Example:**

```typescript
const name = 'Alice'
const minAge = 18

// Values become ? placeholders automatically
const template = db.sql`
  SELECT * FROM users
  WHERE name = ${name}
  AND age >= ${minAge}
`

// Use with any query method
const users = db.all(template)
const user = db.get(template)
db.run(db.sql`UPDATE users SET active = ${true} WHERE id = ${1}`)
```

---

## Types

### `RunResult`

```typescript
interface RunResult {
  changes: number
  lastInsertRowId: number
}
```

| Property | Type | Description |
|----------|------|-------------|
| `changes` | `number` | Number of rows affected |
| `lastInsertRowId` | `number` | ID of last inserted row (for INSERT operations) |

### `ParamArray`

```typescript
type ParamArray = unknown[]
```

Positional parameters bound to `?` placeholders in order.

### `ParamObject`

```typescript
type ParamObject = Record<string, unknown>
```

Named parameters bound to `:name`, `$name`, or `@name` placeholders.

### `SqlTemplate`

```typescript
interface SqlTemplate {
  sql: string
  params: unknown[]
}
```

Result of the `db.sql` tagged template literal.
