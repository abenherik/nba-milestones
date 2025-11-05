import os
import sys
import json
import time
import random
import sqlite3
from typing import Dict, List

import pandas as pd

DB_PATH = os.path.join("data", "app.sqlite")

METRICS = [
    ("PTS", "points"),
    ("REB", "rebounds"),
    ("AST", "assists"),
    ("STL", "steals"),
    ("BLK", "blocks"),
]

SLEEP_SECONDS = 1.0
MAX_ATTEMPTS = 5
BASE_DELAY = 0.8
MAX_DELAY = 8.0

try:
    from nba_api.stats.endpoints import playercareerstats
except Exception:
    print("Missing nba_api. Install with: pip install nba_api pandas")
    sys.exit(1)


def _should_retry_error(err: Exception) -> bool:
    msg = str(err).lower()
    markers = [
        "429",
        "too many requests",
        "timeout",
        "timed out",
        "connection reset",
        "temporary",
        "service unavailable",
        "503",
        "502",
        "bad gateway",
    ]
    return any(m in msg for m in markers)


def request_with_retries(callable_fn):
    last_err = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            time.sleep(SLEEP_SECONDS)
            return callable_fn()
        except Exception as e:
            last_err = e
            if attempt >= MAX_ATTEMPTS or not _should_retry_error(e):
                break
            delay = min(MAX_DELAY, BASE_DELAY * (2 ** (attempt - 1)))
            jitter = delay * random.uniform(0.2, 0.5)
            sleep_for = delay + jitter
            print(f"[retry] attempt {attempt}/{MAX_ATTEMPTS} failed: {e}; sleeping {sleep_for:.2f}s")
            time.sleep(sleep_for)
    raise last_err


def nba_career_by_season(player_id: str) -> pd.DataFrame:
    res = request_with_retries(lambda: playercareerstats.PlayerCareerStats(player_id=player_id))
    frames = res.get_data_frames() or []
    if not frames:
        return pd.DataFrame(columns=["season", *[m for m, _ in METRICS], "GP"])  # empty

    # Find the frame with seasonal totals
    needed_cols = {"SEASON_ID", "GP"} | {m for m, _ in METRICS}
    df_match = None
    for f in frames:
        cols = set(c.upper() for c in f.columns)
        if needed_cols.issubset(cols):
            df_match = f
            break
    if df_match is None:
        return pd.DataFrame(columns=["season", *[m for m, _ in METRICS], "GP"])  # empty

    # Normalize
    df = df_match.copy()
    # Some nba_api frames have lowercase/varied case
    rename_map = {c: c.upper() for c in df.columns}
    df.rename(columns=rename_map, inplace=True)
    df["season"] = df["SEASON_ID"].astype(str)
    # Keep only needed columns
    keep_cols = ["season", "GP"] + [m for m, _ in METRICS]
    for c in keep_cols:
        if c not in df.columns:
            df[c] = 0
    df = df[keep_cols]
    # Ensure numeric
    for c in ["GP"] + [m for m, _ in METRICS]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0).astype(int)
    return df


def db_career_by_season(conn: sqlite3.Connection, player_id: str) -> pd.DataFrame:
    # Aggregate from game_summary for Regular Season only
    sql = f"""
      SELECT season AS season,
             COALESCE(SUM(CASE WHEN season_type='Regular Season' THEN 1 ELSE 0 END), 0) AS gp_rows,
             COALESCE(SUM(points), 0)   AS points,
             COALESCE(SUM(rebounds), 0) AS rebounds,
             COALESCE(SUM(assists), 0)  AS assists,
             COALESCE(SUM(steals), 0)   AS steals,
             COALESCE(SUM(blocks), 0)   AS blocks
      FROM game_summary
      WHERE player_id = ? AND season_type = 'Regular Season'
      GROUP BY season
    """
    df = pd.read_sql_query(sql, conn, params=(player_id,))
    # gp_rows is rows; not necessarily GP. We can't infer GP perfectly here without distinct game_id.
    # We'll leave GP blank from DB side; focus on totals for metrics.
    if df.empty:
        df = pd.DataFrame(columns=["season", *[dst for _, dst in METRICS]])
    # Normalize types
    if not df.empty:
        df["season"] = df["season"].astype(str)
        for _, dst in METRICS:
            df[dst] = pd.to_numeric(df[dst], errors="coerce").fillna(0).astype(int)
    return df[["season"] + [dst for _, dst in METRICS]] if not df.empty else df


def get_player_name(conn: sqlite3.Connection, player_id: str, fallback_df: pd.DataFrame) -> str:
    try:
        cur = conn.cursor()
        cur.execute("SELECT full_name FROM players WHERE id = ?", (player_id,))
        row = cur.fetchone()
        if row and row[0]:
            return row[0]
    except Exception:
        pass
    # fallback try from nba frame
    name_cols = ["PLAYER_NAME", "PLAYER", "PLAYER_NAME_LAST_FIRST", "DISPLAY_FIRST_LAST"]
    for c in name_cols:
        if c in fallback_df.columns and len(fallback_df[c].dropna()) > 0:
            return str(fallback_df[c].iloc[0])
    return f"player_{player_id}"


def render_reports(player_id: str, player_name: str, merged: pd.DataFrame) -> None:
    out_dir = os.path.join("docs", "reports", "coverage")
    os.makedirs(out_dir, exist_ok=True)
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in player_name).strip("-")
    base = os.path.join(out_dir, f"{player_id}_{slug}")

    # CSV
    csv_path = base + ".csv"
    merged.to_csv(csv_path, index=False)

    # MD
    md_path = base + ".md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# Coverage scan for {player_name} ({player_id})\n\n")
        f.write("Totals are Regular Season only. NBA = PlayerCareerStats; DB = game_summary.\n\n")
        # Missing seasons in DB / NBA (use explicit boolean masks to avoid dtype pitfalls)
        nba_only_mask = merged["NBA_present"].astype(bool) & (~merged["DB_present"].astype(bool))
        db_only_mask = merged["DB_present"].astype(bool) & (~merged["NBA_present"].astype(bool))
        missing_db = merged.loc[nba_only_mask, "season"].astype(str).tolist()
        missing_nba = merged.loc[db_only_mask, "season"].astype(str).tolist()
        if missing_db:
            f.write(f"- Missing in DB ({len(missing_db)}): {', '.join(missing_db)}\n")
        if missing_nba:
            f.write(f"- Extra in DB not in NBA list ({len(missing_nba)}): {', '.join(missing_nba)}\n")
        if not missing_db and not missing_nba:
            f.write("- Season coverage matches exactly.\n")
        f.write("\n")

        # Table header
        f.write("Season | " + " | ".join([f"NBA {m}" for m, _ in METRICS]) + " | " + " | ".join([f"DB {m}" for m, _ in METRICS]) + " | " + " | ".join([f"Δ {m}" for m, _ in METRICS]) + "\n")
        f.write("---|" + "---:" * (len(METRICS) * 3 + 1) + "\n")
        for _, r in merged.sort_values("season").iterrows():
            nba_vals = [str(int(r.get(f"NBA_{m}", 0))) for m, _ in METRICS]
            db_vals = [str(int(r.get(f"DB_{dst}", 0))) for _, dst in METRICS]
            deltas = [str(int(r.get(f"DELTA_{dst}", 0))) for _, dst in METRICS]
            f.write(f"{r['season']}|" + "|".join(nba_vals) + "|" + "|".join(db_vals) + "|" + "|".join(deltas) + "\n")

    print(f"Wrote: {csv_path}\nWrote: {md_path}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/coverage_scan_single.py <PLAYER_ID>")
        sys.exit(2)

    player_id = str(sys.argv[1])
    print(f"Single-player coverage scan for PLAYER_ID={player_id} (Regular Season)")

    conn = sqlite3.connect(DB_PATH)
    try:
        nba_df = nba_career_by_season(player_id)
        db_df = db_career_by_season(conn, player_id)

        # Prepare merged view
        nba_df = nba_df.rename(columns={m: f"NBA_{m}" for m, _ in METRICS})
        if db_df is None or db_df.empty:
            db_df = pd.DataFrame(columns=["season"] + [dst for _, dst in METRICS])
        db_df = db_df.rename(columns={dst: f"DB_{dst}" for _, dst in METRICS})

        merged = pd.merge(nba_df, db_df, on="season", how="outer")
        # Presence flags
        merged["NBA_present"] = ~merged[[f"NBA_{m}" for m, _ in METRICS]].isna().all(axis=1)
        merged["DB_present"] = ~merged[[f"DB_{dst}" for _, dst in METRICS]].isna().all(axis=1)
        # Fill NA with 0 for numeric comparisons
        for col in [c for c in merged.columns if c.startswith("NBA_") or c.startswith("DB_")]:
            merged[col] = pd.to_numeric(merged[col], errors="coerce").fillna(0).astype(int)
        # Deltas
        for (m, dst) in METRICS:
            merged[f"DELTA_{dst}"] = merged[f"DB_{dst}"] - merged[f"NBA_{m}"]

        player_name = get_player_name(conn, player_id, nba_df)
        render_reports(player_id, player_name, merged)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
