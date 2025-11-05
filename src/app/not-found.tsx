export default function NotFound() {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="text-xl font-semibold">Page not found</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">The page you are looking for doesn’t exist.</p>
      <a href="/" className="text-blue-600 hover:underline">Go home</a>
    </div>
  );
}
