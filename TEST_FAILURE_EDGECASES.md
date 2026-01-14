# Pre-existing Test Failure: edgeCases.test.ts

## Issue Summary

**Test**: `src/edgeCases.test.ts:251` - "Large Data > handles table with 100,000 rows"

**Status**: ❌ FAILING (pre-existing, not related to fuzz tests)

**Failure**: Expected 100,000 rows inserted, got 0

**Root Cause**: Race condition - async `db.transaction()` not awaited

---

## The Bug

### Location
```
File: src/edgeCases.test.ts
Lines: 251-262
```

### Buggy Code
```typescript
it('handles table with 100,000 rows', () => {  // ❌ Missing async
  db.exec('CREATE TABLE large (id INTEGER, value INTEGER)')

  db.transaction(() => {  // ❌ Not awaited - returns Promise<void>
    for (let i = 0; i < 100000; i++) {
      db.run('INSERT INTO large VALUES (?, ?)', [i, i * 2])
    }
  })

  // ❌ This runs BEFORE the transaction completes!
  const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM large')
  expect(count?.count).toBe(100000)
}, 30000)
```

### What's Happening

1. **`db.transaction()` returns `Promise<T>`** (see src/types.ts:22)
2. The test function is **not** marked as `async`
3. The transaction call is **not** awaited
4. The `COUNT(*)` query runs **immediately** (before inserts complete)
5. **Result**: 0 rows counted because transaction hasn't finished yet

This is a **fire-and-forget** bug where an async operation starts but execution continues without waiting for it.

---

## The Fix

### Solution: Add `async/await`

**Two simple changes:**

1. Mark test function as `async`
2. `await` the transaction call

### Fixed Code
```typescript
it('handles table with 100,000 rows', async () => {  // ✅ Added async
  db.exec('CREATE TABLE large (id INTEGER, value INTEGER)')

  await db.transaction(() => {  // ✅ Added await
    for (let i = 0; i < 100000; i++) {
      db.run('INSERT INTO large VALUES (?, ?)', [i, i * 2])
    }
  })

  const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM large')
  expect(count?.count).toBe(100000)
}, 30000)
```

---

## Verification Steps

### 1. Apply the fix

Edit `src/edgeCases.test.ts` lines 251 and 254:
- Line 251: Change `() => {` to `async () => {`
- Line 254: Change `db.transaction(() => {` to `await db.transaction(() => {`

### 2. Test the specific file

```bash
npm run test:run src/edgeCases.test.ts
```

**Expected**: Test "handles table with 100,000 rows" should now pass ✅

### 3. Run full test suite

```bash
npm run test:run
```

**Expected**:
- 550 tests pass (was 549)
- 0 tests fail (was 1)

---

## Context & Analysis

### Why This Pattern Is Wrong

The `db.transaction()` signature (from src/types.ts:22):
```typescript
transaction<T>(fn: () => T | Promise<T>): Promise<T>
```

It **always** returns a Promise, regardless of whether the callback is sync or async.

### Comparison with Correct Usage

The same file has a correct example at line 340:

```typescript
// Line 340 - CORRECT ✅
it('multiple transaction() calls serialize correctly', async () => {  // ✅ async
  await db.transaction(() => {  // ✅ awaited
    db.run('INSERT INTO test VALUES (1)')
  })

  await db.transaction(() => {
    db.run('INSERT INTO test VALUES (2)')
  })

  const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM test')
  expect(count?.count).toBe(2)
})
```

### Why It Wasn't Caught Earlier

This bug likely survived because:

1. **Timing-dependent**: May pass on very fast machines where transaction completes quickly
2. **Flaky**: Could pass intermittently depending on system load
3. **Recent change**: Transaction queue system was added recently (commit 1e0948f), possibly changing timing characteristics
4. **Large dataset**: 100,000 rows takes longer to insert, making the race condition more apparent

### Related Code

The transaction implementation uses a queue system:
- `src/database.ts:1065` - Shows error "Database closed with pending transactions"
- `src/transactionQueue.test.ts` - Has 35 tests that correctly use async/await

---

## Impact Assessment

**Risk**: Very low - isolated bug fix

**Scope**:
- Single file: `src/edgeCases.test.ts`
- Single function: Lines 251-262
- Two-line change

**Side Effects**: None - only fixes race condition

**Performance**: Negligible (30s timeout already in place)

**Breaking Changes**: None

---

## Additional Issues (Unhandled Rejections)

While fixing this, note there are 3 unhandled promise rejections in the test suite (not causing test failures but logged as warnings):

1. **src/transactionQueue.test.ts:431** - "Database closed with pending transactions"
2. **src/persistence.test.ts:176** - QuotaExceededError mock
3. **src/persistence.test.ts:640** - QuotaExceededError mock (localStorage)

These are likely intentional test scenarios that need proper error handling/expectation setup, but they're separate from this fix.

---

## Quick Reference

**File**: `src/edgeCases.test.ts`
**Line**: 251
**Change 1**: Add `async` to test function
**Change 2**: Add `await` before `db.transaction()`
**Test Command**: `npm run test:run src/edgeCases.test.ts`

---

## History

- **Discovered**: 2026-01-13 during fuzz test implementation
- **Status**: Documented but not fixed
- **Impact**: 1 failing test out of 550 total tests
- **Related Work**: Fuzz testing suite (54 tests) added in same branch, all passing
