// ESM wrapper for sql.js
// This file is loaded as an ES module and provides the initSqlJs function as a default export

// The sql-wasm.js file sets initSqlJs as a global var, so we need to:
// 1. Load it as a classic script first
// 2. Then grab the global and export it

// For synchronous module loading, we need to inline the check or use a workaround
// Best approach: make the WASM loader a function that the library can call

let _initSqlJs = null
let _loadPromise = null

function ensureLoaded() {
  if (_loadPromise) return _loadPromise

  _loadPromise = new Promise((resolve, reject) => {
    // Check if already loaded globally
    if (typeof globalThis.initSqlJs !== 'undefined') {
      _initSqlJs = globalThis.initSqlJs
      resolve(_initSqlJs)
      return
    }

    const script = document.createElement('script')
    script.src = new URL('./sql-wasm.js', import.meta.url).href
    script.onload = () => {
      if (typeof globalThis.initSqlJs !== 'undefined') {
        _initSqlJs = globalThis.initSqlJs
        resolve(_initSqlJs)
      } else {
        reject(new Error('initSqlJs not available after script load'))
      }
    }
    script.onerror = () => reject(new Error('Failed to load sql-wasm.js'))
    document.head.appendChild(script)
  })

  return _loadPromise
}

// Export default as an async function that ensures the script is loaded
const initSqlJs = async (config) => {
  await ensureLoaded()
  return _initSqlJs(config)
}

export default initSqlJs
