// Firestore has been removed from this project.
// This file remains as a compatibility shim for legacy imports.
// Do not use in new code.

// Removed unused NeverUse type.

function removed(name: string): never {
	throw new Error(`Firestore '${name}' is removed. Use SQLite equivalents instead.`);
}

export const firestore: any = new Proxy({}, {
	get: () => removed('firestore'),
	apply: () => removed('firestore'),
});

export const playersCol = () => removed('playersCol');
export const statsCol = () => removed('statsCol');
export const watchlistCol = () => removed('watchlistCol');
