const DEFAULT_PRODUCTION_URL = 'https://nba-milestones-20250822-123137.vercel.app';

function normalizeBaseUrl(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

function pickProductionUrl(): string {
	const fromEnv =
		process.env.PRODUCTION_URL ||
		process.env.VERCEL_APP_URL ||
		process.env.NEXT_PUBLIC_VERCEL_APP_URL ||
		process.env.NEXT_PUBLIC_PRODUCTION_URL;

	return normalizeBaseUrl(fromEnv ?? DEFAULT_PRODUCTION_URL);
}

async function checkDebugEndpoint(baseUrl: string): Promise<{ ok: boolean; status?: number; bodySnippet?: string }> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 6000);

	try {
		const res = await fetch(`${baseUrl}/api/debug`, {
			signal: controller.signal,
			headers: { accept: 'application/json' },
		});

		const text = await res.text();
		return {
			ok: res.ok,
			status: res.status,
			bodySnippet: text.slice(0, 200),
		};
	} catch (err) {
		return { ok: false, bodySnippet: err instanceof Error ? err.message : String(err) };
	} finally {
		clearTimeout(timeout);
	}
}

async function main(): Promise<void> {
	const url = pickProductionUrl();
	console.log('NBA Milestones - Live Production App:');
	console.log(url);
	console.log('');

	const check = await checkDebugEndpoint(url);
	if (check.ok) {
		console.log('Status: OK (api/debug reachable)');
	} else {
		const suffix = check.status ? `HTTP ${check.status}` : 'unreachable';
		console.log(`Status: WARNING (${suffix})`);
		if (check.bodySnippet) console.log(`Details: ${check.bodySnippet}`);
	}

	console.log('');
	console.log('Status endpoints:');
	console.log('  /api/debug - Database status');
	console.log('  /api/test - Connection test');
	console.log('  /seed - Database seeding');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
