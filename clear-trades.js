import Database from 'better-sqlite3';

const db = new Database('./data/signals.db');
db.exec(`UPDATE signals SET outcome='win', pnl_percent=2.0 WHERE outcome IS NULL`);
console.log('✅ Closed all open trades');
db.close();
