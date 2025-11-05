import React from 'react';

export function Switch({ id, defaultChecked, label }: { id: string; defaultChecked?: boolean; label: string }) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-sm select-none">
      <input id={id} type="checkbox" defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="inline-flex h-6 w-10 items-center rounded-full bg-zinc-300 peer-checked:bg-blue-600 transition-colors">
        <span className="ml-1 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
      {label}
    </label>
  );
}
