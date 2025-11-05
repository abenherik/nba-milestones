export function parseYMD(raw: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!raw) return null;
  const s = String(raw);
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return { y: Number(mIso[1]), m: Number(mIso[2]), d: Number(mIso[3]) };
  return null;
}

export function currentAgeOn(date: Date, birthRaw: string | null | undefined): number | null {
  const b = parseYMD(birthRaw || undefined);
  if (!b) return null;
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  let age = y - b.y;
  if (m < b.m || (m === b.m && d < b.d)) age--;
  return age;
}

export function isInHunt(birthRaw: string | null | undefined, cutoffAge: number, active: boolean | null | undefined, refDate: Date = new Date()): boolean {
  if (!active) return false;
  const ageNow = currentAgeOn(refDate, birthRaw);
  if (ageNow === null) return false;
  return ageNow < cutoffAge;
}
