// Import library to ensure it is available (also set by demo.js)
import * as Library from '../dist/index.js'
if (!window.Library) window.Library = Library

// ============================================
// DEMO INTEGRITY TESTS
// These tests verify the demo itself is correctly structured.
// They are IDENTICAL across all @motioneffector demos.
// Do not modify, skip, or weaken these tests.
// ============================================

function registerIntegrityTests() {
  // ─────────────────────────────────────────────
  // STRUCTURAL INTEGRITY
  // ─────────────────────────────────────────────

  testRunner.registerTest('[Integrity] Library is loaded', () => {
    if (typeof window.Library === 'undefined') {
      throw new Error('window.Library is undefined - library not loaded')
    }
  })

  testRunner.registerTest('[Integrity] Library has exports', () => {
    const exports = Object.keys(window.Library)
    if (exports.length === 0) {
      throw new Error('window.Library has no exports')
    }
  })

  testRunner.registerTest('[Integrity] Test runner exists', () => {
    const runner = document.getElementById('test-runner')
    if (!runner) {
      throw new Error('No element with id="test-runner"')
    }
  })

  testRunner.registerTest('[Integrity] Test runner is first section after header', () => {
    const main = document.querySelector('main')
    if (!main) {
      throw new Error('No <main> element found')
    }
    const firstSection = main.querySelector('section')
    if (!firstSection || firstSection.id !== 'test-runner') {
      throw new Error('Test runner must be the first <section> inside <main>')
    }
  })

  testRunner.registerTest('[Integrity] Run All Tests button exists with correct format', () => {
    const btn = document.getElementById('run-all-tests')
    if (!btn) {
      throw new Error('No button with id="run-all-tests"')
    }
    const text = btn.textContent.trim()
    if (!text.includes('Run All Tests')) {
      throw new Error(`Button text must include "Run All Tests", got: "${text}"`)
    }
    const icon = btn.querySelector('.btn-icon')
    if (!icon || !icon.textContent.includes('▶')) {
      throw new Error('Button must have play icon (▶) in .btn-icon element')
    }
  })

  testRunner.registerTest('[Integrity] At least one exhibit exists', () => {
    const exhibits = document.querySelectorAll('.exhibit')
    if (exhibits.length === 0) {
      throw new Error('No elements with class="exhibit"')
    }
  })

  testRunner.registerTest('[Integrity] All exhibits have unique IDs', () => {
    const exhibits = document.querySelectorAll('.exhibit')
    const ids = new Set()
    exhibits.forEach(ex => {
      if (!ex.id) {
        throw new Error('Exhibit missing id attribute')
      }
      if (ids.has(ex.id)) {
        throw new Error(`Duplicate exhibit id: ${ex.id}`)
      }
      ids.add(ex.id)
    })
  })

  testRunner.registerTest('[Integrity] All exhibits registered for walkthrough', () => {
    const exhibitElements = document.querySelectorAll('.exhibit')
    const registeredCount = testRunner.exhibits.length
    // Subtract any non-exhibit registrations if needed
    if (registeredCount < exhibitElements.length) {
      throw new Error(
        `Only ${registeredCount} exhibits registered for walkthrough, ` +
        `but ${exhibitElements.length} .exhibit elements exist`
      )
    }
  })

  testRunner.registerTest('[Integrity] CSS loaded from demo-files/', () => {
    const links = document.querySelectorAll('link[rel="stylesheet"]')
    const hasExternal = Array.from(links).some(link =>
      link.href.includes('demo-files/')
    )
    if (!hasExternal) {
      throw new Error('No stylesheet loaded from demo-files/ directory')
    }
  })

  testRunner.registerTest('[Integrity] No inline style tags', () => {
    const styles = document.querySelectorAll('style')
    if (styles.length > 0) {
      throw new Error(`Found ${styles.length} inline <style> tags - extract to demo-files/demo.css`)
    }
  })

  testRunner.registerTest('[Integrity] No inline onclick handlers', () => {
    const withOnclick = document.querySelectorAll('[onclick]')
    if (withOnclick.length > 0) {
      throw new Error(`Found ${withOnclick.length} elements with onclick - use addEventListener`)
    }
  })

  // ─────────────────────────────────────────────
  // NO AUTO-PLAY VERIFICATION
  // ─────────────────────────────────────────────

  testRunner.registerTest('[Integrity] Output areas are empty on load', () => {
    const outputs = document.querySelectorAll('.exhibit-output, .output, [data-output]')
    outputs.forEach(output => {
      // Allow placeholder text but not actual content
      const hasPlaceholder = output.dataset.placeholder ||
        output.classList.contains('placeholder') ||
        output.querySelector('.placeholder')

      const text = output.textContent.trim()
      const children = output.children.length

      // If it has content that isn't a placeholder, that's a violation
      if ((text.length > 50 || children > 1) && !hasPlaceholder) {
        throw new Error(
          `Output area appears pre-populated: "${text.substring(0, 50)}..." - ` +
          `outputs must be empty until user interaction`
        )
      }
    })
  })

  testRunner.registerTest('[Integrity] No setTimeout calls on module load', () => {
    // This test verifies by checking a flag set during load
    // The test-runner.js must set window.__demoLoadComplete = true after load
    // Any setTimeout from module load would not have completed
    if (window.__suspiciousTimersDetected) {
      throw new Error(
        'Detected setTimeout/setInterval during page load - ' +
        'demos must not auto-run'
      )
    }
  })

  // ─────────────────────────────────────────────
  // REAL LIBRARY VERIFICATION
  // ─────────────────────────────────────────────

  testRunner.registerTest('[Integrity] Library functions are callable', () => {
    const lib = window.Library
    const exports = Object.keys(lib)

    // At least one export must be a function
    const hasFunctions = exports.some(key => typeof lib[key] === 'function')
    if (!hasFunctions) {
      throw new Error('Library exports no callable functions')
    }
  })

  testRunner.registerTest('[Integrity] No mock implementations detected', () => {
    // Check for common mock patterns in window
    const suspicious = [
      'mockParse', 'mockValidate', 'fakeParse', 'fakeValidate',
      'stubParse', 'stubValidate', 'testParse', 'testValidate'
    ]
    suspicious.forEach(name => {
      if (typeof window[name] === 'function') {
        throw new Error(`Detected mock function: window.${name} - use real library`)
      }
    })
  })

  // ─────────────────────────────────────────────
  // VISUAL FEEDBACK VERIFICATION
  // ─────────────────────────────────────────────

  testRunner.registerTest('[Integrity] CSS includes animation definitions', () => {
    const sheets = document.styleSheets
    let hasAnimations = false

    try {
      for (const sheet of sheets) {
        // Skip cross-origin stylesheets
        if (!sheet.href || sheet.href.includes('demo-files/')) {
          const rules = sheet.cssRules || sheet.rules
          for (const rule of rules) {
            if (rule.type === CSSRule.KEYFRAMES_RULE ||
                (rule.style && (
                  rule.style.animation ||
                  rule.style.transition ||
                  rule.style.animationName
                ))) {
              hasAnimations = true
              break
            }
          }
        }
        if (hasAnimations) break
      }
    } catch (e) {
      // CORS error - assume external sheet has animations
      hasAnimations = true
    }

    if (!hasAnimations) {
      throw new Error('No CSS animations or transitions found - visual feedback required')
    }
  })

  testRunner.registerTest('[Integrity] Interactive elements have hover states', () => {
    const buttons = document.querySelectorAll('button, .btn')
    if (buttons.length === 0) return // No buttons to check

    // Check that buttons aren't unstyled
    const btn = buttons[0]
    const styles = window.getComputedStyle(btn)
    if (styles.cursor !== 'pointer') {
      throw new Error('Buttons should have cursor: pointer')
    }
  })

  // ─────────────────────────────────────────────
  // WALKTHROUGH REGISTRATION VERIFICATION
  // ─────────────────────────────────────────────

  testRunner.registerTest('[Integrity] Walkthrough demonstrations are async functions', () => {
    testRunner.exhibits.forEach(exhibit => {
      if (typeof exhibit.demonstrate !== 'function') {
        throw new Error(`Exhibit "${exhibit.name}" has no demonstrate function`)
      }
      // Check if it's async by seeing if it returns a thenable
      const result = exhibit.demonstrate.toString()
      if (!result.includes('async') && !result.includes('Promise')) {
        console.warn(`Exhibit "${exhibit.name}" demonstrate() may not be async`)
      }
    })
  })

  testRunner.registerTest('[Integrity] Each exhibit has required elements', () => {
    const exhibits = document.querySelectorAll('.exhibit')
    exhibits.forEach(exhibit => {
      // Must have a title
      const title = exhibit.querySelector('.exhibit-title, h2, h3')
      if (!title) {
        throw new Error(`Exhibit ${exhibit.id} missing title element`)
      }

      // Must have an interactive area
      const interactive = exhibit.querySelector(
        '.exhibit-interactive, .exhibit-content, [data-interactive]'
      )
      if (!interactive) {
        throw new Error(`Exhibit ${exhibit.id} missing interactive area`)
      }
    })
  })
}

// Call this function at the start of tests.js, before library-specific tests
registerIntegrityTests()

// ============================================
// LIBRARY-SPECIFIC TESTS
// ============================================

testRunner.registerTest('createDatabase returns database instance', async () => {
  const db = await window.Library.createDatabase()
  if (!db) {
    throw new Error('createDatabase() should return a database instance')
  }
  if (typeof db.run !== 'function') {
    throw new Error('Database instance should have a run() method')
  }
  db.close()
})

testRunner.registerTest('Database can execute CREATE TABLE', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)')
  const tables = db.getTables()
  if (!tables.includes('test')) {
    throw new Error('Table "test" should exist after CREATE TABLE')
  }
  db.close()
})

testRunner.registerTest('Database can INSERT and SELECT data', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  db.run('INSERT INTO users (name) VALUES (?)', ['Alice'])
  const user = db.get('SELECT * FROM users WHERE name = ?', ['Alice'])
  if (!user || user.name !== 'Alice') {
    throw new Error('Should be able to INSERT and SELECT data')
  }
  db.close()
})

testRunner.registerTest('run() returns changes and lastInsertRowId', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT)')
  const result = db.run('INSERT INTO items (value) VALUES (?)', ['test'])
  if (typeof result.changes !== 'number') {
    throw new Error('run() should return changes count')
  }
  if (typeof result.lastInsertRowId !== 'number') {
    throw new Error('run() should return lastInsertRowId')
  }
  db.close()
})

testRunner.registerTest('all() returns array of objects', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)')
  db.run('INSERT INTO products (name, price) VALUES (?, ?)', ['Item1', 10.99])
  db.run('INSERT INTO products (name, price) VALUES (?, ?)', ['Item2', 20.99])
  const results = db.all('SELECT * FROM products')
  if (!Array.isArray(results)) {
    throw new Error('all() should return an array')
  }
  if (results.length !== 2) {
    throw new Error('all() should return all rows')
  }
  if (!results[0].name) {
    throw new Error('all() should return objects with column properties')
  }
  db.close()
})

testRunner.registerTest('get() returns single object or undefined', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  db.run('INSERT INTO users (name) VALUES (?)', ['Bob'])
  const user = db.get('SELECT * FROM users WHERE name = ?', ['Bob'])
  if (typeof user !== 'object' || user === null) {
    throw new Error('get() should return an object when row exists')
  }
  const noUser = db.get('SELECT * FROM users WHERE name = ?', ['NonExistent'])
  if (noUser !== undefined) {
    throw new Error('get() should return undefined when no row found')
  }
  db.close()
})

testRunner.registerTest('Transactions commit successfully', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE accounts (name TEXT PRIMARY KEY, balance INTEGER)')
  db.run('INSERT INTO accounts VALUES (?, ?)', ['Alice', 100])

  await db.transaction(() => {
    db.run('UPDATE accounts SET balance = balance - 50 WHERE name = ?', ['Alice'])
  })

  const account = db.get('SELECT * FROM accounts WHERE name = ?', ['Alice'])
  if (account.balance !== 50) {
    throw new Error('Transaction should commit changes')
  }
  db.close()
})

testRunner.registerTest('Transactions rollback on error', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE accounts (name TEXT PRIMARY KEY, balance INTEGER)')
  db.run('INSERT INTO accounts VALUES (?, ?)', ['Alice', 100])

  try {
    await db.transaction(() => {
      db.run('UPDATE accounts SET balance = balance - 50 WHERE name = ?', ['Alice'])
      throw new Error('Simulated error')
    })
  } catch (e) {
    // Expected to fail
  }

  const account = db.get('SELECT * FROM accounts WHERE name = ?', ['Alice'])
  if (account.balance !== 100) {
    throw new Error('Transaction should rollback on error')
  }
  db.close()
})

testRunner.registerTest('inTransaction property works', async () => {
  const db = await window.Library.createDatabase()
  if (db.inTransaction) {
    throw new Error('Should not be in transaction initially')
  }

  await db.transaction(() => {
    if (!db.inTransaction) {
      throw new Error('Should be in transaction inside transaction()')
    }
  })

  if (db.inTransaction) {
    throw new Error('Should not be in transaction after commit')
  }
  db.close()
})

testRunner.registerTest('table() helper: insert works', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL)')
  const productsTable = db.table('products')
  const id = productsTable.insert({ name: 'Widget', price: 9.99 })
  if (typeof id !== 'number' || id <= 0) {
    throw new Error('table.insert() should return valid ID')
  }
  db.close()
})

testRunner.registerTest('table() helper: find works', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT)')
  db.run('INSERT INTO products VALUES (1, ?)', ['Item1'])
  const productsTable = db.table('products')
  const item = productsTable.find(1)
  if (!item || item.name !== 'Item1') {
    throw new Error('table.find() should retrieve row by ID')
  }
  db.close()
})

testRunner.registerTest('table() helper: where works', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, category TEXT, price REAL)')
  db.run('INSERT INTO products VALUES (1, ?, ?)', ['Electronics', 100])
  db.run('INSERT INTO products VALUES (2, ?, ?)', ['Electronics', 200])
  db.run('INSERT INTO products VALUES (3, ?, ?)', ['Furniture', 150])

  const productsTable = db.table('products')
  const electronics = productsTable.where({ category: 'Electronics' })
  if (electronics.length !== 2) {
    throw new Error('table.where() should filter rows')
  }
  db.close()
})

testRunner.registerTest('table() helper: update works', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)')
  db.run('INSERT INTO products VALUES (1, ?, ?)', ['Item', 10])
  const productsTable = db.table('products')
  const changes = productsTable.update(1, { price: 20 })
  if (changes !== 1) {
    throw new Error('table.update() should return changes count')
  }
  const item = productsTable.find(1)
  if (item.price !== 20) {
    throw new Error('table.update() should update the row')
  }
  db.close()
})

testRunner.registerTest('table() helper: delete works', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT)')
  db.run('INSERT INTO products VALUES (1, ?)', ['Item'])
  const productsTable = db.table('products')
  const changes = productsTable.delete(1)
  if (changes !== 1) {
    throw new Error('table.delete() should return changes count')
  }
  const item = productsTable.find(1)
  if (item !== undefined) {
    throw new Error('table.delete() should remove the row')
  }
  db.close()
})

testRunner.registerTest('export() returns Uint8Array', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)')
  const data = db.export()
  if (!(data instanceof Uint8Array)) {
    throw new Error('export() should return Uint8Array')
  }
  if (data.length === 0) {
    throw new Error('export() should return non-empty data')
  }
  db.close()
})

testRunner.registerTest('import() loads database from export', async () => {
  const db1 = await window.Library.createDatabase()
  db1.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)')
  db1.run('INSERT INTO test (value) VALUES (?)', ['hello'])
  const exportData = db1.export()
  db1.close()

  const db2 = await window.Library.createDatabase()
  db2.import(exportData)
  const row = db2.get('SELECT * FROM test')
  if (!row || row.value !== 'hello') {
    throw new Error('import() should restore database from export data')
  }
  db2.close()
})

testRunner.registerTest('getTables() returns table names', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)')
  db.exec('CREATE TABLE products (id INTEGER PRIMARY KEY)')
  const tables = db.getTables()
  if (!tables.includes('users') || !tables.includes('products')) {
    throw new Error('getTables() should return all user tables')
  }
  db.close()
})

testRunner.registerTest('getTableInfo() returns column info', async () => {
  const db = await window.Library.createDatabase()
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, age INTEGER)')
  const info = db.getTableInfo('users')
  if (!Array.isArray(info)) {
    throw new Error('getTableInfo() should return an array')
  }
  const nameColumn = info.find(col => col.name === 'name')
  if (!nameColumn || nameColumn.nullable) {
    throw new Error('getTableInfo() should return correct column information')
  }
  db.close()
})

testRunner.registerTest('SqlError is thrown on SQL errors', async () => {
  const db = await window.Library.createDatabase()
  let errorThrown = false
  try {
    db.exec('INVALID SQL SYNTAX HERE')
  } catch (e) {
    errorThrown = true
    if (!(e instanceof window.Library.SqlError)) {
      throw new Error('Should throw SqlError instance')
    }
  }
  if (!errorThrown) {
    throw new Error('Should throw error on invalid SQL')
  }
  db.close()
})

// ============================================
// EXHIBIT REGISTRATIONS FOR WALKTHROUGH
// ============================================

testRunner.registerExhibit(
  'Live Database',
  document.getElementById('exhibit-1'),
  async () => {
    // Click "Add Product" button
    const addBtn = document.querySelector('[data-action="add-product"]')
    if (addBtn) {
      addBtn.click()
      await testRunner.delay(800)
    }

    // Click "Find Expensive" button
    const findBtn = document.querySelector('[data-action="find-expensive"]')
    if (findBtn) {
      findBtn.click()
      await testRunner.delay(800)
    }
  }
)

testRunner.registerExhibit(
  'Data Grid',
  document.getElementById('exhibit-2'),
  async () => {
    // Click "Quick Add" button
    const quickAddBtn = document.getElementById('quick-add')
    if (quickAddBtn) {
      quickAddBtn.click()
      await testRunner.delay(800)
    }
  }
)

testRunner.registerExhibit(
  'Transaction Visualizer',
  document.getElementById('exhibit-3'),
  async () => {
    // Click demo transaction button
    const demoBtn = document.getElementById('demo-txn')
    if (demoBtn) {
      demoBtn.click()
      await testRunner.delay(2500) // Wait for demo to complete
    }
  }
)

testRunner.registerExhibit(
  'Persistence Proof',
  document.getElementById('exhibit-4'),
  async () => {
    // Add a note
    const addNoteBtn = document.getElementById('add-note')
    if (addNoteBtn) {
      addNoteBtn.click()
      await testRunner.delay(500)
    }

    // Trigger destroy and restore
    const destroyBtn = document.getElementById('destroy-restore')
    if (destroyBtn) {
      destroyBtn.click()
      await testRunner.delay(2000) // Wait for destruction and restoration
    }
  }
)
