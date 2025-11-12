#!/usr/bin/env python3
"""
Update active player stats using nba_api library.
Runs in GitHub Actions to avoid Vercel timeout limits.
"""

import os
import sys
import time
from datetime import datetime
from typing import List, Dict, Optional

try:
    from nba_api.stats.endpoints import playergamelog
    from nba_api.stats.static import players as nba_players
except ImportError:
    print("ERROR: nba_api not installed. Run: pip install nba_api")
    sys.exit(1)

try:
    import libsql_experimental as libsql
except ImportError:
    print("ERROR: libsql_experimental not installed. Run: pip install libsql-experimental")
    sys.exit(1)


def get_current_season() -> str:
    """Get current NBA season string (e.g., '2025-26')"""
    now = datetime.now()
    year = now.year
    month = now.month
    
    # NBA season starts in October
    season_start = year if month >= 10 else year - 1
    season_end = str(season_start + 1)[-2:]
    return f"{season_start}-{season_end}"


def calculate_age_at_game(birthdate: str, game_date: str) -> Optional[int]:
    """Calculate player's age at game date"""
    try:
        birth = datetime.strptime(birthdate, "%Y-%m-%d")
        game = datetime.strptime(game_date, "%Y-%m-%d")
        
        age = game.year - birth.year
        if game.month < birth.month or (game.month == birth.month and game.day < birth.day):
            age -= 1
        
        return age
    except:
        return None


def fetch_player_games(player_id: str, season: str) -> List[Dict]:
    """Fetch game logs for a player using nba_api"""
    try:
        print(f"  Fetching games for player {player_id}, season {season}...")
        
        # Fetch game logs with rate limiting
        gamelog = playergamelog.PlayerGameLog(
            player_id=player_id,
            season=season,
            season_type_all_star='Regular Season'
        )
        
        # Small delay to respect rate limits
        time.sleep(0.6)
        
        df = gamelog.get_data_frames()[0]
        
        # Convert DataFrame to list of dicts
        games = df.to_dict('records')
        print(f"  Found {len(games)} games")
        return games
        
    except Exception as e:
        print(f"  ERROR fetching games: {e}")
        return []


def update_database(db_url: str, auth_token: str) -> Dict[str, int]:
    """Update active players in Turso database"""
    
    # Connect to Turso
    print(f"Connecting to Turso database...")
    conn = libsql.connect(database=db_url, auth_token=auth_token)
    cursor = conn.cursor()
    
    # Get current season
    season = get_current_season()
    print(f"Current season: {season}")
    
    # Get all active players
    print("Fetching active players from database...")
    cursor.execute("SELECT id, full_name, birthdate FROM players WHERE is_active = 1")
    active_players = cursor.fetchall()
    print(f"Found {len(active_players)} active players")
    
    stats = {
        'players_processed': 0,
        'games_added': 0,
        'games_skipped': 0,
        'errors': 0
    }
    
    # Process each player
    for idx, (player_id, player_name, birthdate) in enumerate(active_players, 1):
        print(f"\n[{idx}/{len(active_players)}] Processing {player_name} ({player_id})...")
        
        try:
            # Fetch games from NBA API
            games = fetch_player_games(player_id, season)
            
            for game in games:
                game_id = game['Game_ID']
                
                # Check if game already exists
                cursor.execute(
                    "SELECT 1 FROM game_summary WHERE player_id = ? AND game_id = ? LIMIT 1",
                    (player_id, game_id)
                )
                
                if cursor.fetchone():
                    stats['games_skipped'] += 1
                    continue
                
                # Calculate age
                game_date = game['GAME_DATE']
                age = calculate_age_at_game(birthdate, game_date) if birthdate else None
                
                # Insert game
                cursor.execute("""
                    INSERT INTO game_summary (
                        player_id, player_name, game_id, game_date, season, season_type,
                        points, rebounds, assists, blocks, steals, age_at_game_years
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    player_id,
                    player_name,
                    game_id,
                    game_date,
                    season,
                    'Regular Season',
                    game.get('PTS', 0) or 0,
                    game.get('REB', 0) or 0,
                    game.get('AST', 0) or 0,
                    game.get('BLK', 0) or 0,
                    game.get('STL', 0) or 0,
                    age
                ))
                
                stats['games_added'] += 1
            
            conn.commit()
            stats['players_processed'] += 1
            
            print(f"  ✓ Added {stats['games_added']} games for {player_name}")
            
        except Exception as e:
            print(f"  ✗ ERROR processing {player_name}: {e}")
            stats['errors'] += 1
            continue
    
    cursor.close()
    conn.close()
    
    return stats


def main():
    """Main entry point"""
    
    # Get environment variables
    db_url = os.environ.get('TURSO_DATABASE_URL')
    auth_token = os.environ.get('TURSO_AUTH_TOKEN')
    
    if not db_url or not auth_token:
        print("ERROR: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set")
        sys.exit(1)
    
    print("=" * 60)
    print("NBA Active Player Stats Update")
    print("=" * 60)
    print(f"Started: {datetime.now().isoformat()}")
    print()
    
    start_time = time.time()
    
    try:
        stats = update_database(db_url, auth_token)
        
        duration = time.time() - start_time
        
        print()
        print("=" * 60)
        print("✓ Update Complete!")
        print("=" * 60)
        print(f"Players processed: {stats['players_processed']}")
        print(f"Games added: {stats['games_added']}")
        print(f"Games skipped: {stats['games_skipped']}")
        print(f"Errors: {stats['errors']}")
        print(f"Duration: {duration:.1f}s")
        print("=" * 60)
        
        sys.exit(0)
        
    except Exception as e:
        print()
        print("=" * 60)
        print(f"✗ FATAL ERROR: {e}")
        print("=" * 60)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
