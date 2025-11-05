import os
import sys
import sqlite3
from typing import Set

import pandas as pd

# Ensure imports from scripts directory
SCRIPT_DIR = os.path.dirname(__file__)
if SCRIPT_DIR not in sys.path:
    sys.path.append(SCRIPT_DIR)

from coverage_scan_single import nba_career_by_season, db_career_by_season, METRICS, DB_PATH


def ensure_table(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS season_totals_override (
          player_id TEXT NOT NULL,
          season TEXT NOT NULL,
          season_type TEXT NOT NULL DEFAULT 'Regular Season',
          points INTEGER NOT NULL DEFAULT 0,
          rebounds INTEGER NOT NULL DEFAULT 0,
          assists INTEGER NOT NULL DEFAULT 0,
          steals INTEGER NOT NULL DEFAULT 0,
          blocks INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (player_id, season, season_type)
        )
        """
    )
    conn.commit()


def upsert_override(conn: sqlite3.Connection, player_id: str, season: str, deltas: dict) -> None:
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO season_totals_override (player_id, season, season_type, points, rebounds, assists, steals, blocks)
        VALUES (?, ?, 'Regular Season', ?, ?, ?, ?, ?)
        ON CONFLICT(player_id, season, season_type) DO UPDATE SET
          points=excluded.points,
          rebounds=excluded.rebounds,
          assists=excluded.assists,
          steals=excluded.steals,
          blocks=excluded.blocks
        """,
        (
            player_id,
            season,
            int(deltas.get("points", 0)),
            int(deltas.get("rebounds", 0)),
            int(deltas.get("assists", 0)),
            int(deltas.get("steals", 0)),
            int(deltas.get("blocks", 0)),
        ),
    )


def load_discrepant_player_ids(csv_path: str) -> Set[str]:
    df = pd.read_csv(csv_path)
    # Keep rows with numeric non-zero deltas and a valid player_id
    df["delta"] = pd.to_numeric(df["delta"], errors="coerce").fillna(0).astype(int)
    players = set(str(pid) for pid in df.loc[df["delta"] != 0, "player_id"].dropna().unique())
    return players


def process_player(conn: sqlite3.Connection, player_id: str) -> int:
    """Compute per-season deltas (NBA - DB) and upsert non-zero overrides. Returns count of seasons updated."""
    nba_df = nba_career_by_season(player_id)
    db_df = db_career_by_season(conn, player_id)
    if db_df is None or db_df.empty:
        db_df = pd.DataFrame(columns=["season"] + [dst for _, dst in METRICS])

    # Normalize to common names
    nba_df2 = nba_df.rename(columns={m: m for m, _ in METRICS})[["season"] + [m for m, _ in METRICS]]
    db_df2 = db_df.rename(columns={dst: dst for _, dst in METRICS})[["season"] + [dst for _, dst in METRICS]]

    merged = pd.merge(nba_df2, db_df2, on="season", how="outer", suffixes=("_nba", "_db"))
    for m, dst in METRICS:
        merged[f"{dst}_nba"] = pd.to_numeric(merged.get(f"{m}_nba", merged.get(m, 0)), errors="coerce").fillna(0).astype(int)
        merged[f"{dst}_db"] = pd.to_numeric(merged.get(f"{dst}_db", merged.get(dst, 0)), errors="coerce").fillna(0).astype(int)

    updated = 0
    for _, row in merged.iterrows():
        season = str(row["season"]) if not pd.isna(row.get("season")) else None
        if not season:
            continue
        deltas = {}
        nonzero = False
        for m, dst in METRICS:
            delta = int(row[f"{dst}_nba"]) - int(row[f"{dst}_db"])  # NBA - DB
            deltas[dst] = delta
            if delta != 0:
                nonzero = True
        if nonzero:
            upsert_override(conn, player_id, season, deltas)
            updated += 1
    return updated


def main():
    csv_path = os.path.join("docs", "reports", "alltime_leaders_validation.csv")
    if not os.path.exists(csv_path):
        print(f"Missing report: {csv_path}. Run scripts/validate_alltime_leaders.py first.")
        sys.exit(2)

    players = load_discrepant_player_ids(csv_path)
    if not players:
        print("No discrepant players found in the report.")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_table(conn)
        total_updates = 0
        for pid in sorted(players):
            updated = process_player(conn, pid)
            total_updates += updated
            print(f" - {pid}: updated {updated} season overrides")
        conn.commit()
        print(f"Done. Total seasons updated: {total_updates}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
