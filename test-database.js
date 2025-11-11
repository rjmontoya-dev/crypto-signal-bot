/**
 * Test database functionality
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🧪 Testing SQLite database...\n');

const dbPath = path.join(__dirname, 'data', 'signals.db');
console.log(`📁 Database path: ${dbPath}`);

const db = new Database(dbPath);

// Create table
db.exec(`
  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id TEXT UNIQUE NOT NULL,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL,
    entry REAL NOT NULL,
    tp REAL NOT NULL,
    sl REAL NOT NULL,
    score REAL NOT NULL,
    max_score REAL NOT NULL,
    reasons TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    timestamp TEXT NOT NULL,
    action_timestamp TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log('✅ Table created/verified\n');

// Test insert
const testSignalId = `TEST_${Date.now()}`;
const stmt = db.prepare(`
  INSERT INTO signals (signal_id, symbol, direction, entry, tp, sl, score, max_score, reasons, timestamp, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

stmt.run(
  testSignalId,
  'BTC/USDT',
  'LONG',
  28500,
  29213,
  28088,
  7.5,
  10.0,
  JSON.stringify(['Test reason 1', 'Test reason 2']),
  new Date().toISOString(),
  'pending'
);

console.log(`✅ Test record inserted: ${testSignalId}\n`);

// Test query
const record = db.prepare('SELECT * FROM signals WHERE signal_id = ?').get(testSignalId);
console.log('📊 Retrieved record:');
console.log(record);
console.log('');

// Test update
db.prepare('UPDATE signals SET status = ?, action_timestamp = ? WHERE signal_id = ?')
  .run('taken', new Date().toISOString(), testSignalId);

console.log('✅ Record updated to "taken"\n');

// Count records
const count = db.prepare('SELECT COUNT(*) as count FROM signals').get();
console.log(`📈 Total signals in database: ${count.count}\n`);

db.close();
console.log('✅ Database test complete!');
