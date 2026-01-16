# Working with Transactions

Transactions ensure that multiple database operations succeed or fail together. Use them whenever you have related changes that shouldn't be partially applied.

## Prerequisites

Before starting, you should:

- [Create a database](Your-First-Database)
- [Understand query methods](Concept-Query-Methods)

## Overview

We'll cover transaction usage by:

1. Understanding when transactions are needed
2. Writing basic transactions
3. Handling errors properly
4. Using nested transactions for partial rollback

## Step 1: Recognize When You Need Transactions

Use a transaction when operations are logically connected. If one fails, the others shouldn't persist.

**Examples requiring transactions:**
- Transferring money between accounts (debit and credit must both succeed)
- Creating an order with line items (order header and details together)
- Updating a record and logging the change (both or neither)

**Examples NOT requiring transactions:**
- Inserting a single row
- Reading data
- Independent operations that can succeed or fail separately

## Step 2: Write a Basic Transaction

Wrap your operations in `db.transaction()`:

```typescript
import { createDatabase } from '@motioneffector/sql'

const db = await createDatabase()

db.exec(`
  CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance REAL);
  INSERT INTO accounts VALUES (1, 1000), (2, 500);
`)

// Transfer $100 from account 1 to account 2
await db.transaction(() => {
  db.run('UPDATE accounts SET balance = balance - 100 WHERE id = 1')
  db.run('UPDATE accounts SET balance = balance + 100 WHERE id = 2')
})

// Both accounts updated atomically
```

The callback runs inside BEGIN/COMMIT. If any statement fails, everything rolls back.

## Step 3: Handle Errors Properly

When a transaction fails, the error is re-thrown after rollback:

```typescript
try {
  await db.transaction(() => {
    db.run('UPDATE accounts SET balance = balance - 100 WHERE id = 1')

    // Simulate a failure
    const target = db.get('SELECT * FROM accounts WHERE id = 999')
    if (!target) {
      throw new Error('Target account not found')
    }

    db.run('UPDATE accounts SET balance = balance + 100 WHERE id = 999')
  })
} catch (error) {
  console.error('Transfer failed:', error.message)
  // The first UPDATE was rolled back
}

// Account 1 still has original balance
```

## Step 4: Use Nested Transactions for Partial Rollback

Nested `transaction()` calls create savepoints. Inner failures can be caught without aborting the outer transaction:

```typescript
await db.transaction(async () => {
  // This will persist
  db.run('INSERT INTO logs (message) VALUES (?)', ['Starting batch import'])

  // Try multiple imports, continue on individual failures
  for (const item of items) {
    try {
      await db.transaction(() => {
        db.run('INSERT INTO products (name, price) VALUES (?, ?)', [item.name, item.price])

        if (item.price < 0) {
          throw new Error('Invalid price')
        }
      })
    } catch (error) {
      // This item failed, but we continue with others
      db.run('INSERT INTO logs (message) VALUES (?)', [`Failed: ${item.name}`])
    }
  }

  db.run('INSERT INTO logs (message) VALUES (?)', ['Batch complete'])
})
```

## Complete Example

A realistic order creation with proper error handling:

```typescript
import { createDatabase, SqlConstraintError } from '@motioneffector/sql'

interface OrderItem {
  productId: number
  quantity: number
  price: number
}

async function createOrder(db: Database, userId: number, items: OrderItem[]) {
  return db.transaction(() => {
    // Create order header
    const orderResult = db.run(
      'INSERT INTO orders (user_id, status, created_at) VALUES (?, ?, ?)',
      [userId, 'pending', new Date().toISOString()]
    )
    const orderId = orderResult.lastInsertRowId

    // Create line items
    let total = 0
    for (const item of items) {
      db.run(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, item.productId, item.quantity, item.price]
      )
      total += item.quantity * item.price
    }

    // Update order total
    db.run('UPDATE orders SET total = ? WHERE id = ?', [total, orderId])

    // Deduct from user balance
    const result = db.run(
      'UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?',
      [total, userId, total]
    )

    if (result.changes === 0) {
      throw new Error('Insufficient balance')
    }

    return orderId
  })
}

// Usage
try {
  const orderId = await createOrder(db, 1, [
    { productId: 101, quantity: 2, price: 29.99 },
    { productId: 102, quantity: 1, price: 49.99 }
  ])
  console.log(`Order ${orderId} created successfully`)
} catch (error) {
  console.error('Order failed:', error.message)
}
```

## Variations

### Async Operations Inside Transactions

Await async work inside the callback:

```typescript
await db.transaction(async () => {
  db.run('INSERT INTO orders (status) VALUES (?)', ['processing'])

  // Call external service
  const confirmation = await paymentService.charge(amount)

  db.run('UPDATE orders SET confirmation = ? WHERE id = last_insert_rowid()', [confirmation])
})
```

### Returning Values from Transactions

The transaction returns whatever your callback returns:

```typescript
const newId = await db.transaction(() => {
  db.run('INSERT INTO items (name) VALUES (?)', ['Widget'])
  return db.get<{ id: number }>('SELECT last_insert_rowid() as id')?.id
})

console.log(`Created item ${newId}`)
```

### Checking Transaction State

Query `db.inTransaction` to know if you're inside a transaction:

```typescript
function insertAuditLog(db: Database, message: string) {
  if (!db.inTransaction) {
    console.warn('Audit log should be called within a transaction')
  }
  db.run('INSERT INTO audit_log (message, timestamp) VALUES (?, ?)', [
    message,
    new Date().toISOString()
  ])
}
```

## Troubleshooting

### Transaction Appears to Do Nothing

**Symptom:** Data isn't persisted after transaction completes.

**Cause:** The transaction callback threw an error that wasn't caught.

**Solution:** Check for unhandled promise rejections. Wrap in try/catch to see errors.

### Nested Transaction Rolls Back Everything

**Symptom:** Inner transaction failure rolls back outer transaction too.

**Cause:** The error from the inner transaction isn't being caught.

**Solution:** Wrap the inner `db.transaction()` call in try/catch.

### Deadlock or Hang

**Symptom:** Transaction never completes.

**Cause:** Awaiting something that itself tries to start a transaction.

**Solution:** Concurrent transactions are queued. Ensure you're not creating circular waits.

## See Also

- **[Transactions Concept](Concept-Transactions)** - How transactions work internally
- **[Transactions API](API-Transactions)** - Method signatures
- **[Error Classes](API-Error-Classes)** - Error types for catch blocks
