"use client";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
        <h2>App crashed</h2>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#111', color: '#eee', padding: 12, borderRadius: 8 }}>
          {String(error?.message || error)}
        </pre>
        <button onClick={() => reset()} style={{ padding: '6px 10px', marginTop: 8 }}>Reload</button>
      </body>
    </html>
  );
}
