var W = Object.defineProperty;
var Y = (a, d, h) => d in a ? W(a, d, { enumerable: !0, configurable: !0, writable: !0, value: h }) : a[d] = h;
var A = (a, d, h) => Y(a, typeof d != "symbol" ? d + "" : d, h);
import B from "sql.js";
class E extends Error {
  constructor(h, f = "SQLITE_ERROR") {
    super(h);
    /**
     * SQLite error code (e.g., 'SQLITE_CONSTRAINT')
     */
    A(this, "code");
    /**
     * SQL statement that caused the error (if applicable)
     */
    A(this, "sql");
    /**
     * Parameters that were bound (if applicable)
     */
    A(this, "params");
    this.name = "SqlError", this.code = f, Object.setPrototypeOf(this, new.target.prototype);
  }
}
class V extends E {
  constructor(d, h = "SQLITE_ERROR") {
    super(d, h), this.name = "SqlSyntaxError";
  }
}
class G extends E {
  constructor(d, h = "SQLITE_CONSTRAINT") {
    super(d, h), this.name = "SqlConstraintError";
  }
}
class j extends E {
  constructor(d, h = "SQLITE_ERROR") {
    super(d, h), this.name = "SqlNotFoundError";
  }
}
class p extends E {
  constructor(h, f) {
    super(h, "MIGRATION_ERROR");
    /**
     * Migration version that caused the error
     */
    A(this, "version");
    this.name = "MigrationError", f !== void 0 && (this.version = f);
  }
}
async function z(a) {
  if (a != null && a.persist) {
    if (!a.persist.key || a.persist.key.trim() === "")
      throw new Error("persist.key cannot be empty");
    if (typeof a.persist.storage == "string" && a.persist.storage !== "indexeddb")
      throw new Error('persist.storage must be "indexeddb" or "localstorage"');
  }
  let d;
  try {
    d = await B(
      a != null && a.wasmPath ? {
        locateFile: (e) => a.wasmPath ?? ""
      } : void 0
    );
  } catch (e) {
    const r = e.message;
    throw r.includes("fetch") || r.includes("Failed to fetch") || r.includes("NetworkError") || r.includes("404") || r.includes("ENOTFOUND") ? new Error(`Failed to load SQL.js WASM: ${r}`) : new Error(`Failed to load SQL.js WASM: ${r}`);
  }
  let h = a == null ? void 0 : a.data;
  if (!h && (a != null && a.persist)) {
    const e = C(a.persist.storage);
    try {
      const r = await e.getItem(a.persist.key);
      r && (h = r);
    } catch (r) {
      console.warn("Failed to load from persistent storage:", r);
    }
  }
  if (h && h.length > 0) {
    const e = Array.from(h.slice(0, 16));
    if (![83, 81, 76, 105, 116, 101, 32, 102, 111, 114, 109, 97, 116, 32, 51, 0].every((t, n) => e[n] === t))
      throw new E("Invalid SQLite database format");
  }
  let f;
  try {
    f = new d.Database(h);
  } catch (e) {
    throw new E(`Failed to create database: ${e.message}`);
  }
  try {
    f.run("PRAGMA foreign_keys = ON");
  } catch {
  }
  let v = !1, m = 0, U = 0;
  const $ = [];
  let I = [], x = !1;
  const q = (a == null ? void 0 : a.autoSave) ?? !!(a != null && a.persist), K = (a == null ? void 0 : a.autoSaveDebounce) ?? 1e3;
  let R;
  const b = () => {
    !q || !(a != null && a.persist) || (R && clearTimeout(R), R = setTimeout(() => {
      M().catch((e) => {
        console.error("Auto-save failed:", e);
      });
    }, K));
  }, M = async () => {
    if (!(a != null && a.persist)) return;
    const e = C(a.persist.storage), r = u.export();
    await e.setItem(a.persist.key, r);
  }, w = () => {
    if (v)
      throw new Error("Database is closed");
  };
  async function H() {
    if (!x && I.length !== 0) {
      for (x = !0; I.length > 0; ) {
        const e = I.shift();
        if (!e) break;
        const { fn: r, resolve: s, reject: t } = e;
        try {
          f.exec("BEGIN"), m++;
          const n = await r();
          f.exec("COMMIT"), b(), s(n);
        } catch (n) {
          try {
            f.exec("ROLLBACK");
          } catch {
          }
          t(n);
        } finally {
          m--;
        }
      }
      x = !1;
    }
  }
  const g = (e) => {
    if (!e || e.trim() === "")
      throw new E("Identifier cannot be empty");
    if (e.includes("\0"))
      throw new E("Identifier cannot contain null bytes");
    return `"${e.replace(/"/g, '""')}"`;
  }, D = (e) => {
    let r = 0, s = !1, t = "";
    for (let n = 0; n < e.length; n++) {
      const o = e[n];
      s ? o === t && e[n - 1] !== "\\" && (s = !1) : o === "'" || o === '"' ? (s = !0, t = o) : o === "?" && r++;
    }
    return r;
  }, F = (e) => {
    const r = /* @__PURE__ */ new Set();
    let s = !1, t = "";
    for (let n = 0; n < e.length; n++) {
      const o = e[n];
      if (s) {
        o === t && e[n - 1] !== "\\" && (s = !1);
        continue;
      }
      if (o === "'" || o === '"') {
        s = !0, t = o;
        continue;
      }
      if (o === ":" || o === "$" || o === "@") {
        let i = "", c = n + 1;
        for (; c < e.length && /[a-zA-Z0-9_]/.test(e[c] ?? ""); )
          i += e[c], c++;
        i.length > 0 && r.add(i);
      }
    }
    return r;
  }, k = (e, r) => {
    if (!r) {
      const s = D(e), t = F(e);
      if (s > 0 || t.size > 0)
        throw new E("SQL requires parameters but none provided");
      return;
    }
    if (Array.isArray(r)) {
      const s = D(e);
      if (r.length !== s)
        throw new E(
          `Parameter count mismatch: SQL expects ${String(s)} parameters but ${String(r.length)} provided`
        );
    } else {
      const s = F(e), t = new Set(Object.keys(r));
      for (const n of s)
        if (!t.has(n))
          throw new E(`Missing required parameter: ${n}`);
    }
  }, L = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]), _ = (e) => {
    if (!e) return;
    if (Array.isArray(e))
      return e.map(Q);
    for (const s in e)
      if (L.has(s))
        throw new E(`Parameter name "${s}" is not allowed`);
    const r = {};
    for (const [s, t] of Object.entries(e)) {
      if (!Object.hasOwn(e, s)) continue;
      const n = Q(t);
      r[`:${s}`] = n, r[`$${s}`] = n, r[`@${s}`] = n, r[s] = n;
    }
    return r;
  }, Q = (e) => {
    if (e == null) return null;
    if (e instanceof Date) return e.toISOString();
    if (typeof e == "boolean") return e ? 1 : 0;
    if (typeof e == "bigint") return e.toString();
    if (e instanceof ArrayBuffer) return new Uint8Array(e);
    if (e instanceof Uint8Array || typeof e == "number" || typeof e == "string") return e;
    throw new TypeError(`Unsupported parameter type: ${typeof e}`);
  }, T = (e, r, s) => {
    const t = e.message || String(e), n = t.match(/^(SQLITE_\w+)/), o = (n == null ? void 0 : n[1]) ?? "SQLITE_ERROR";
    if (o === "SQLITE_ERROR" && (t.includes("syntax error") || t.includes("unrecognized token") || t.includes("incomplete") || t.includes("near ") || t.includes("parse") || t.includes("unexpected"))) {
      const c = new V(t, o);
      throw r !== void 0 && (c.sql = r), s !== void 0 && (c.params = s), c;
    }
    if (o.includes("CONSTRAINT") || t.includes("CONSTRAINT") || t.includes("UNIQUE constraint") || t.includes("NOT NULL constraint") || t.includes("FOREIGN KEY constraint") || t.includes("CHECK constraint") || t.includes("PRIMARY KEY") || t.includes("must be unique")) {
      let c = o;
      o === "SQLITE_ERROR" && (t.includes("UNIQUE constraint") ? c = "SQLITE_CONSTRAINT_UNIQUE" : t.includes("NOT NULL constraint") ? c = "SQLITE_CONSTRAINT_NOTNULL" : t.includes("FOREIGN KEY constraint") ? c = "SQLITE_CONSTRAINT_FOREIGNKEY" : t.includes("CHECK constraint") ? c = "SQLITE_CONSTRAINT_CHECK" : t.includes("PRIMARY KEY") ? c = "SQLITE_CONSTRAINT_PRIMARYKEY" : c = "SQLITE_CONSTRAINT");
      const l = new G(t, c);
      throw r !== void 0 && (l.sql = r), s !== void 0 && (l.params = s), l;
    }
    if (t.includes("no such table") || t.includes("no such column") || t.includes("not found")) {
      const c = new j(t, o);
      throw r !== void 0 && (c.sql = r), s !== void 0 && (c.params = s), c;
    }
    const i = new E(t, o);
    throw r !== void 0 && (i.sql = r), s !== void 0 && (i.params = s), i;
  }, u = {
    run(e, r) {
      var n, o;
      w();
      let s, t;
      typeof e == "object" && e !== null && "sql" in e && "params" in e ? (s = e.sql, t = e.params) : (s = e, t = r);
      try {
        k(s, t);
        const i = _(t);
        if (i) {
          const y = f.prepare(s);
          y.bind(i), y.step(), y.free();
        } else
          f.run(s);
        const c = f.getRowsModified();
        let l = 0;
        if (c > 0 && s.trim().toUpperCase().startsWith("INSERT"))
          try {
            const y = f.exec("SELECT last_insert_rowid() as id");
            (o = (n = y[0]) == null ? void 0 : n.values[0]) != null && o[0] && (l = y[0].values[0][0]);
          } catch {
          }
        return m === 0 && b(), { changes: c, lastInsertRowId: l };
      } catch (i) {
        if (i instanceof TypeError)
          throw i;
        return T(i, s, t);
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    get(e, r) {
      w();
      let s, t;
      typeof e == "object" && e !== null && "sql" in e && "params" in e ? (s = e.sql, t = e.params) : (s = e, t = r);
      try {
        k(s, t);
        const n = f.prepare(s), o = _(t);
        if (o && n.bind(o), n.step()) {
          const i = n.getAsObject();
          return n.free(), i;
        }
        n.free();
        return;
      } catch (n) {
        if (n instanceof TypeError)
          throw n;
        return T(n, s, t);
      }
    },
    all(e, r) {
      w();
      let s, t;
      typeof e == "object" && e !== null && "sql" in e && "params" in e ? (s = e.sql, t = e.params) : (s = e, t = r);
      try {
        k(s, t);
        const n = f.prepare(s), o = _(t);
        o && n.bind(o);
        const i = [];
        for (; n.step(); )
          i.push(n.getAsObject());
        return n.free(), i;
      } catch (n) {
        if (n instanceof TypeError)
          throw n;
        return T(n, s, t);
      }
    },
    exec(e) {
      w();
      try {
        f.exec(e), m === 0 && b();
      } catch (r) {
        T(r, e);
      }
    },
    async migrate(e) {
      w();
      for (const i of e) {
        if (!Number.isInteger(i.version) || i.version < 1)
          throw new Error("Migration version must be >= 1");
        if (!i.up)
          throw new Error('Migration must have an "up" script');
      }
      const r = e.map((i) => i.version), s = new Set(r);
      if (r.length !== s.size) {
        const i = r.find((c, l) => r.indexOf(c) !== l);
        throw new Error(`Duplicate migration version: ${String(i)}`);
      }
      u.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
      `);
      const t = u.getMigrationVersion(), n = [...e].sort((i, c) => i.version - c.version), o = [];
      for (const i of n)
        if (!(i.version <= t))
          try {
            await u.transaction(() => {
              u.exec(i.up), u.run("INSERT INTO _migrations (version, applied_at) VALUES (?, ?)", [
                i.version,
                (/* @__PURE__ */ new Date()).toISOString()
              ]);
            }), o.push(i.version);
          } catch (c) {
            throw new p(
              `Migration ${String(i.version)} failed: ${c.message}`,
              i.version
            );
          }
      return o;
    },
    async rollback(e = 0, r) {
      if (w(), e < 0)
        throw new p("Target version cannot be negative");
      const s = u.getMigrationVersion();
      if (e > s)
        throw new p(`Target version ${String(e)} is greater than current version ${String(s)}`);
      const t = u.all(
        "SELECT version FROM _migrations WHERE version > ? ORDER BY version DESC",
        [e]
      ), n = [];
      if (!r || r.length === 0) {
        if (t.length > 0) {
          const o = t[0];
          if (o)
            throw new p("Rollback requires migrations with down scripts", o.version);
        }
        return n;
      }
      for (const { version: o } of t) {
        const i = r.find((c) => c.version === o);
        if (!(i != null && i.down))
          throw new p(`Migration ${String(o)} has no down script`, o);
        try {
          await u.transaction(() => {
            if (!i.down)
              throw new Error("Missing down migration");
            u.exec(i.down), u.run("DELETE FROM _migrations WHERE version = ?", [o]);
          }), n.push(o);
        } catch (c) {
          throw new p(
            `Rollback of migration ${String(o)} failed: ${c.message}`,
            o
          );
        }
      }
      return n;
    },
    getMigrationVersion() {
      w();
      try {
        const e = u.get(
          "SELECT MAX(version) as version FROM _migrations"
        );
        return (e == null ? void 0 : e.version) ?? 0;
      } catch {
        return 0;
      }
    },
    async transaction(e) {
      if (w(), m > 0) {
        const s = `sp_${String(++U)}`;
        $.push(s), m++;
        try {
          u.exec(`SAVEPOINT ${s}`);
        } catch (t) {
          throw m--, $.pop(), t;
        }
        try {
          const t = await e();
          return u.exec(`RELEASE ${s}`), m--, $.pop(), t;
        } catch (t) {
          try {
            u.exec(`ROLLBACK TO ${s}`), u.exec(`RELEASE ${s}`);
          } catch {
          }
          throw m--, $.pop(), t;
        }
      } else
        return new Promise((s, t) => {
          const n = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          I.push({
            id: n,
            fn: e,
            resolve: s,
            reject: t,
            enqueuedAt: Date.now()
          }), Promise.resolve().then(() => H());
        });
    },
    get inTransaction() {
      return m > 0;
    },
    table(e, r) {
      if (w(), !e || e.trim() === "")
        throw new Error("tableName cannot be empty");
      if (e.includes("\0"))
        throw new E("Identifier cannot contain null bytes");
      const s = (r == null ? void 0 : r.primaryKey) ?? "id";
      return {
        insert(t) {
          for (const S in t)
            if (L.has(S))
              throw new E(`Column name "${S}" is not allowed`);
          const n = Object.entries(t).filter(([S, N]) => Object.hasOwn(t, S) && N !== void 0), o = n.map(([S]) => g(S)), i = n.map(([S, N]) => N), c = o.map(() => "?").join(", "), l = `INSERT INTO ${g(e)} (${o.join(", ")}) VALUES (${c})`;
          return u.run(l, i).lastInsertRowId;
        },
        find(t, n) {
          const o = (n == null ? void 0 : n.key) ?? s;
          return u.get(`SELECT * FROM ${g(e)} WHERE ${g(o)} = ?`, [t]);
        },
        where(t) {
          if (Object.keys(t).length === 0)
            return u.all(`SELECT * FROM ${g(e)}`);
          for (const c in t)
            if (L.has(c))
              throw new E(`Column name "${c}" is not allowed`);
          const n = [], o = [];
          for (const [c, l] of Object.entries(t))
            Object.hasOwn(t, c) && (l === null ? n.push(`${g(c)} IS NULL`) : (n.push(`${g(c)} = ?`), o.push(l)));
          const i = `SELECT * FROM ${g(e)} WHERE ${n.join(" AND ")}`;
          return u.all(i, o);
        },
        update(t, n, o) {
          const i = (o == null ? void 0 : o.key) ?? s;
          for (const O in n)
            if (L.has(O))
              throw new E(`Column name "${O}" is not allowed`);
          const c = Object.entries(n).filter(([O, P]) => Object.hasOwn(n, O) && P !== void 0);
          if (c.length === 0)
            return 0;
          const l = c.map(([O]) => `${g(O)} = ?`), y = [...c.map(([O, P]) => P), t], S = `UPDATE ${g(e)} SET ${l.join(", ")} WHERE ${g(i)} = ?`;
          return u.run(S, y).changes;
        },
        delete(t, n) {
          const o = (n == null ? void 0 : n.key) ?? s;
          return u.run(`DELETE FROM ${g(e)} WHERE ${g(o)} = ?`, [t]).changes;
        },
        count(t) {
          if (!t || Object.keys(t).length === 0) {
            const l = u.get(`SELECT COUNT(*) as count FROM ${g(e)}`);
            return (l == null ? void 0 : l.count) ?? 0;
          }
          for (const l in t)
            if (L.has(l))
              throw new E(`Column name "${l}" is not allowed`);
          const n = [], o = [];
          for (const [l, y] of Object.entries(t))
            Object.hasOwn(t, l) && (y === null ? n.push(`${g(l)} IS NULL`) : (n.push(`${g(l)} = ?`), o.push(y)));
          const i = `SELECT COUNT(*) as count FROM ${g(e)} WHERE ${n.join(" AND ")}`, c = u.get(i, o);
          return (c == null ? void 0 : c.count) ?? 0;
        },
        all() {
          return u.all(`SELECT * FROM ${g(e)}`);
        }
      };
    },
    export() {
      return w(), f.export();
    },
    import(e) {
      w();
      try {
        const r = e instanceof ArrayBuffer ? new Uint8Array(e) : e, s = "SQLite format 3\0";
        if (r.length < 16)
          throw new E("Invalid SQLite file: file too small");
        for (let t = 0; t < s.length; t++)
          if (r[t] !== s.charCodeAt(t))
            throw new E("Invalid SQLite file: not a valid SQLite database format");
        f.close(), f = new d.Database(r), b();
      } catch (r) {
        throw r instanceof E ? r : new E(`Failed to import database: ${r.message}`);
      }
    },
    async save() {
      w(), R && clearTimeout(R), await M();
    },
    async load() {
      if (w(), !(a != null && a.persist)) return;
      const r = await C(a.persist.storage).getItem(a.persist.key);
      r && u.import(r);
    },
    getTables() {
      return w(), u.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'"
      ).map((r) => r.name);
    },
    getTableInfo(e) {
      w();
      const r = u.get(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?",
        [e]
      );
      if (!r || r.count === 0)
        throw new j(`Table "${e}" not found`);
      try {
        return u.all(`PRAGMA table_info(${g(e)})`).map((t) => ({
          name: t.name,
          type: t.type,
          nullable: t.notnull === 0,
          defaultValue: t.dflt_value,
          primaryKey: t.pk === 1
        }));
      } catch {
        throw new j(`Table "${e}" not found`);
      }
    },
    getIndexes(e) {
      w();
      try {
        const r = e ? `SELECT name, tbl_name, sql
             FROM sqlite_master
             WHERE type = 'index'
             AND tbl_name = ?
             AND name NOT LIKE 'sqlite_autoindex_%'` : `SELECT name, tbl_name, sql
             FROM sqlite_master
             WHERE type = 'index'
             AND name NOT LIKE 'sqlite_autoindex_%'`, s = e ? [e] : void 0;
        return u.all(r, s).map((n) => {
          var c;
          const o = n.sql ? n.sql.includes("UNIQUE INDEX") : !1, i = [];
          try {
            const l = f.exec(`PRAGMA index_info("${n.name}")`);
            if ((c = l[0]) != null && c.values)
              for (const y of l[0].values) {
                const S = y[2];
                S && i.push(S);
              }
          } catch {
            if (n.sql) {
              const l = n.sql.match(/\((.*?)\)/);
              l && l[1] && i.push(...l[1].split(",").map((y) => y.trim()));
            }
          }
          return {
            name: n.name,
            table: n.tbl_name,
            unique: o,
            columns: i
          };
        });
      } catch (r) {
        return T(r);
      }
    },
    close() {
      if (!v) {
        for (; I.length > 0; ) {
          const e = I.shift();
          e && e.reject(new Error("Database closed with pending transactions"));
        }
        R && clearTimeout(R), a != null && a.persist && M(), f.close(), v = !0;
      }
    },
    async clone() {
      w();
      const e = u.export();
      return z({ data: e });
    },
    clear() {
      w();
      const e = u.getTables();
      for (const r of e)
        u.exec(`DELETE FROM ${g(r)}`);
      try {
        u.exec("DELETE FROM sqlite_sequence");
      } catch {
      }
      b();
    },
    async destroy() {
      a != null && a.persist && await C(a.persist.storage).removeItem(a.persist.key), u.close();
    },
    sql(e, ...r) {
      return { sql: e.reduce((t, n, o) => t + n + (o < r.length ? "?" : ""), ""), params: r };
    },
    prepare(e) {
      w();
      let r;
      try {
        r = f.prepare(e);
      } catch (n) {
        return T(n, e);
      }
      let s = !1;
      const t = () => {
        if (s)
          throw new Error("Statement has been finalized");
      };
      return {
        run(n) {
          var o, i;
          t();
          try {
            const c = _(n);
            c && r.bind(c), r.step(), r.reset();
            const l = f.getRowsModified(), y = ((i = (o = f.exec("SELECT last_insert_rowid() as id")[0]) == null ? void 0 : o.values[0]) == null ? void 0 : i[0]) || 0;
            return { changes: l, lastInsertRowId: y };
          } catch (c) {
            return T(c, e, n);
          }
        },
        get(n) {
          t();
          try {
            const o = _(n);
            if (o && r.bind(o), r.step()) {
              const i = r.getAsObject();
              return r.reset(), i;
            }
            r.reset();
            return;
          } catch (o) {
            return T(o, e, n);
          }
        },
        all(n) {
          t();
          try {
            const o = _(n);
            o && r.bind(o);
            const i = [];
            for (; r.step(); )
              i.push(r.getAsObject());
            return r.reset(), i;
          } catch (o) {
            return T(o, e, n);
          }
        },
        finalize() {
          s || (r.free(), s = !0);
        }
      };
    },
    insertMany(e, r) {
      if (w(), r.length === 0)
        return [];
      const s = r[0];
      if (!s)
        return [];
      const t = Object.keys(s);
      for (const i of r) {
        const c = Object.keys(i);
        for (const l of c)
          if (!t.includes(l))
            throw new Error("All rows must have the same columns");
      }
      const n = [], o = m > 0;
      try {
        o || (f.exec("BEGIN"), m++);
        for (const i of r) {
          const c = {};
          for (const S of t)
            c[S] = i[S];
          const y = u.table(e).insert(c);
          n.push(y);
        }
        o || (f.exec("COMMIT"), m--, b());
      } catch (i) {
        if (!o) {
          try {
            f.exec("ROLLBACK");
          } catch {
          }
          m--;
        }
        throw i;
      }
      return n;
    }
  };
  return u;
}
function C(a) {
  return typeof a == "object" ? a : a === "indexeddb" ? {
    getItem(d) {
      return Promise.resolve(null);
    },
    setItem(d, h) {
      return Promise.resolve();
    },
    removeItem(d) {
      return Promise.resolve();
    }
  } : {
    getItem(d) {
      const h = localStorage.getItem(`__motioneffector_sql_${d}`);
      if (!h) return Promise.resolve(null);
      const f = atob(h), v = new Uint8Array(f.length);
      for (let m = 0; m < f.length; m++)
        v[m] = f.charCodeAt(m);
      return Promise.resolve(v);
    },
    setItem(d, h) {
      const f = Array.from(h, (m) => String.fromCharCode(m)).join(""), v = btoa(f);
      return localStorage.setItem(`__motioneffector_sql_${d}`, v), Promise.resolve();
    },
    removeItem(d) {
      return localStorage.removeItem(`__motioneffector_sql_${d}`), Promise.resolve();
    }
  };
}
export {
  p as MigrationError,
  G as SqlConstraintError,
  E as SqlError,
  j as SqlNotFoundError,
  V as SqlSyntaxError,
  z as createDatabase
};
