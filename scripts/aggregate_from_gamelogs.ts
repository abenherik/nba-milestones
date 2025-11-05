import { firestore } from '../src/lib/db';

type Totals = {
	points: number;
	rebounds: number;
	assists: number;
	threesMade: number;
	gamesPlayed: number;
};

type GameLogDoc = {
	playerId: string;
	season: string;
	seasonType: 'Regular Season' | 'Playoffs' | string;
	games?: Record<string, unknown>[];
};

function toNum(v: unknown, fallback = 0): number {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}

function firstDefined(obj: Record<string, unknown>, keys: string[]): unknown {
	for (const k of keys) {
		const v = obj[k];
		if (v !== undefined && v !== null) return v;
	}
	return undefined;
}

function sumFromGame(game: Record<string, unknown>) {
	// NBA playergamelog headers are upper-case: PTS, REB, AST, FG3M
	// But be resilient to other casings/aliases.
	const pts = toNum(firstDefined(game, ['PTS', 'pts']));
	const ast = toNum(firstDefined(game, ['AST', 'ast']));
	const rebField = firstDefined(game, ['REB', 'reb']);
	const reb = rebField !== undefined
		? toNum(rebField)
		: (toNum(firstDefined(game, ['OREB', 'oreb'])) + toNum(firstDefined(game, ['DREB', 'dreb'])));
	const threes = toNum(firstDefined(game, ['FG3M', 'fg3m', '3PM', '3P']));
	return { pts, ast, reb, threes };
}

async function main() {
	const db = firestore;
	const includePlayoffs = String(process.env.INCLUDE_PLAYOFFS || '0') === '1';
	const targetPlayerId = process.env.PLAYER_ID ? String(process.env.PLAYER_ID) : undefined;
	const dryRun = (String(process.env.DRY_RUN || process.env.WRITE || '1') === '0') || (String(process.env.DRY_RUN || '0') === '1');

	const col = db.collection('playerGameLogs');
	const types = includePlayoffs ? ['Regular Season', 'Playoffs'] : ['Regular Season'];

	// Build query batches to avoid requiring composite indexes for multiple where clauses.
	const snapshots = [] as FirebaseFirestore.QuerySnapshot[];
	for (const t of types) {
		let q: FirebaseFirestore.Query = col.where('seasonType', '==', t);
		if (targetPlayerId) q = q.where('playerId', '==', targetPlayerId);
		// Paginate if needed; for now we assume result fits in one batch for typical usage
		const snap = await q.get();
		snapshots.push(snap);
	}

	const totalsByPlayer = new Map<string, Totals>();
	let docCount = 0;
	let gameCount = 0;

	for (const snap of snapshots) {
			for (const d of snap.docs) {
			docCount++;
				const data = d.data() as GameLogDoc;
				const pid = String((data as GameLogDoc).playerId || '');
			if (!pid) continue;
				const arr = Array.isArray(data.games) ? data.games as Record<string, unknown>[] : [];
			if (!totalsByPlayer.has(pid)) totalsByPlayer.set(pid, { points: 0, rebounds: 0, assists: 0, threesMade: 0, gamesPlayed: 0 });
			const tot = totalsByPlayer.get(pid)!;
			tot.gamesPlayed += arr.length;
			gameCount += arr.length;
			for (const g of arr) {
				const s = sumFromGame(g);
				tot.points += s.pts;
				tot.rebounds += s.reb;
				tot.assists += s.ast;
				tot.threesMade += s.threes;
			}
		}
	}

	console.log(`Aggregated ${gameCount} games from ${docCount} playerGameLogs docs across ${totalsByPlayer.size} players`);

	const batch = db.batch();
	const now = Date.now();
	let writes = 0;
	for (const [playerId, t] of totalsByPlayer.entries()) {
		const ref = db.collection('careerTotals').doc(playerId);
		if (!dryRun) batch.set(ref, { playerId, ...t, updatedAt: now }, { merge: true });
		writes++;
	}
	if (dryRun) {
		console.log(`[DRY RUN] Would write ${writes} careerTotals docs`);
	} else {
		await batch.commit();
		console.log(`Wrote ${writes} careerTotals docs`);
	}
}

main().catch(e => { console.error(e); process.exit(1); });

