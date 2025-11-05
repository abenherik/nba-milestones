import { firestore, playersCol } from '../src/lib/db';
import fs from 'node:fs';
import path from 'node:path';

type Metric = 'points' | 'rebounds' | 'assists' | 'steals';

function metricField(metric: Metric): string {
  switch (metric) {
    case 'points': return 'points';
    case 'rebounds': return 'rebounds';
    case 'assists': return 'assists';
    case 'steals': return 'steals';
    default: return 'points';
  }
}

async function getPlayerName(playerId: string): Promise<string> {
  try {
    const snap = await playersCol().doc(String(playerId)).get();
    if (snap.exists) {
      const d = snap.data() as { full_name?: string } | undefined;
      if (d?.full_name) return d.full_name;
    }
  } catch {
    // ignore
  }
  // CSV fallback
  try {
    const file = path.resolve(process.cwd(), 'data', 'players.csv');
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, 'utf8');
      const lines = text.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts[0] === String(playerId)) return parts[1] || String(playerId);
      }
    }
  } catch {
    // ignore
  }
  return String(playerId);
}

async function buildTotals(metric: Metric, includePlayoffs: boolean) {
  const field = metricField(metric);
  const col = firestore.collection('careerTotals');
  const snap = await col.get();

  const rows: Array<{ playerId: string; value: number; name?: string }> = [];
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const base = Number(data[field] ?? 0);
    let value = base;
    // Optional playoffs nested field support if present
    if (includePlayoffs) {
      const playoffs = (data['playoffs'] as Record<string, unknown> | undefined) || undefined;
      if (playoffs && typeof playoffs[field] === 'number') {
        value += Number(playoffs[field] || 0);
      }
    }
    if (!Number.isFinite(value) || value <= 0) continue;
    rows.push({ playerId: d.id, value });
  }

  // Enrich names (best-effort)
  for (let i = 0; i < rows.length; i++) {
    rows[i].name = await getPlayerName(rows[i].playerId);
  }

  rows.sort((a, b) => b.value - a.value);
  const top25 = rows.slice(0, 25);

  return {
    metric,
    includePlayoffs,
    top25,
    definition: includePlayoffs ? 'All-time totals including playoffs' : 'All-time totals (regular season only)',
    updatedAt: Date.now(),
  };
}

async function main() {
  const metric = (String(process.env.METRIC || 'rebounds') as Metric);
  const writeFs = String(process.env.FS_EXPORT || '0') === '1';
  const writeDb = String(process.env.DB_WRITE || '1') !== '0';

  for (const includePlayoffs of [false, true]) {
    const res = await buildTotals(metric, includePlayoffs);
    const keyBase = `${metric}Totals`;
    const key = includePlayoffs ? `${keyBase}_ALL` : keyBase;

    if (writeDb) {
      const ref = firestore.collection('leaderboards').doc(key);
      await ref.set({
        metric: res.metric,
        includePlayoffs: res.includePlayoffs,
        definition: res.definition,
        top25: res.top25.map(r => ({ playerId: r.playerId, value: r.value, name: r.name })),
        updatedAt: res.updatedAt,
      }, { merge: true });
      console.log(`Wrote Firestore leaderboards/${key}`);
    }

    if (writeFs) {
      const dir = path.resolve(process.cwd(), 'data', 'cache', 'leaderboards');
      fs.mkdirSync(dir, { recursive: true });
      const outFile = path.join(dir, `${key}.json`);
      const payload = {
        metric: res.metric,
        includePlayoffs: res.includePlayoffs,
        definition: res.definition,
        top25: res.top25.map(r => ({ playerId: r.playerId, value: r.value, name: r.name })),
        updatedAt: res.updatedAt,
      };
      fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
      console.log(`Wrote FS ${outFile}`);
    }
  }

  console.log('Totals leaderboard complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
