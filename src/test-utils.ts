/**
 * Test utilities and helpers for @motioneffector/sql tests
 */

import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import type { Database } from './types'

let SQL: Awaited<ReturnType<typeof initSqlJs>> | undefined

/**
 * Get initialized SQL.js instance (cached)
 */
export async function getSQL(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (!SQL) {
    SQL = await initSqlJs()
  }
  return SQL
}

/**
 * Create a test SQLite database using SQL.js directly
 */
export async function createTestSqlJsDb(): Promise<SqlJsDatabase> {
  const sql = await getSQL()
  return new sql.Database()
}

/**
 * Seed users table with test data
 */
export function seedUsers(db: Database, count: number): void {
  for (let i = 1; i <= count; i++) {
    db.run('INSERT INTO users (name, email, age) VALUES (?, ?, ?)', [
      `User${i}`,
      `user${i}@example.com`,
      20 + (i % 50),
    ])
  }
}

/**
 * Assert table exists in database
 */
export function assertTableExists(db: Database, tableName: string): void {
  const tables = db.getTables()
  if (!tables.includes(tableName)) {
    throw new Error(`Expected table '${tableName}' to exist, but it doesn't`)
  }
}

/**
 * Assert row count matches expected
 */
export function assertRowCount(db: Database, tableName: string, expected: number): void {
  const result = db.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`)
  const actual = result?.count ?? 0
  if (actual !== expected) {
    throw new Error(
      `Expected table '${tableName}' to have ${expected} rows, but found ${actual}`
    )
  }
}

/**
 * Common test schema for users table
 */
export const USERS_SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    age INTEGER,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`

/**
 * Common test schema for posts table
 */
export const POSTS_SCHEMA = `
  CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    body TEXT,
    published INTEGER DEFAULT 0
  )
`
