// SQLite storage with Node's built-in node:sqlite. Every query is scoped to the business
// (dmnid) selected in the session.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CONFIG } from "./config.js";

mkdirSync(dirname(CONFIG.dbPath), { recursive: true });
const db = new DatabaseSync(CONFIG.dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    dmnid      INTEGER NOT NULL,
    ownerid    INTEGER NOT NULL,
    userid     INTEGER NOT NULL,
    title      TEXT    NOT NULL,
    body       TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS ix_notes_dmnid ON notes (dmnid, id DESC);
`);

const statements = {
  list: db.prepare(
    "SELECT id, userid, title, body, created_at FROM notes WHERE dmnid = ? ORDER BY id DESC LIMIT ?"),
  count: db.prepare("SELECT COUNT(*) AS count FROM notes WHERE dmnid = ?"),
  latest: db.prepare("SELECT title FROM notes WHERE dmnid = ? ORDER BY id DESC LIMIT 1"),
  insert: db.prepare("INSERT INTO notes (dmnid, ownerid, userid, title, body) VALUES (?, ?, ?, ?, ?)"),
  byId: db.prepare("SELECT id, userid, title, body, created_at FROM notes WHERE id = ?"),
  remove: db.prepare("DELETE FROM notes WHERE id = ? AND dmnid = ?"),
};

const plain = (row) => (row ? { ...row } : row);

export const store = {
  list: (dmnid, limit = 200) => statements.list.all(dmnid, limit).map(plain),
  count: (dmnid) => Number(statements.count.get(dmnid).count),
  latestTitle: (dmnid) => statements.latest.get(dmnid)?.title ?? null,
  create(dmnid, ownerid, userid, title, body) {
    const { lastInsertRowid } = statements.insert.run(dmnid, ownerid, userid, title, body);
    return plain(statements.byId.get(lastInsertRowid));
  },
  remove: (dmnid, id) => statements.remove.run(id, dmnid).changes > 0,
};
