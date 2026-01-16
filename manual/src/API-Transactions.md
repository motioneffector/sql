# Transactions API

Methods for transaction management.

---

## `transaction()`

Executes a function within a database transaction.

**Signature:**

```typescript
transaction<T>(fn: () => T | Promise<T>): Promise<T>
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `fn` | `() => T \| Promise<T>` | Yes | Function to execute within transaction |

**Returns:** `Promise<T>` — The return value of the callback function

**Example:**

```typescript
// Sync callback
await db.transaction(() => {
  db.run('INSERT INTO orders (user_id) VALUES (?)', [1])
  db.run('UPDATE inventory SET quantity = quantity - 1 WHERE id = ?', [42])
})

// Async callback
const orderId = await db.transaction(async () => {
  const result = db.run('INSERT INTO orders (user_id) VALUES (?)', [1])
  await notifyUser(1)
  return result.lastInsertRowId
})

// With error handling
try {
  await db.transaction(() => {
    db.run('INSERT INTO users (email) VALUES (?)', ['taken@example.com'])
  })
} catch (error) {
  // Transaction was rolled back
  console.error('Failed:', error.message)
}
```

**Behavior:**

- Wraps the callback in BEGIN/COMMIT
- Rolls back and re-throws on any error
- Nested calls use savepoints (inner failure doesn't abort outer if caught)
- Concurrent calls are queued and processed serially

**Throws:**

- Re-throws any error from the callback after rolling back

---

## `inTransaction`

Read-only property indicating if currently inside a transaction.

**Signature:**

```typescript
readonly inTransaction: boolean
```

**Returns:** `boolean` — `true` if inside a transaction callback, `false` otherwise

**Example:**

```typescript
console.log(db.inTransaction) // false

await db.transaction(() => {
  console.log(db.inTransaction) // true

  db.transaction(() => {
    console.log(db.inTransaction) // true (nested)
  })
})

console.log(db.inTransaction) // false
```

**Notes:**

- This is a read-only property; assigning to it throws an error
- Returns `true` even in nested transactions (savepoints)
- Returns `false` after transaction completes or rolls back
