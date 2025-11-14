/**
 * Database Migration: Add outcome and pnl_percent columns
 * This script adds the new Phase 7 columns to existing signals.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔄 Database Migration: Adding Phase 7 columns\n');

try {
  const dbPath = path.join(__dirname, 'data', 'signals.db');
  const db = new Database(dbPath);
  
  console.log('📂 Database:', dbPath);
  console.log('');
  
  // Check current schema
  const tableInfo = db.prepare("PRAGMA table_info(signals)").all();
  const hasOutcome = tableInfo.some(col => col.name === 'outcome');
  const hasPnl = tableInfo.some(col => col.name === 'pnl_percent');
  
  if (hasOutcome && hasPnl) {
    console.log('✅ Database already has outcome and pnl_percent columns');
    console.log('   No migration needed!\n');
    db.close();
    process.exit(0);
  }
  
  console.log('📊 Current Schema:');
  tableInfo.forEach(col => {
    console.log(`   - ${col.name}`);
  });
  console.log('');
  
  // Add new columns
  console.log('🔧 Adding new columns...');
  
  if (!hasOutcome) {
    db.exec('ALTER TABLE signals ADD COLUMN outcome TEXT');
    console.log('✅ Added: outcome (TEXT)');
  }
  
  if (!hasPnl) {
    db.exec('ALTER TABLE signals ADD COLUMN pnl_percent REAL');
    console.log('✅ Added: pnl_percent (REAL)');
  }
  
  console.log('');
  
  // Verify migration
  const newTableInfo = db.prepare("PRAGMA table_info(signals)").all();
  console.log('📊 Updated Schema:');
  newTableInfo.forEach(col => {
    const marker = (col.name === 'outcome' || col.name === 'pnl_percent') ? '✨ NEW' : '';
    console.log(`   - ${col.name.padEnd(20)} ${marker}`);
  });
  
  console.log('\n✅ Migration complete!\n');
  
  db.close();
  
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}
