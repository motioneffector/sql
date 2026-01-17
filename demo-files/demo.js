// Import library and expose globally for tests
import * as Library from '../dist/index.js'
window.Library = Library

// ============================================
// DATABASE INITIALIZATION
// ============================================

// WASM file location for browser usage (vendored locally)
const SQL_WASM_PATH = './demo-files/vendor/sql-wasm.wasm'

let db1, db2, db3, db4; // Separate databases for each exhibit

async function createDB() {
  // Use the @motioneffector/sql library with browser-compatible WASM path
  return await Library.createDatabase({ wasmPath: SQL_WASM_PATH });
}

// ============================================
// EXHIBIT 1: LIVE DATABASE
// ============================================

const initialData1 = `
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  price REAL NOT NULL,
  stock INTEGER DEFAULT 0
);

INSERT INTO products (name, category, price, stock) VALUES
  ('Mechanical Keyboard', 'Electronics', 149.99, 25),
  ('Ergonomic Mouse', 'Electronics', 79.99, 50),
  ('USB-C Hub', 'Electronics', 49.99, 100),
  ('Standing Desk Mat', 'Furniture', 89.99, 30),
  ('Monitor Light Bar', 'Electronics', 59.99, 45);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

INSERT INTO categories VALUES (1, 'Electronics'), (2, 'Furniture');
`;

let productCounter = 6;

async function initExhibit1() {
  db1 = await createDB();
  db1.exec(initialData1);
  productCounter = 6;
  renderLiveTables();
}

function renderLiveTables() {
  const container = document.getElementById('live-tables');
  container.innerHTML = '';

  const tables = ['products', 'categories'];
  tables.forEach(tableName => {
    const rows = db1.all(`SELECT * FROM ${tableName}`);
    const tableEl = document.createElement('div');
    tableEl.className = 'live-table';
    tableEl.id = `table-${tableName}`;

    if (rows.length === 0) {
      tableEl.innerHTML = `
        <div class="live-table-header">
          ${tableName} <span class="live-table-count">(0 rows)</span>
        </div>
        <div class="live-table-body"><div class="p-md text-muted">No data</div></div>
      `;
    } else {
      // Get column names from first row
      const columns = Object.keys(rows[0]);
      tableEl.innerHTML = `
        <div class="live-table-header">
          ${tableName} <span class="live-table-count">(${rows.length} rows)</span>
        </div>
        <div class="live-table-body">
          <table>
            <tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>
            ${rows.map((row, i) => `<tr data-id="${row.id || row[columns[0]]}">${columns.map(c => `<td>${row[c] ?? ''}</td>`).join('')}</tr>`).join('')}
          </table>
        </div>
      `;
    }
    container.appendChild(tableEl);
  });
}

function highlightRow(tableName, id, className = 'highlight') {
  const table = document.getElementById(`table-${tableName}`);
  if (!table) return;
  const row = table.querySelector(`tr[data-id="${id}"]`);
  if (row) {
    row.classList.add(className);
    setTimeout(() => row.classList.remove(className), 500);
  }
}

function animateNewRow(tableName, id) {
  setTimeout(() => {
    const table = document.getElementById(`table-${tableName}`);
    if (!table) return;
    const row = table.querySelector(`tr[data-id="${id}"]`);
    if (row) {
      row.classList.add('insert-anim');
      setTimeout(() => row.classList.remove('insert-anim'), 300);
    }
  }, 10);
}

function runSQL(sql) {
  const resultEl = document.getElementById('sql-result');
  try {
    // Check if it's a SELECT
    const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

    if (isSelect) {
      const results = db1.all(sql);
      if (results.length === 0) {
        resultEl.innerHTML = '<span class="text-muted">No results</span>';
      } else {
        const columns = Object.keys(results[0]);
        resultEl.innerHTML = `<table style="width:100%;font-size:12px;">
          <tr>${columns.map(c => `<th style="text-align:left;padding:2px 4px;border-bottom:1px solid var(--border-muted);">${c}</th>`).join('')}</tr>
          ${results.slice(0, 20).map(row => `<tr>${columns.map(c => `<td style="padding:2px 4px;">${row[c] ?? 'NULL'}</td>`).join('')}</tr>`).join('')}
          ${results.length > 20 ? `<tr><td colspan="${columns.length}" class="text-muted">...and ${results.length - 20} more rows</td></tr>` : ''}
        </table>`;

        // Highlight matching rows
        results.forEach(row => {
          highlightRow('products', row.id);
          highlightRow('categories', row.id);
        });
      }
    } else {
      const result = db1.run(sql);
      resultEl.innerHTML = `<span class="sql-result-success">Success!</span><br>Changes: ${result.changes}<br>Last Insert ID: ${result.lastInsertRowId}`;

      renderLiveTables();

      if (sql.toUpperCase().includes('INSERT')) {
        animateNewRow('products', result.lastInsertRowId);
        animateNewRow('categories', result.lastInsertRowId);
      }
    }
  } catch (e) {
    resultEl.innerHTML = `<span class="sql-result-error">Error: ${e.message}</span>`;
  }
}

document.getElementById('run-sql').addEventListener('click', () => {
  runSQL(document.getElementById('sql-input').value);
});

document.getElementById('sql-input').addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') {
    runSQL(document.getElementById('sql-input').value);
  }
});

// Quick action buttons
document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;

    if (action === 'add-product') {
      const names = ['Gaming Headset', 'Webcam HD', 'Desk Lamp', 'Cable Organizer', 'Mousepad XL', 'Monitor Arm', 'Laptop Stand'];
      const name = names[Math.floor(Math.random() * names.length)];
      const price = (Math.random() * 150 + 20).toFixed(2);
      const stock = Math.floor(Math.random() * 100);
      runSQL(`INSERT INTO products (name, category, price, stock) VALUES ('${name}', 'Electronics', ${price}, ${stock})`);
    } else if (action === 'remove-last') {
      const last = db1.get('SELECT MAX(id) as maxId FROM products');
      if (last?.maxId) {
        const id = last.maxId;
        const row = document.querySelector(`#table-products tr[data-id="${id}"]`);
        if (row) {
          row.classList.add('delete-anim');
          setTimeout(() => {
            db1.run(`DELETE FROM products WHERE id = ${id}`);
            renderLiveTables();
          }, 200);
        }
      }
    } else if (action === 'price-increase') {
      db1.run('UPDATE products SET price = price * 1.1');
      renderLiveTables();
      document.querySelectorAll('#table-products td:nth-child(4)').forEach(td => {
        td.classList.add('update-anim');
        setTimeout(() => td.classList.remove('update-anim'), 300);
      });
      document.getElementById('sql-result').innerHTML = '<span class="sql-result-success">All prices increased by 10%!</span>';
    } else if (action === 'find-expensive') {
      runSQL('SELECT * FROM products WHERE price > 100');
    } else if (action === 'category-stats') {
      runSQL('SELECT category, COUNT(*) as count, ROUND(SUM(price), 2) as total FROM products GROUP BY category');
    } else if (action === 'reset-db1') {
      initExhibit1();
      document.getElementById('sql-result').innerHTML = '<span class="text-muted">Database reset to initial state</span>';
    } else if (action === 'reset-db2') {
      initExhibit2();
    } else if (action === 'reset-db3') {
      initExhibit3();
    }
  });
});

// ============================================
// EXHIBIT 2: DATA GRID
// ============================================

async function initExhibit2() {
  db2 = await createDB();
  db2.exec(initialData1);
  renderDataGrid('products');
}

function renderDataGrid(tableName) {
  const headerEl = document.getElementById('grid-header');
  const bodyEl = document.getElementById('grid-body');

  const results = db2.all(`SELECT * FROM ${tableName}`);
  if (results.length === 0) {
    headerEl.innerHTML = '<th>No data</th>';
    bodyEl.innerHTML = '';
    return;
  }

  const columns = Object.keys(results[0]);

  headerEl.innerHTML = columns.map(c => `<th data-col="${c}">${c}</th>`).join('') + '<th style="width:40px;"></th>';

  bodyEl.innerHTML = results.map((row, rowIdx) => {
    const id = row.id || row[columns[0]];
    return `<tr data-id="${id}" draggable="true">
      ${columns.map((col, colIdx) => {
        const editable = colIdx > 0 ? 'contenteditable="true"' : '';
        return `<td data-col="${col}" ${editable}>${row[col] ?? ''}</td>`;
      }).join('')}
      <td class="text-muted" style="text-align:center;cursor:grab;">&#9776;</td>
    </tr>`;
  }).join('');

  // Add event listeners for editing
  bodyEl.querySelectorAll('td[contenteditable]').forEach(td => {
    let originalValue = td.textContent;

    td.addEventListener('focus', () => {
      originalValue = td.textContent;
      td.closest('tr').classList.add('editing');
    });

    td.addEventListener('blur', () => {
      td.closest('tr').classList.remove('editing');
      const newValue = td.textContent;
      if (newValue !== originalValue) {
        const col = td.dataset.col;
        const id = td.closest('tr').dataset.id;
        try {
          const isNum = !isNaN(parseFloat(newValue)) && col !== 'name' && col !== 'category';
          const val = isNum ? parseFloat(newValue) : `'${newValue.replace(/'/g, "''")}'`;
          db2.run(`UPDATE ${tableName} SET ${col} = ${val} WHERE id = ${id}`);
          td.classList.add('cell-success');
          setTimeout(() => td.classList.remove('cell-success'), 300);
        } catch (e) {
          td.textContent = originalValue;
          td.classList.add('cell-error');
          setTimeout(() => td.classList.remove('cell-error'), 300);
        }
      }
    });

    td.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        td.blur();
      } else if (e.key === 'Escape') {
        td.textContent = originalValue;
        td.blur();
      }
    });
  });

  // Drag and drop for rows
  bodyEl.querySelectorAll('tr').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', row.dataset.id);
      row.style.opacity = '0.5';
    });

    row.addEventListener('dragend', () => {
      row.style.opacity = '1';
    });
  });
}

// Trash zone
const trashZone = document.getElementById('trash-zone');
trashZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  trashZone.classList.add('drag-over');
});

trashZone.addEventListener('dragleave', () => {
  trashZone.classList.remove('drag-over');
});

trashZone.addEventListener('drop', (e) => {
  e.preventDefault();
  trashZone.classList.remove('drag-over');
  const id = e.dataTransfer.getData('text/plain');
  const tableName = document.getElementById('table-select').value;

  const row = document.querySelector(`#grid-body tr[data-id="${id}"]`);
  if (row) {
    row.classList.add('row-delete');
    setTimeout(() => {
      db2.run(`DELETE FROM ${tableName} WHERE id = ${id}`);
      renderDataGrid(tableName);
    }, 200);
  }
});

// Quick add
document.getElementById('quick-add').addEventListener('click', () => {
  const tableName = document.getElementById('table-select').value;
  if (tableName === 'products') {
    const names = ['New Widget', 'Super Gadget', 'Pro Device', 'Ultra Tool', 'Mega Accessory'];
    const name = names[Math.floor(Math.random() * names.length)] + ' #' + Math.floor(Math.random() * 1000);
    const price = (Math.random() * 200 + 10).toFixed(2);
    const stock = Math.floor(Math.random() * 100);
    db2.run(`INSERT INTO products (name, category, price, stock) VALUES ('${name}', 'Electronics', ${price}, ${stock})`);
  } else {
    const id = Math.floor(Math.random() * 1000) + 10;
    db2.run(`INSERT INTO categories VALUES (${id}, 'New Category')`);
  }
  renderDataGrid(tableName);
});

// Custom add
document.getElementById('custom-add').addEventListener('click', () => {
  const tableName = document.getElementById('table-select').value;
  if (tableName === 'products') {
    db2.run(`INSERT INTO products (name, category, price, stock) VALUES ('', '', 0, 0)`);
  } else {
    const id = Math.floor(Math.random() * 1000) + 10;
    db2.run(`INSERT INTO categories VALUES (${id}, '')`);
  }
  renderDataGrid(tableName);
  // Focus the first editable cell of new row
  const newRow = document.querySelector('#grid-body tr:last-child td[contenteditable]');
  if (newRow) newRow.focus();
});

// Table selector
document.getElementById('table-select').addEventListener('change', (e) => {
  renderDataGrid(e.target.value);
});

// ============================================
// EXHIBIT 3: TRANSACTION VISUALIZER
// ============================================

const initialData3 = `
CREATE TABLE accounts (
  name TEXT PRIMARY KEY,
  balance INTEGER NOT NULL
);

INSERT INTO accounts VALUES ('Alice', 200), ('Bob', 200), ('Charlie', 200);
`;

let inTransaction = false;
let operations = [];
let savedBalances = {};

async function initExhibit3() {
  db3 = await createDB();
  db3.exec(initialData3);
  inTransaction = false;
  operations = [];
  savedBalances = {};
  renderAccounts();
  updateTxnUI();
}

function renderAccounts() {
  const panel = document.getElementById('accounts-panel');
  const results = db3.all('SELECT name, balance FROM accounts');

  panel.innerHTML = results.map(row => `
    <div class="account-card" data-name="${row.name}">
      <div class="account-name">${row.name}</div>
      <div class="account-balance" data-balance="${row.balance}">$${row.balance}</div>
    </div>
  `).join('');
}

function updateTxnUI() {
  const container = document.getElementById('txn-container');
  const noTxn = document.getElementById('no-transaction');
  const statusEl = document.getElementById('txn-status');
  const pendingEl = document.getElementById('pending-ops');
  const opsList = document.getElementById('operations-list');

  if (inTransaction) {
    container.classList.add('active');
    container.classList.remove('committed', 'rolled-back');
    noTxn.style.display = 'none';
    statusEl.textContent = 'true';
    statusEl.classList.add('active');
  } else {
    container.classList.remove('active');
    noTxn.style.display = 'block';
    statusEl.textContent = 'false';
    statusEl.classList.remove('active');
  }

  pendingEl.textContent = operations.length;

  opsList.innerHTML = operations.map((op, i) => `
    <div class="operation-card ${op.status}">
      <span class="operation-icon">${op.icon}</span>
      <span>${op.label}</span>
    </div>
  `).join('');

  document.getElementById('btn-begin').disabled = inTransaction;
  document.getElementById('btn-commit').disabled = !inTransaction;
  document.getElementById('btn-rollback').disabled = !inTransaction;
}

function beginTransaction() {
  if (inTransaction) return;

  // Save current balances
  const results = db3.all('SELECT name, balance FROM accounts');
  savedBalances = {};
  results.forEach(row => {
    savedBalances[row.name] = row.balance;
  });

  inTransaction = true;
  operations = [];
  updateTxnUI();
}

function addOperation(from, to, amount) {
  if (!inTransaction) return;

  // Execute the transfer
  db3.run(`UPDATE accounts SET balance = balance - ${amount} WHERE name = '${from}'`);
  db3.run(`UPDATE accounts SET balance = balance + ${amount} WHERE name = '${to}'`);

  operations.push({
    icon: '&#128176;',
    label: `${from} → ${to} $${amount}`,
    status: 'pending',
    from, to, amount
  });

  renderAccounts();
  updateTxnUI();

  // Animate balance change
  const fromCard = document.querySelector(`.account-card[data-name="${from}"] .account-balance`);
  const toCard = document.querySelector(`.account-card[data-name="${to}"] .account-balance`);
  if (fromCard) fromCard.classList.add('changing');
  if (toCard) toCard.classList.add('changing');
  setTimeout(() => {
    if (fromCard) fromCard.classList.remove('changing');
    if (toCard) toCard.classList.remove('changing');
  }, 300);
}

function commitTransaction() {
  if (!inTransaction) return;

  // Mark operations as committed
  operations = operations.map(op => ({ ...op, status: 'committed' }));
  document.getElementById('txn-container').classList.add('committed');
  updateTxnUI();

  setTimeout(() => {
    inTransaction = false;
    operations = [];
    savedBalances = {};
    updateTxnUI();
  }, 500);
}

function rollbackTransaction() {
  if (!inTransaction) return;

  // Mark operations as rolled back
  operations = operations.map(op => ({ ...op, status: 'rolled-back' }));
  document.getElementById('txn-container').classList.add('rolled-back');
  updateTxnUI();

  // Animate balance rollback
  document.querySelectorAll('.account-balance').forEach(el => {
    el.classList.add('rolling-back');
  });

  setTimeout(() => {
    // Restore saved balances
    Object.entries(savedBalances).forEach(([name, balance]) => {
      db3.run(`UPDATE accounts SET balance = ${balance} WHERE name = '${name}'`);
    });

    renderAccounts();

    setTimeout(() => {
      document.querySelectorAll('.account-balance').forEach(el => {
        el.classList.remove('rolling-back');
      });

      inTransaction = false;
      operations = [];
      savedBalances = {};
      updateTxnUI();
    }, 200);
  }, 400);
}

document.getElementById('btn-begin').addEventListener('click', beginTransaction);
document.getElementById('btn-commit').addEventListener('click', commitTransaction);
document.getElementById('btn-rollback').addEventListener('click', rollbackTransaction);

document.getElementById('transfer-ab').addEventListener('click', () => addOperation('Alice', 'Bob', 50));
document.getElementById('transfer-bc').addEventListener('click', () => addOperation('Bob', 'Charlie', 25));
document.getElementById('transfer-ca').addEventListener('click', () => addOperation('Charlie', 'Alice', 75));

// Demo button
document.getElementById('demo-txn').addEventListener('click', async () => {
  // Reset first
  await initExhibit3();
  await sleep(300);

  // Begin
  beginTransaction();
  await sleep(600);

  // Transfer 1
  addOperation('Alice', 'Bob', 50);
  await sleep(800);

  // Transfer 2
  addOperation('Bob', 'Charlie', 25);
  await sleep(1000);

  // Rollback
  rollbackTransaction();
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================
// EXHIBIT 4: PERSISTENCE PROOF
// ============================================

const initialData4 = `
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO notes (content) VALUES
  ('Hello world'),
  ('My second note'),
  ('This will persist');
`;

let persistenceData = null;
let autoSave = true;
let isDirty = false;

async function initExhibit4() {
  db4 = await createDB();
  db4.exec(initialData4);

  // Save initial state
  persistenceData = db4.export();

  renderNotes();
  updateStorageInfo();
  updateConnectionStatus('connected');
}

function renderNotes() {
  const list = document.getElementById('notes-list');
  const countEl = document.getElementById('notes-count');

  const results = db4.all('SELECT id, content FROM notes ORDER BY id DESC');

  if (results.length === 0) {
    list.innerHTML = '<div class="p-md text-muted">No notes yet</div>';
    countEl.textContent = '(0 rows)';
    return;
  }

  countEl.textContent = `(${results.length} rows)`;

  list.innerHTML = results.map(row => `
    <div class="note-item" data-id="${row.id}">
      <span class="note-content">${escapeHtml(row.content)}</span>
      <button class="note-delete" data-id="${row.id}">&#10005;</button>
    </div>
  `).join('');

  // Delete buttons
  list.querySelectorAll('.note-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      db4.run(`DELETE FROM notes WHERE id = ${id}`);
      markDirty();
      renderNotes();
    });
  });
}

function updateStorageInfo() {
  const data = db4.export();
  const size = data.byteLength;
  const sizeKB = (size / 1024).toFixed(1);

  document.getElementById('storage-size').textContent = `~${sizeKB} KB`;
  document.getElementById('storage-fill').style.width = `${Math.min(size / 1000, 100)}%`;
}

function updateConnectionStatus(status) {
  const el = document.getElementById('connection-status');
  el.className = 'connection-indicator';

  if (status === 'connected') {
    el.innerHTML = '<span class="dot"></span><span>Connected</span>';
  } else if (status === 'disconnected') {
    el.classList.add('disconnected');
    el.innerHTML = '<span class="dot"></span><span>Destroyed</span>';
  } else if (status === 'reconnecting') {
    el.classList.add('reconnecting');
    el.innerHTML = '<span class="dot"></span><span>Restoring...</span>';
  }
}

function markDirty() {
  isDirty = true;
  updateSaveStatus();

  if (autoSave) {
    setTimeout(() => {
      if (isDirty) saveDatabase();
    }, 500);
  }
}

function saveDatabase() {
  persistenceData = db4.export();
  isDirty = false;
  updateSaveStatus();
  updateStorageInfo();
}

function updateSaveStatus() {
  const el = document.getElementById('save-status');
  if (isDirty) {
    el.classList.add('dirty');
    el.innerHTML = '<span class="status-dot pulsing"></span><span>Unsaved</span>';
  } else {
    el.classList.remove('dirty');
    el.innerHTML = '<span class="status-dot"></span><span>Saved</span>';
  }
}

// Add note
document.getElementById('add-note').addEventListener('click', () => {
  const quotes = [
    'The quick brown fox jumps over the lazy dog',
    'Remember to demo this feature!',
    'Data persistence is magical',
    'SQLite in the browser - how cool is that?',
    'This note was auto-generated'
  ];
  const content = quotes[Math.floor(Math.random() * quotes.length)] + ' - ' + new Date().toLocaleTimeString();
  db4.run(`INSERT INTO notes (content) VALUES ('${content.replace(/'/g, "''")}')`);
  markDirty();
  renderNotes();
});

// Custom note (optional element)
const noteInput = document.getElementById('note-input');
if (noteInput) {
  noteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      const content = e.target.value.trim();
      db4.run(`INSERT INTO notes (content) VALUES ('${content.replace(/'/g, "''")}')`);
      e.target.value = '';
      markDirty();
      renderNotes();
    }
  });
}

// Save now (optional element)
const saveNow = document.getElementById('save-now');
if (saveNow) saveNow.addEventListener('click', saveDatabase);

// Auto-save toggle (optional element)
const autoSaveToggle = document.getElementById('auto-save-toggle');
if (autoSaveToggle) {
  autoSaveToggle.addEventListener('change', (e) => {
    autoSave = e.target.checked;
  });
}

// Clear all (optional element)
const clearAll = document.getElementById('clear-all');
if (clearAll) {
  clearAll.addEventListener('click', () => {
    if (confirm('Are you sure you want to delete all notes?')) {
      db4.run('DELETE FROM notes');
      markDirty();
      renderNotes();
    }
  });
}

// Destroy & Restore
document.getElementById('destroy-restore').addEventListener('click', async () => {
  const btn = document.getElementById('destroy-restore');
  btn.disabled = true;

  // Save current state
  saveDatabase();

  const steps = {
    active: document.getElementById('step-active'),
    destroyed: document.getElementById('step-destroyed'),
    restored: document.getElementById('step-restored')
  };

  // Step 1: Active
  steps.active.classList.add('active');
  steps.destroyed.classList.remove('active', 'destroyed');
  steps.restored.classList.remove('active', 'restored');
  await sleep(500);

  // Step 2: Destroy
  updateConnectionStatus('disconnected');
  steps.active.classList.remove('active');
  steps.destroyed.classList.add('active', 'destroyed');

  // Clear the display
  document.getElementById('notes-list').innerHTML = '<div class="p-md text-muted">Database destroyed...</div>';
  document.getElementById('notes-count').textContent = '(-)';

  db4.close();
  db4 = null;

  await sleep(1000);

  // Step 3: Restore
  updateConnectionStatus('reconnecting');
  steps.destroyed.classList.remove('active');
  steps.restored.classList.add('active', 'restored');

  await sleep(500);

  // Recreate from saved data
  db4 = await window.Library.createDatabase({ data: persistenceData });

  updateConnectionStatus('connected');
  renderNotes();
  updateStorageInfo();

  await sleep(1000);

  // Reset steps
  steps.restored.classList.remove('active', 'restored');
  steps.active.classList.add('active');

  btn.disabled = false;
});

// Export (optional element)
const exportDb = document.getElementById('export-db');
if (exportDb) {
  exportDb.addEventListener('click', () => {
    const data = db4.export();
    const blob = new Blob([data], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-${Date.now()}.sqlite`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// Import (optional elements)
const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');
if (importBtn && importFile) {
  importBtn.addEventListener('click', () => {
    importFile.click();
  });

  importFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        db4.close();
        db4 = await window.Library.createDatabase({ data });
        persistenceData = data;
        isDirty = false;
        updateSaveStatus();
        renderNotes();
        updateStorageInfo();
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  });
}

// Drop zone (optional element)
const dropZone = document.getElementById('drop-zone');

if (dropZone) {
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        db4.close();
        db4 = await window.Library.createDatabase({ data });
        persistenceData = data;
        isDirty = false;
        updateSaveStatus();
        renderNotes();
        updateStorageInfo();
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ============================================
// VISUAL DEMO PLAYBACK
// ============================================

function logDemo(message, type = 'info') {
  const output = document.getElementById('test-output');
  const icon = type === 'success' ? '&#10003;' : type === 'action' ? '&#9654;' : '&#8226;';
  const iconClass = type === 'success' ? 'pass' : '';
  output.innerHTML += `
    <div class="test-item">
      <span class="test-icon ${iconClass}">${icon}</span>
      <span class="test-name">${escapeHtml(message)}</span>
    </div>
  `;
  output.scrollTop = output.scrollHeight;
}

function scrollToExhibit(exhibitId) {
  const exhibit = document.getElementById(exhibitId);
  if (exhibit) {
    exhibit.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function runVisualDemo(progressFill, progressText) {
  const DELAY = 400; // ms between actions for visibility

  // ========== EXHIBIT 1: LIVE DATABASE ==========
  progressText.textContent = 'Demo: Live Database';
  progressFill.style.width = '55%';
  scrollToExhibit('exhibit-1');
  logDemo('Exhibit 1: Live Database', 'action');
  await sleep(DELAY);

  // Reset exhibit 1
  await initExhibit1();
  logDemo('Reset database to initial state');
  await sleep(DELAY);

  // Run an INSERT
  const sqlInput = document.getElementById('sql-input');
  sqlInput.value = "INSERT INTO products (name, category, price, stock) VALUES ('Gaming Monitor', 'Electronics', 299.99, 12);";
  logDemo('Inserting new product: Gaming Monitor');
  await sleep(DELAY / 2);
  runSQL(sqlInput.value);
  await sleep(DELAY);

  // Add product via button
  progressFill.style.width = '58%';
  logDemo('Adding product via quick button');
  document.querySelector('[data-action="add-product"]').click();
  await sleep(DELAY);

  // Price increase
  progressFill.style.width = '60%';
  logDemo('Increasing all prices by 10%');
  document.querySelector('[data-action="price-increase"]').click();
  await sleep(DELAY);

  // Find expensive
  progressFill.style.width = '62%';
  logDemo('Finding expensive products (price > 100)');
  document.querySelector('[data-action="find-expensive"]').click();
  await sleep(DELAY);

  // Remove last
  progressFill.style.width = '64%';
  logDemo('Removing last product');
  document.querySelector('[data-action="remove-last"]').click();
  await sleep(DELAY);

  logDemo('Exhibit 1 complete', 'success');
  await sleep(DELAY);

  // ========== EXHIBIT 2: DATA GRID ==========
  progressText.textContent = 'Demo: Data Grid';
  progressFill.style.width = '68%';
  scrollToExhibit('exhibit-2');
  logDemo('Exhibit 2: Data Grid', 'action');
  await sleep(DELAY);

  // Reset exhibit 2
  await initExhibit2();
  logDemo('Reset data grid');
  await sleep(DELAY);

  // Quick add rows
  progressFill.style.width = '70%';
  logDemo('Adding rows via Quick Add');
  document.getElementById('quick-add').click();
  await sleep(DELAY);
  document.getElementById('quick-add').click();
  await sleep(DELAY);

  // Edit a cell
  progressFill.style.width = '72%';
  logDemo('Editing a cell value');
  const firstEditableCell = document.querySelector('#grid-body td[contenteditable="true"]');
  if (firstEditableCell) {
    firstEditableCell.focus();
    firstEditableCell.textContent = 'Edited Product Name';
    firstEditableCell.blur();
  }
  await sleep(DELAY);

  logDemo('Exhibit 2 complete', 'success');
  await sleep(DELAY);

  // ========== EXHIBIT 3: TRANSACTION VISUALIZER ==========
  progressText.textContent = 'Demo: Transaction Visualizer';
  progressFill.style.width = '76%';
  scrollToExhibit('exhibit-3');
  logDemo('Exhibit 3: Transaction Visualizer', 'action');
  await sleep(DELAY);

  // Reset exhibit 3
  await initExhibit3();
  logDemo('Reset transaction state');
  await sleep(DELAY);

  // Begin transaction
  progressFill.style.width = '78%';
  logDemo('BEGIN transaction');
  beginTransaction();
  await sleep(DELAY);

  // Transfer 1
  logDemo('Transfer $50 from Alice to Bob');
  addOperation('Alice', 'Bob', 50);
  await sleep(DELAY);

  // Transfer 2
  progressFill.style.width = '80%';
  logDemo('Transfer $25 from Bob to Charlie');
  addOperation('Bob', 'Charlie', 25);
  await sleep(DELAY);

  // Rollback
  progressFill.style.width = '82%';
  logDemo('ROLLBACK - watch balances restore!');
  rollbackTransaction();
  await sleep(800); // Longer wait for rollback animation

  // Now demonstrate commit
  logDemo('Starting new transaction to demonstrate COMMIT');
  await sleep(DELAY);
  beginTransaction();
  await sleep(DELAY);

  logDemo('Transfer $30 from Charlie to Alice');
  addOperation('Charlie', 'Alice', 30);
  await sleep(DELAY);

  progressFill.style.width = '84%';
  logDemo('COMMIT - changes are permanent');
  commitTransaction();
  await sleep(DELAY);

  logDemo('Exhibit 3 complete', 'success');
  await sleep(DELAY);

  // ========== EXHIBIT 4: PERSISTENCE PROOF ==========
  progressText.textContent = 'Demo: Persistence Proof';
  progressFill.style.width = '88%';
  scrollToExhibit('exhibit-4');
  logDemo('Exhibit 4: Persistence Proof', 'action');
  await sleep(DELAY);

  // Reset exhibit 4
  await initExhibit4();
  logDemo('Reset persistence demo');
  await sleep(DELAY);

  // Add some notes
  progressFill.style.width = '90%';
  logDemo('Adding notes to database');
  for (let i = 0; i < 2; i++) {
    document.getElementById('add-note').click();
    await sleep(DELAY / 2);
  }
  await sleep(DELAY);

  // Save
  logDemo('Saving database to storage');
  saveDatabase();
  await sleep(DELAY);

  // Destroy & Restore
  progressFill.style.width = '92%';
  logDemo('DESTROY & RESTORE - the ultimate persistence test!');
  await sleep(DELAY / 2);

  // Trigger destroy & restore
  const destroyBtn = document.getElementById('destroy-restore');
  destroyBtn.click();

  // Wait for the full animation
  await sleep(3500);

  progressFill.style.width = '98%';
  logDemo('Data survived destruction!', 'success');
  await sleep(DELAY);

  logDemo('Exhibit 4 complete', 'success');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
  try {
    await initExhibit1();
    await initExhibit2();
    await initExhibit3();
    await initExhibit4();
    console.log('Demo initialized successfully');
  } catch (e) {
    console.error('Failed to initialize:', e);
    document.body.innerHTML = `<div class="page"><div class="text-error">Failed to load database: ${e.message}</div></div>`;
  }
}

// Initialize when the page loads
init();

// Export for test runner
window.DemoFunctions = {
  runVisualDemo,
  createDB,
  escapeHtml,
  sleep
};
