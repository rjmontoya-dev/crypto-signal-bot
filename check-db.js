import Database from 'better-sqlite3';

const db = new Database('./data/signals.db');

// Check completed trades
const completedTrades = db.prepare(`
  SELECT id, symbol, outcome, reasons 
  FROM signals 
  WHERE outcome IN ('win', 'loss') 
  LIMIT 5
`).all();

console.log('Completed trades sample:');
completedTrades.forEach(trade => {
  console.log(`\nID: ${trade.id}`);
  console.log(`Symbol: ${trade.symbol}`);
  console.log(`Outcome: ${trade.outcome}`);
  console.log(`Reasons (raw): ${trade.reasons}`);
  console.log(`Reasons (parsed):`, JSON.parse(trade.reasons));
});

// Check confluence stats calculation
const allTrades = db.prepare(`
  SELECT reasons, outcome 
  FROM signals 
  WHERE outcome IN ('win', 'loss')
`).all();

const confluenceStats = {};

allTrades.forEach(trade => {
  let reasons;
  try {
    reasons = JSON.parse(trade.reasons);
  } catch {
    reasons = trade.reasons.split(',').map(r => r.trim());
  }
  
  reasons.forEach(reason => {
    const cleanReason = reason
      .replace(/✓\s*/, '')
      .replace(/\s*\[.*?\]/, '')
      .trim();
    
    if (!confluenceStats[cleanReason]) {
      confluenceStats[cleanReason] = { total: 0, wins: 0, losses: 0 };
    }
    
    confluenceStats[cleanReason].total++;
    if (trade.outcome === 'win') {
      confluenceStats[cleanReason].wins++;
    } else {
      confluenceStats[cleanReason].losses++;
    }
  });
});

console.log('\n\nConfluence Stats:');
Object.entries(confluenceStats).forEach(([confluence, stats]) => {
  const winRate = ((stats.wins / stats.total) * 100).toFixed(1);
  console.log(`${confluence}: ${winRate}% (${stats.wins}/${stats.total})`);
});

db.close();
