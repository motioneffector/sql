import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createDatabase } from './index'
import type { Database, StorageAdapter } from './types'

describe('IndexedDB Persistence', () => {
  let mockStorage: StorageAdapter

  beforeEach(() => {
    mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('persist: { storage: "indexeddb", key: "mydb" } enables IndexedDB storage', async () => {
    const db = await createDatabase({
      persist: { key: 'mydb', storage: mockStorage },
    })

    db.exec('CREATE TABLE test (id INTEGER)')
    db.run('INSERT INTO test VALUES (1)')

    // Wait for auto-save
    await new Promise(resolve => setTimeout(resolve, 1100))

    expect(mockStorage.setItem).toHaveBeenCalledWith('mydb', expect.any(Uint8Array))

    db.close()
  })

  it('key becomes object store key', async () => {
    const db = await createDatabase({
      persist: { key: 'custom-key', storage: mockStorage },
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    await new Promise(resolve => setTimeout(resolve, 1100))

    expect(mockStorage.setItem).toHaveBeenCalledWith('custom-key', expect.any(Uint8Array))

    db.close()
  })

  it('saves database as Uint8Array blob', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    await new Promise(resolve => setTimeout(resolve, 1100))

    expect(mockStorage.setItem).toHaveBeenCalledWith(expect.any(String), expect.any(Uint8Array))

    db.close()
  })

  it('auto-saves after mutation (run, exec, transaction, import) when autoSave true', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
      autoSave: true,
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    await new Promise(resolve => setTimeout(resolve, 1100))

    expect(mockStorage.setItem).toHaveBeenCalled()

    db.close()
  })

  it('auto-save is debounced (default 1000ms)', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
      autoSave: true,
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    // Should not save immediately
    expect(mockStorage.setItem).not.toHaveBeenCalled()

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 1100))

    expect(mockStorage.setItem).toHaveBeenCalled()

    db.close()
  })

  it('consecutive rapid mutations result in single save', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
      autoSave: true,
      autoSaveDebounce: 500,
    })

    db.exec('CREATE TABLE test (id INTEGER)')
    db.run('INSERT INTO test VALUES (1)')
    db.run('INSERT INTO test VALUES (2)')
    db.run('INSERT INTO test VALUES (3)')

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 600))

    // Should only save once despite multiple mutations
    expect(mockStorage.setItem).toHaveBeenCalledTimes(1)

    db.close()
  })

  it('restores from storage on createDatabase if key exists', async () => {
    // Create and save a database
    const db1 = await createDatabase()
    db1.exec('CREATE TABLE users (name TEXT)')
    db1.run('INSERT INTO users VALUES (?)', ['Alice'])
    const savedData = db1.export()
    db1.close()

    // Mock storage to return the saved data
    mockStorage.getItem = vi.fn().mockResolvedValue(savedData)

    // Create new database with same key - should restore
    const db2 = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
    })

    expect(mockStorage.getItem).toHaveBeenCalledWith('test')

    const user = db2.get<{ name: string }>('SELECT * FROM users')
    expect(user?.name).toBe('Alice')

    db2.close()
  })

  it('multiple databases with different keys work independently', async () => {
    const storage1Calls: string[] = []
    const storage2Calls: string[] = []

    const mockStorage1: StorageAdapter = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn((key) => {
        storage1Calls.push(key)
        return Promise.resolve()
      }),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    const mockStorage2: StorageAdapter = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn((key) => {
        storage2Calls.push(key)
        return Promise.resolve()
      }),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }

    const db1 = await createDatabase({
      persist: { key: 'db1', storage: mockStorage1 },
      autoSave: true,
      autoSaveDebounce: 100,
    })

    const db2 = await createDatabase({
      persist: { key: 'db2', storage: mockStorage2 },
      autoSave: true,
      autoSaveDebounce: 100,
    })

    db1.exec('CREATE TABLE test1 (id INTEGER)')
    db2.exec('CREATE TABLE test2 (id INTEGER)')

    await new Promise(resolve => setTimeout(resolve, 200))

    expect(storage1Calls).toContain('db1')
    expect(storage2Calls).toContain('db2')

    db1.close()
    db2.close()
  })
})

describe('db.save()', () => {
  let mockStorage: StorageAdapter

  beforeEach(() => {
    mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('manually triggers save to persistent storage', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
      autoSave: false,
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    await db.save()

    expect(mockStorage.setItem).toHaveBeenCalled()

    db.close()
  })

  it('returns Promise<void>', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
    })

    const result = await db.save()

    expect(result).toBeUndefined()

    db.close()
  })

  it('no-op if persistence not configured (resolves immediately)', async () => {
    const db = await createDatabase()

    await expect(db.save()).resolves.toBeUndefined()

    db.close()
  })

  it('saves current database state immediately (ignores debounce)', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
      autoSave: true,
      autoSaveDebounce: 5000,
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    // Manual save should happen immediately, not wait for 5 second debounce
    await db.save()

    expect(mockStorage.setItem).toHaveBeenCalled()

    db.close()
  })

  it('can be called during debounce window to force immediate save', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
      autoSave: true,
      autoSaveDebounce: 2000,
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    // Don't wait for debounce, force save now
    await db.save()

    expect(mockStorage.setItem).toHaveBeenCalled()

    db.close()
  })
})

describe('db.load()', () => {
  let mockStorage: StorageAdapter

  beforeEach(() => {
    mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('manually loads from persistent storage', async () => {
    // Create source database
    const source = await createDatabase()
    source.exec('CREATE TABLE users (name TEXT)')
    source.run('INSERT INTO users VALUES (?)', ['Alice'])
    const savedData = source.export()
    source.close()

    // Mock storage to return saved data
    mockStorage.getItem = vi.fn().mockResolvedValue(savedData)

    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
    })

    // Make some changes
    db.run('INSERT INTO users VALUES (?)', ['Bob'])

    // Load should discard changes and restore from storage
    await db.load()

    const users = db.all<{ name: string }>('SELECT * FROM users')
    expect(users).toHaveLength(1)
    expect(users[0]?.name).toBe('Alice')

    db.close()
  })

  it('replaces current database contents with stored version', async () => {
    const source = await createDatabase()
    source.exec('CREATE TABLE test (value TEXT)')
    source.run('INSERT INTO test VALUES (?)', ['stored'])
    const savedData = source.export()
    source.close()

    mockStorage.getItem = vi.fn().mockResolvedValue(savedData)

    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
    })

    db.exec('CREATE TABLE other (id INTEGER)')

    await db.load()

    expect(db.getTables()).toContain('test')
    expect(db.getTables()).not.toContain('other')

    db.close()
  })

  it('returns Promise<void>', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
    })

    const result = await db.load()

    expect(result).toBeUndefined()

    db.close()
  })

  it('no-op if persistence not configured (resolves immediately)', async () => {
    const db = await createDatabase()

    await expect(db.load()).resolves.toBeUndefined()

    db.close()
  })

  it('no-op if nothing saved yet (database unchanged)', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    // Load when nothing is saved should not change database
    await db.load()

    expect(db.getTables()).toContain('test')

    db.close()
  })

  it('useful for discarding in-memory changes', async () => {
    const source = await createDatabase()
    source.exec('CREATE TABLE users (name TEXT)')
    source.run('INSERT INTO users VALUES (?)', ['Original'])
    const savedData = source.export()
    source.close()

    mockStorage.getItem = vi.fn().mockResolvedValue(savedData)

    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
    })

    // Make unwanted changes
    db.run('INSERT INTO users VALUES (?)', ['Mistake'])

    // Discard by loading
    await db.load()

    const users = db.all<{ name: string }>('SELECT * FROM users')
    expect(users).toHaveLength(1)
    expect(users[0]?.name).toBe('Original')

    db.close()
  })
})

describe('Auto-save Configuration', () => {
  let mockStorage: StorageAdapter

  beforeEach(() => {
    mockStorage = {
      getItem: vi.fn().mockResolvedValue(null),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('autoSave defaults to true when persist option is set', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    await new Promise(resolve => setTimeout(resolve, 1100))

    expect(mockStorage.setItem).toHaveBeenCalled()

    db.close()
  })

  it('autoSave defaults to false when persist option is not set', async () => {
    const db = await createDatabase()

    db.exec('CREATE TABLE test (id INTEGER)')

    await new Promise(resolve => setTimeout(resolve, 100))

    // No persistence configured, so no storage calls

    db.close()
  })

  it('autoSave: false disables automatic saves (manual save() required)', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
      autoSave: false,
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    await new Promise(resolve => setTimeout(resolve, 1100))

    // Should not have auto-saved
    expect(mockStorage.setItem).not.toHaveBeenCalled()

    // But manual save should work
    await db.save()
    expect(mockStorage.setItem).toHaveBeenCalled()

    db.close()
  })

  it('autoSaveDebounce defaults to 1000 milliseconds', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    // Should not save before 1000ms
    await new Promise(resolve => setTimeout(resolve, 500))
    expect(mockStorage.setItem).not.toHaveBeenCalled()

    // Should save after 1000ms
    await new Promise(resolve => setTimeout(resolve, 600))
    expect(mockStorage.setItem).toHaveBeenCalled()

    db.close()
  })

  it('autoSaveDebounce: 0 saves immediately (no debounce)', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
      autoSaveDebounce: 0,
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    // Should save almost immediately
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockStorage.setItem).toHaveBeenCalled()

    db.close()
  })

  it('autoSaveDebounce: 5000 waits 5 seconds after last mutation', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
      autoSaveDebounce: 5000,
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    // Should not save quickly
    await new Promise(resolve => setTimeout(resolve, 1000))
    expect(mockStorage.setItem).not.toHaveBeenCalled()

    db.close()
  })

  it('debounce timer resets on each mutation', async () => {
    const db = await createDatabase({
      persist: { key: 'test', storage: mockStorage },
      autoSaveDebounce: 500,
    })

    db.exec('CREATE TABLE test (id INTEGER)')

    // Make mutations to keep resetting the timer
    await new Promise(resolve => setTimeout(resolve, 300))
    db.run('INSERT INTO test VALUES (1)')

    await new Promise(resolve => setTimeout(resolve, 300))
    db.run('INSERT INTO test VALUES (2)')

    // Timer should have been reset, so no save yet
    expect(mockStorage.setItem).not.toHaveBeenCalled()

    // Wait for final debounce
    await new Promise(resolve => setTimeout(resolve, 600))
    expect(mockStorage.setItem).toHaveBeenCalled()

    db.close()
  })
})
