import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'signals.db');
const db = new Database(dbPath);

console.log('🔧 Starting database migration: Add timeframe column...\n');

try {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(signals)").all();
  const hasTimeframe = tableInfo.some(col => col.name === 'timeframe');
  
  if (hasTimeframe) {
    console.log('✅ Column "timeframe" already exists. No migration needed.\n');
  } else {
    // Add the timeframe column
    console.log('Adding "timeframe" column to signals table...');
    db.prepare('ALTER TABLE signals ADD COLUMN timeframe TEXT').run();
    console.log('✅ Column added successfully\n');
    
    // Update existing records with default timeframe
    const defaultTimeframe = process.env.TIMEFRAME || '1h';
    console.log(`Setting default timeframe "${defaultTimeframe}" for existing signals...`);
    const result = db.prepare('UPDATE signals SET timeframe = ? WHERE timeframe IS NULL').run(defaultTimeframe);
    console.log(`✅ Updated ${result.changes} records\n`);
  }
  
  console.log('✅ Migration completed successfully!');
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
