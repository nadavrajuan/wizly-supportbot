import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new Database(path.join(DATA_DIR, 'support.db'));
  _db.pragma('journal_mode = WAL');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_entries (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      question  TEXT    NOT NULL,
      answer    TEXT    NOT NULL,
      source    TEXT    NOT NULL DEFAULT 'manual',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gmail_tokens (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      access_token  TEXT,
      refresh_token TEXT,
      expiry_date   INTEGER,
      account_email TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
