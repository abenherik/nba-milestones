'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
      <pre className="text-xs whitespace-pre-wrap bg-zinc-100 dark:bg-zinc-800 p-3 rounded mb-3">{String(error?.message || error)}</pre>
      <button onClick={() => reset()} className="px-3 py-1 rounded bg-blue-600 text-white">Try again</button>
    </div>
  );
}
