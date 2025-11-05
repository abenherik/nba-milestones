"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log the error to help with debugging in dev
    // eslint-disable-next-line no-console
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      {error?.message && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-xl break-words">
          {error.message}
        </p>
      )}
      <button
        type="button"
        onClick={() => reset()}
        className="mt-2 inline-flex items-center rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 dark:focus-visible:ring-offset-zinc-900"
      >
        Try again
      </button>
    </div>
  );
}
