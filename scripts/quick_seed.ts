import { createClient } from '@libsql/client';

const DATABASE_URL = "libsql://nba-milestones-abenherik.aws-eu-west-1.turso.io";
const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || ""; // You'll need to provide this

const samplePlayers = [
  { id: '2544', full_name: 'LeBron James', is_active: 1 },
  { id: '201939', full_name: 'Stephen Curry', is_active: 1 },
  { id: '201566', full_name: 'Russell Westbrook', is_active: 1 },
  { id: '203507', full_name: 'Giannis Antetokounmpo', is_active: 1 },
  { id: '1629029', full_name: 'Luka Doncic', is_active: 1 }
];

const sampleGames = [
  { player_id: '2544', player_name: 'LeBron James', game_id: 'g1', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 25, rebounds: 8, assists: 6, blocks: 1, steals: 1, age_at_game_years: 20 },
  { player_id: '201939', player_name: 'Stephen Curry', game_id: 'g2', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 30, rebounds: 5, assists: 8, blocks: 0, steals: 2, age_at_game_years: 21 },
  { player_id: '203507', player_name: 'Giannis Antetokounmpo', game_id: 'g3', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 28, rebounds: 12, assists: 5, blocks: 3, steals: 1, age_at_game_years: 19 }
];

async function quickSeed() {
  if (!AUTH_TOKEN) {
    console.log('❌ Please set TURSO_AUTH_TOKEN environment variable');
    console.log('Get it from: https://app.turso.tech/');
    return;
  }

  const client = createClient({
    url: DATABASE_URL,
    authToken: AUTH_TOKEN,
  });

  try {
    console.log('🔄 Creating tables...');
    
    await client.execute(`CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      is_active INTEGER,
      birthdate TEXT
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS game_summary (
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      game_id TEXT NOT NULL,
      game_date TEXT NOT NULL,
      season TEXT,
      season_type TEXT,
      points INTEGER DEFAULT 0,
      rebounds INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      blocks INTEGER DEFAULT 0,
      steals INTEGER DEFAULT 0,
      age_at_game_years INTEGER,
      PRIMARY KEY (game_id, player_id)
    )`);

    console.log('✅ Tables created');

    console.log('🔄 Inserting players...');
    for (const player of samplePlayers) {
      await client.execute({
        sql: 'INSERT OR REPLACE INTO players (id, full_name, is_active) VALUES (?, ?, ?)',
        args: [player.id, player.full_name, player.is_active]
      });
    }

    console.log('🔄 Inserting games...');
    for (const game of sampleGames) {
      await client.execute({
        sql: 'INSERT OR REPLACE INTO game_summary (player_id, player_name, game_id, game_date, season, season_type, points, rebounds, assists, blocks, steals, age_at_game_years) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [game.player_id, game.player_name, game.game_id, game.game_date, game.season, game.season_type, game.points, game.rebounds, game.assists, game.blocks, game.steals, game.age_at_game_years]
      });
    }

    console.log('✅ Data inserted successfully!');
    
    // Verify
    const playerCount = await client.execute('SELECT COUNT(*) as count FROM players');
    const gameCount = await client.execute('SELECT COUNT(*) as count FROM game_summary');
    
    console.log(`📊 Players: ${playerCount.rows[0].count}`);
    console.log(`📊 Games: ${gameCount.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  quickSeed();
}

export { quickSeed };