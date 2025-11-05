export const dynamic = 'force-dynamic';

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">About NBA Milestones</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        This app tracks NBA players and milestones with a focus on accuracy and transparency. Career totals can be
        viewed from two sources: Official box scores (sum of per-game values), or League-adjusted season totals
        (box scores plus per-season deltas to match official league totals).
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Data sources and modes</h2>
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li>
            <b>Official box scores</b>: Totals are calculated by summing per-game stats in <code>game_summary</code>.
            This reflects exactly what was ingested game-by-game. Toggle “Include Playoffs” to add playoff games.
          </li>
          <li>
            <b>League-adjusted season totals</b>: Adds per-season adjustments from <code>season_totals_override</code>
            to align each player’s Regular Season (or All) career totals with NBA official season totals. This makes
            the leaderboard match the league’s published numbers when historical game-by-game coverage is incomplete.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Why boxscores vs league-adjusted can differ</h2>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Older seasons can have gaps or inconsistencies in per-game data from public box score sources. When our
          per-game ingestion undercounts a player’s stat in one or more seasons, the <b>boxscores</b> mode will show a
          lower career total. The <b>league</b> mode uses <code>season_totals_override</code> to apply precise
          per-season deltas so that Regular Season career totals match the official NBA figures.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Maurice Cheeks example (steals)</h2>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          In boxscores mode, Maurice Cheeks currently shows 1,806 Regular Season steals, which is the sum of his
          official box score steals. The NBA’s official Regular Season total is 2,310. The
          difference (+504) exists because the original box scores are kept as they were but NBA makes correction which is only applied on a season level.
          <br />
          Other cases are Guy Rodgers and Bob Cousy who have more assists than what appears in the official box scores.
          
          For modern players the box score will match the season adjusted scores
        </p>
      </section>

     
    </div>
  );
}
