"use client";
import { useEffect, useState } from "react";

interface Player {
  id: string;
  full_name: string;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Fetch all players
    fetch("/api/players")
      .then((res) => res.json())
  .then((data) => setPlayers(data.players ?? []));
    // Fetch watchlist
    fetch("/api/watchlist")
      .then((res) => res.json())
      .then((data) => setWatchlist(data.items?.map((i: any) => i.playerId) ?? []));
  }, []);

  const toggleWatch = async (playerId: string) => {
    if (watchlist.includes(playerId)) {
      await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      setWatchlist(watchlist.filter((id) => id !== playerId));
    } else {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      setWatchlist([...watchlist, playerId]);
    }
  };

  const filtered = players.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Select Players</h1>
      <input
        type="text"
        placeholder="Search players..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 px-3 py-2 border rounded"
      />
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {filtered.map((p) => (
          <li key={p.id} className="py-3 flex items-center justify-between">
            <span>{p.full_name}</span>
            <button
              onClick={() => toggleWatch(p.id)}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                watchlist.includes(p.id)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              }`}
            >
              {watchlist.includes(p.id) ? "Watching" : "Toggle Watch"}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
