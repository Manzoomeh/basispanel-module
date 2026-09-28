"""SQLite storage. Every query is scoped to the business (dmnid) selected in the session."""
import asyncio
import sqlite3
from contextlib import closing

from notes_config import CONFIG

_SCHEMA = """
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
"""


def _connect() -> sqlite3.Connection:
    CONFIG.db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(CONFIG.db_path)
    connection.row_factory = sqlite3.Row
    return connection


def init() -> None:
    with closing(_connect()) as db, db:
        db.executescript(_SCHEMA)


def _list(dmnid: int, limit: int) -> list[dict]:
    with closing(_connect()) as db:
        rows = db.execute(
            "SELECT id, userid, title, body, created_at FROM notes"
            " WHERE dmnid = ? ORDER BY id DESC LIMIT ?", (dmnid, limit)).fetchall()
    return [dict(row) for row in rows]


def _count(dmnid: int) -> int:
    with closing(_connect()) as db:
        return db.execute("SELECT COUNT(*) FROM notes WHERE dmnid = ?", (dmnid,)).fetchone()[0]


def _create(dmnid: int, ownerid: int, userid: int, title: str, body: str) -> dict:
    with closing(_connect()) as db, db:
        cursor = db.execute(
            "INSERT INTO notes (dmnid, ownerid, userid, title, body) VALUES (?, ?, ?, ?, ?)",
            (dmnid, ownerid, userid, title, body))
        row = db.execute("SELECT id, userid, title, body, created_at FROM notes WHERE id = ?",
                         (cursor.lastrowid,)).fetchone()
    return dict(row)


def _delete(dmnid: int, note_id: int) -> bool:
    with closing(_connect()) as db, db:
        cursor = db.execute("DELETE FROM notes WHERE id = ? AND dmnid = ?", (note_id, dmnid))
    return cursor.rowcount > 0


async def list_async(dmnid: int, limit: int = 200) -> list[dict]:
    return await asyncio.to_thread(_list, dmnid, limit)


async def count_async(dmnid: int) -> int:
    return await asyncio.to_thread(_count, dmnid)


async def create_async(dmnid: int, ownerid: int, userid: int, title: str, body: str) -> dict:
    return await asyncio.to_thread(_create, dmnid, ownerid, userid, title, body)


async def delete_async(dmnid: int, note_id: int) -> bool:
    return await asyncio.to_thread(_delete, dmnid, note_id)


init()
