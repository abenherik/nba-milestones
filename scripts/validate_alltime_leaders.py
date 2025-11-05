import os
import json
import random
import sqlite3
import time
from typing import Dict, List, Tuple, Optional

import pandas as pd

try:
    from nba_api.stats.endpoints import alltimeleadersgrids, playercareerstats
except Exception as e:
    print("Missing nba_api. Install with: pip install nba_api pandas")
    raise

DB_PATH = "data/app.sqlite"
CACHE_DIR = os.path.join("data", "cache")
CAREER_TOTALS_CACHE = os.path.join(CACHE_DIR, "career_totals.json")

METRICS = {
    "points": {"table": "PTS", "db_col": "points"},
    "rebounds": {"table": "REB", "db_col": "rebounds"},
    "assists": {"table": "AST", "db_col": "assists"},
    "steals": {"table": "STL", "db_col": "steals"},
    "blocks": {"table": "BLK", "db_col": "blocks"},
}

TOP_N = 25
SLEEP_SECONDS = 1.0

# Retry configuration for nba_api calls
MAX_ATTEMPTS = 5
BASE_DELAY = 0.8  # seconds
MAX_DELAY = 8.0   # seconds

# In-memory cache for career totals (persisted to JSON file)
_CAREER_CACHE: Dict[str, Dict[str, int]] = {}


def _load_cache() -> None:
    global _CAREER_CACHE
    try:
        if os.path.exists(CAREER_TOTALS_CACHE):
            with open(CAREER_TOTALS_CACHE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    _CAREER_CACHE = data
    except Exception:
        # Non-fatal: start with empty cache on any issue
        _CAREER_CACHE = {}


def _save_cache() -> None:
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        tmp = CAREER_TOTALS_CACHE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_CAREER_CACHE, f, ensure_ascii=False, indent=2)
        os.replace(tmp, CAREER_TOTALS_CACHE)
    except Exception:
        # Non-fatal
        pass


def _should_retry_error(err: Exception) -> bool:
    msg = str(err).lower()
    # Heuristics for transient issues
    transient_markers = [
        "429", "too many requests", "timeout", "timed out", "connection reset",
        "temporary", "service unavailable", "503", "502", "bad gateway",
    ]
    return any(m in msg for m in transient_markers)


def request_with_retries(callable_fn, *, max_attempts: int = MAX_ATTEMPTS,
                         base_delay: float = BASE_DELAY, max_delay: float = MAX_DELAY):
    last_err = None
    for attempt in range(1, max_attempts + 1):
        try:
            # Gentle pacing between calls
            time.sleep(SLEEP_SECONDS)
            return callable_fn()
        except Exception as e:
            last_err = e
            if attempt >= max_attempts or not _should_retry_error(e):
                break
            # Exponential backoff with jitter
            delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
            jitter = delay * random.uniform(0.2, 0.5)
            sleep_for = delay + jitter
            print(f" - transient error on attempt {attempt}/{max_attempts}: {e}; retrying in {sleep_for:.2f}s...")
            time.sleep(sleep_for)
    # If we get here, raise the last error
    raise last_err


def fetch_alltime_leaders() -> Dict[str, pd.DataFrame]:
    print("Fetching NBA All-Time Leaders (Regular Season)...")
    # Request top N explicitly (API defaults to 10)
    try:
        res = request_with_retries(
            lambda: alltimeleadersgrids.AllTimeLeadersGrids(
                season_type="Regular Season",
                topx=TOP_N,
            )
        )
        frames = res.get_data_frames() or []
    except Exception as e:
        print(f"Warning: AllTimeLeadersGrids request failed: {e}. Will use fallback.")
        return {}

    # Debug: print dataset names and columns to infer mapping
    try:
        datasets = getattr(res, "data_sets", None)
        if datasets:
            names = [getattr(ds, "name", "?") for ds in datasets]
            print(f" - data_sets: {names}")
    except Exception:
        pass

    by_name: Dict[str, pd.DataFrame] = {}
    for i, df in enumerate(frames):
        cols = [str(c) for c in df.columns]
        ucols = set(c.upper() for c in cols)
        print(f" - Table[{i}] cols: {cols}")

        # Try to infer by presence of metric columns
        for metric_tbl in ["PTS", "REB", "AST", "STL", "BLK"]:
            if metric_tbl in ucols:
                by_name[metric_tbl] = df
        # Fallback heuristics: sometimes value columns are named differently
        if "VALUE" in ucols and "CATEGORY" in ucols:
            # Pivot by category
            for metric_tbl in ["PTS", "REB", "AST", "STL", "BLK"]:
                if df["CATEGORY"].astype(str).str.upper().eq(metric_tbl).any():
                    sub = df[df["CATEGORY"].astype(str).str.upper().eq(metric_tbl)].copy()
                    # normalize expected columns
                    if "VALUE" in sub.columns and metric_tbl not in sub.columns:
                        sub[metric_tbl] = sub["VALUE"]
                    by_name[metric_tbl] = sub

    missing = [m for m, meta in METRICS.items() if meta["table"] not in by_name]
    if missing:
        print(f"Warning: Missing tables for metrics: {missing}")
    return by_name


def get_db_total(conn: sqlite3.Connection, player_id: str, db_col: str) -> int:
    # Sum regular season only + optional season_totals_override deltas
    cur = conn.cursor()
    # Base total from game_summary
    cur.execute(
        f"""
        SELECT COALESCE(SUM({db_col}), 0)
        FROM game_summary
        WHERE player_id = ? AND season_type = 'Regular Season'
        """,
        (player_id,),
    )
    base_total = int((cur.fetchone() or [0])[0] or 0)

    # Add overrides if table exists
    try:
        cur.execute(
            f"""
            SELECT COALESCE(SUM({db_col}), 0)
            FROM season_totals_override
            WHERE player_id = ? AND season_type = 'Regular Season'
            """,
            (player_id,),
        )
        override_total = int((cur.fetchone() or [0])[0] or 0)
    except sqlite3.Error:
        override_total = 0

    return base_total + override_total


def get_null_season_type_count(conn: sqlite3.Connection, player_id: str) -> int:
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COUNT(*) FROM player_stats
        WHERE player_id = ? AND season_type IS NULL
        """,
        (player_id,),
    )
    return int(cur.fetchone()[0] or 0)


def compute_db_top25(conn: sqlite3.Connection, metric_key: str) -> pd.DataFrame:
    """Return our DB's top-25 regular-season leaders for a metric."""
    db_col = METRICS[metric_key]["db_col"]
    sql = f"""
      SELECT s.player_id AS player_id, p.full_name AS player, COALESCE(SUM(s.{db_col}),0) AS db_total
      FROM game_summary s
      JOIN players p ON p.id = s.player_id
      WHERE s.season_type = 'Regular Season'
      GROUP BY s.player_id, p.full_name
      ORDER BY db_total DESC
      LIMIT {TOP_N}
    """
    return pd.read_sql_query(sql, conn)


def fetch_official_totals(player_id: str) -> Optional[Dict[str, int]]:
    """Fetch official career totals (Regular Season) for a player via PlayerCareerStats.
    Returns dict with PTS/REB/AST/STL/BLK totals summed across seasons.
    """
    # Check cache first
    if not _CAREER_CACHE:
        _load_cache()
    cached = _CAREER_CACHE.get(str(player_id))
    if cached and all(k in cached for k in ["PTS", "REB", "AST", "STL", "BLK"]):
        return cached

    try:
        res = request_with_retries(lambda: playercareerstats.PlayerCareerStats(player_id=player_id))
        frames = res.get_data_frames() or []
        if not frames:
            return None
        # Find a frame that contains expected total columns
        needed = {"PTS", "REB", "AST", "STL", "BLK"}
        df_match = None
        for f in frames:
            cols = set(c.upper() for c in f.columns)
            if needed.issubset(cols):
                df_match = f
                break
        if df_match is None:
            return None
        totals = {
            "PTS": int(pd.to_numeric(df_match["PTS"], errors="coerce").fillna(0).sum()),
            "REB": int(pd.to_numeric(df_match["REB"], errors="coerce").fillna(0).sum()),
            "AST": int(pd.to_numeric(df_match["AST"], errors="coerce").fillna(0).sum()),
            "STL": int(pd.to_numeric(df_match["STL"], errors="coerce").fillna(0).sum()),
            "BLK": int(pd.to_numeric(df_match["BLK"], errors="coerce").fillna(0).sum()),
        }
        # Save to cache
        _CAREER_CACHE[str(player_id)] = totals
        _save_cache()
        return totals
    except Exception:
        return None


def validate_metric(df: pd.DataFrame, metric_key: str, conn: sqlite3.Connection) -> Tuple[pd.DataFrame, List[Dict]]:
    meta = METRICS[metric_key]
    table_key = meta["table"]
    db_col = meta["db_col"]

    # Normalize columns to expected names
    # Keep top N
    leaders = df.copy()
    # Some frames include both regular and playoffs; we already requested Regular Season
    # Determine rank column dynamically (e.g., PTS_RANK, REB_RANK, ...)
    rank_col = None
    candidate_rank_cols = [f"{table_key}_RANK", "RANK", "Rank"]
    for c in candidate_rank_cols:
        if c in leaders.columns:
            rank_col = c
            break
    # Sort leaders reliably
    if rank_col:
        leaders = leaders.sort_values(rank_col, ascending=True)
    elif table_key in leaders.columns:
        leaders = leaders.sort_values(table_key, ascending=False)
    leaders = leaders.head(TOP_N)

    report_rows = []
    discrepancies = []

    for _, row in leaders.iterrows():
        # Player id/name columns vary
        player_id = None
        for pid_col in ["PLAYER_ID", "PERSON_ID", "PLAYERID", "PERSONID"]:
            if pid_col in row:
                player_id = str(row[pid_col])
                break
        if player_id is None:
            continue

        player_name = None
        for pn in ["PLAYER", "PLAYER_NAME", "PLAYER_NAME_LAST_FIRST", "DISPLAY_FIRST_LAST"]:
            if pn in row:
                player_name = str(row[pn])
                break
        if not player_name:
            player_name = "Unknown"

        # Official metric value
        official_value = None
        if table_key in row:
            official_value = row[table_key]
        elif "VALUE" in row:
            official_value = row["VALUE"]
        else:
            # try lowercase
            if table_key.lower() in row:
                official_value = row[table_key.lower()]
        try:
            official_value = int(official_value)
        except Exception:
            continue

        db_total = get_db_total(conn, player_id, db_col)
        delta = db_total - official_value

        null_season = get_null_season_type_count(conn, player_id)

        report_rows.append(
            {
                "metric": metric_key,
                "rank": int(row[rank_col]) if rank_col and rank_col in row else None,
                "player_id": player_id,
                "player": player_name,
                "nba_official": official_value,
                "db_total": db_total,
                "delta": delta,
                "null_season_type_rows": null_season,
            }
        )
        if delta != 0:
            discrepancies.append(report_rows[-1])

    return pd.DataFrame(report_rows), discrepancies


def validate_metric_fallback(metric_key: str, conn: sqlite3.Connection) -> Tuple[pd.DataFrame, List[Dict]]:
    """Fallback: compare DB top-25 for the metric to PlayerCareerStats official totals."""
    db_top = compute_db_top25(conn, metric_key)
    table_key = METRICS[metric_key]["table"]

    report_rows: List[Dict] = []
    discrepancies: List[Dict] = []

    for rank, row in enumerate(db_top.itertuples(index=False), start=1):
        player_id = str(getattr(row, "player_id"))
        player_name = getattr(row, "player")
        db_total = int(getattr(row, "db_total") or 0)

        official_totals = fetch_official_totals(player_id)
        if official_totals is None:
            nba_official: Optional[int] = None
            delta: Optional[int] = None
        else:
            nba_official = int(official_totals.get(table_key, 0))
            delta = db_total - nba_official

        null_season = get_null_season_type_count(conn, player_id)
        row_info = {
            "metric": metric_key,
            "rank": rank,
            "player_id": player_id,
            "player": player_name,
            "nba_official": nba_official,
            "db_total": db_total,
            "delta": delta,
            "null_season_type_rows": null_season,
        }
        report_rows.append(row_info)
        if delta is not None and delta != 0:
            discrepancies.append(row_info)

    return pd.DataFrame(report_rows), discrepancies


def main():
    # Preload cache in case present
    _load_cache()
    frames = fetch_alltime_leaders()
    conn = sqlite3.connect(DB_PATH)

    all_reports: List[pd.DataFrame] = []
    all_discrepancies: List[Dict] = []

    for metric_key, meta in METRICS.items():
        tbl = meta["table"]
        print(f"\nValidating top {TOP_N} all-time {metric_key}...")
        if tbl not in frames or frames[tbl] is None or frames[tbl].empty:
            print(f" - API table {tbl} missing; using PlayerCareerStats fallback on DB top-25")
            report_df, disc = validate_metric_fallback(metric_key, conn)
        else:
            report_df, disc = validate_metric(frames[tbl], metric_key, conn)
        all_reports.append(report_df)
        all_discrepancies.extend(disc)
        # Print a small summary
        mismatches = sum(1 for r in disc if r.get("delta") not in (0, None))
        print(f" - Completed {metric_key}: {len(report_df)} checked, {mismatches} mismatches")

    conn.close()

    # Concatenate and save reports
    if all_reports:
        full_report = pd.concat(all_reports, ignore_index=True)
        out_csv = "docs/reports/alltime_leaders_validation.csv"
        out_md = "docs/reports/alltime_leaders_validation.md"
        full_report.to_csv(out_csv, index=False)

        # Write a human-readable MD summary
        with open(out_md, "w", encoding="utf-8") as f:
            f.write("# All-Time Leaders Validation (Regular Season)\n\n")
            f.write("Primary: nba_api AllTimeLeadersGrids. Fallback when unavailable: DB top-25 vs nba_api PlayerCareerStats career totals.\n\n")
            if all_discrepancies:
                f.write("## Discrepancies\n\n")
                f.write("Metric | Rank | Player | DB Total | NBA Official | Delta | NULL season_type\n")
                f.write("---|---:|---|---:|---:|---:|---:\n")
                for r in all_discrepancies:
                    f.write(
                        f"{r['metric']}|{r['rank']}|{r['player']} ({r['player_id']})|{r['db_total']}|{r['nba_official']}|{r['delta']}|{r['null_season_type_rows']}\n"
                    )
            else:
                f.write("✅ No discrepancies found across checked metrics (or official totals unavailable for compared players).\n")

            f.write("\n## Notes\n")
            f.write("- DB totals computed from game_summary filtered by season_type = 'Regular Season'.\n")
            f.write("- If deltas are non-zero, first check for NULL season_type rows in player_stats.\n")
            f.write("- Next, check for missing seasons or mis-bucketed Playoffs vs Regular Season.\n")

        print(f"\nWrote: {out_csv}\nWrote: {out_md}")


if __name__ == "__main__":
    main()
