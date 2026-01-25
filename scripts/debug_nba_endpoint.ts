const NBA_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.nba.com',
  Referer: 'https://www.nba.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

async function fetchAndSummarize(url: string) {
  const r = await fetch(url, { headers: NBA_HEADERS });
  const text = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-json response
  }

  console.log('\nURL:', url);
  console.log('HTTP:', r.status, r.statusText);
  console.log('Content-Type:', r.headers.get('content-type'));

  if (!json) {
    console.log('Body (first 300 chars):', text.slice(0, 300));
    return;
  }

  const keys = Object.keys(json);
  console.log('JSON keys:', keys);
  const rs = json?.resultSets?.[0] ?? json?.resultSet;
  console.log('Has resultSet(s):', Boolean(rs));
  if (rs) {
    const headers = rs.headers ?? [];
    const rowSet = rs.rowSet ?? [];
    console.log('headers:', headers.length, 'rows:', rowSet.length);
    if (rowSet.length) {
      console.log('first row (first 6 cols):', rowSet[0].slice(0, 6));
    }
  }

  if (json?.message) console.log('message:', json.message);
  if (json?.error) console.log('error:', json.error);
}

async function main() {
  const season = '2025-26';

  const playerGameLogUrl =
    `https://stats.nba.com/stats/playergamelog?` +
    new URLSearchParams({ PlayerID: '2544', Season: season, SeasonType: 'Regular Season' }).toString();

  const leagueGameLogUrl =
    `https://stats.nba.com/stats/leaguegamelog?` +
    new URLSearchParams({
      Season: season,
      SeasonType: 'Regular Season',
      PlayerOrTeam: 'P',
      Sorter: 'DATE',
      Direction: 'ASC',
    }).toString();

  await fetchAndSummarize(playerGameLogUrl);
  await fetchAndSummarize(leagueGameLogUrl);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
