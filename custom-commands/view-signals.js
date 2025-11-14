/**
 * View all signals logged in the database
 */
import Database from 'better-sqlite3';

const db = new Database('./data/signals.db');

console.log('📊 SIGNAL DATABASE VIEWER\n');
console.log('═'.repeat(80));

// Get counts by status
const stats = db.prepare(`
  SELECT 
    status,
    COUNT(*) as count
  FROM signals
  GROUP BY status
`).all();

console.log('📈 Statistics:');
stats.forEach(stat => {
  console.log(`   ${stat.status}: ${stat.count}`);
});

const total = db.prepare('SELECT COUNT(*) as count FROM signals').get();
console.log(`   Total: ${total.count}`);
console.log('');

// Get all signals
const signals = db.prepare(`
  SELECT * FROM signals
  ORDER BY created_at DESC
  LIMIT 10
`).all();

console.log('═'.repeat(80));
console.log(`🎯 Latest Signals (showing ${signals.length} of ${total.count}):\n`);

signals.forEach((signal, idx) => {
  console.log(`${idx + 1}. ${signal.symbol} ${signal.direction || 'N/A'}`);
  console.log(`   ID: ${signal.signal_id}`);
  console.log(`   Entry: $${signal.entry?.toLocaleString() || 'N/A'}`);
  console.log(`   TP: $${signal.tp?.toLocaleString() || 'N/A'} | SL: $${signal.sl?.toLocaleString() || 'N/A'}`);
  console.log(`   Score: ${signal.score}/${signal.max_score}`);
  console.log(`   Status: ${signal.status}`);
  console.log(`   Created: ${signal.created_at}`);
  
  if (signal.reasons) {
    const reasons = JSON.parse(signal.reasons);
    console.log(`   Reasons (${reasons.length}):`);
    reasons.slice(0, 3).forEach(r => console.log(`      • ${r}`));
    if (reasons.length > 3) {
      console.log(`      ... and ${reasons.length - 3} more`);
    }
  }
  
  console.log('');
});

console.log('═'.repeat(80));
console.log('\n💡 To clear test data: DELETE FROM signals WHERE signal_id LIKE "TEST_%"');
console.log('💡 Database location: ./data/signals.db\n');

db.close();
