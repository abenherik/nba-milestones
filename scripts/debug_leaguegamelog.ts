import {
  fetchLeagueGameLog,
  getCurrentSeason,
  type NBALeagueGameLogRow,
} from '../src/lib/nba-api.js';

function fmtMmDdYyyy(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function fmtIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sample(rows: NBALeagueGameLogRow[], n = 3) {
  return rows
    .slice(0, n)
    .map(r => ({
      GAME_DATE: (r as any).GAME_DATE,
      PLAYER_ID: (r as any).PLAYER_ID,
      GAME_ID: (r as any).GAME_ID,
    }));
}

async function main() {
  const season = getCurrentSeason();
  const dateTo = new Date();
  const dateFrom = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

  const cases: Array<{ label: string; from?: string; to?: string }> = [
    { label: 'no range' },
    { label: 'MM/DD/YYYY', from: fmtMmDdYyyy(dateFrom), to: fmtMmDdYyyy(dateTo) },
    { label: 'YYYY-MM-DD', from: fmtIso(dateFrom), to: fmtIso(dateTo) },
  ];

  console.log({ season, from: fmtMmDdYyyy(dateFrom), to: fmtMmDdYyyy(dateTo) });

  for (const c of cases) {
    const rows = await fetchLeagueGameLog(season, 'Regular Season', c.from, c.to);
    console.log(`\n[${c.label}] rows=${rows.length}`);
    console.log('sample:', sample(rows));
    if (rows.length) {
      const gameDates = rows
        .map(r => String((r as any).GAME_DATE ?? ''))
        .filter(Boolean);
      console.log('minDate:', gameDates[0], 'maxDate:', gameDates[gameDates.length - 1]);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
