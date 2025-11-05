import { playersCol } from '../src/lib/db';
import admin from 'firebase-admin';

function boolEnv(name: string, def = false) {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  if (!v) return def;
  return v === '1' || v === 'true' || v === 'yes' || v === 'y';
}

async function main() {
  const playerId = String(process.env.PLAYER_ID ?? '').trim();
  const fullName = String(process.env.FULL_NAME ?? process.env.PLAYER_NAME ?? '').trim();
  const birthday = String(process.env.BIRTHDAY ?? '').trim(); // Expect YYYY-MM-DD
  const birthdayVerified = boolEnv('BIRTHDAY_VERIFIED', false);
  const birthdaySource = String(process.env.BIRTHDAY_SOURCE ?? '').trim();
  const birthdaySST = boolEnv('BIRTHDAY_SST', false);
  const birthdayVerifiedBy = String(process.env.BIRTHDAY_VERIFIED_BY ?? '').trim();
  const cleanSimple = boolEnv('CLEAN_SIMPLE', false) || boolEnv('SIMPLE', false);
  const retired = boolEnv('RETIRED', false);
  const active2024_25 = process.env.ACTIVE_2024_25 !== undefined ? boolEnv('ACTIVE_2024_25') : !retired;

  if (!playerId) throw new Error('PLAYER_ID is required');
  if (!fullName) throw new Error('FULL_NAME (or PLAYER_NAME) is required');

  const [first, ...rest] = fullName.split(' ').filter(Boolean);
  const last = rest.join(' ');

  const ref = playersCol().doc(playerId);
  const snap = await ref.get();
  const now = Date.now();
  const payload: Record<string, unknown> = {
    full_name: fullName,
    first_name: first || undefined,
    last_name: last || undefined,
    nameLower: fullName.toLowerCase(),
    player_id: playerId,
    retired,
    active2024_25,
    updatedAt: now,
  };
  if (birthday) payload.birthday = birthday; // Keep as provided, do not auto-format
  if (cleanSimple) {
    // Remove any prior metadata to keep the document minimal
    const del = admin.firestore.FieldValue.delete();
    payload.birthdayVerified = del;
    payload.birthdayVerifiedAt = del;
    payload.birthdaySingleSourceOfTruth = del;
    payload.birthdaySource = del;
    payload.birthdayVerifiedBy = del;
  } else {
    if (birthdayVerified) payload.birthdayVerified = true;
    if (birthdaySource) payload.birthdaySource = birthdaySource;
    if (birthdaySST) payload.birthdaySingleSourceOfTruth = true;
    if (birthdayVerifiedBy) payload.birthdayVerifiedBy = birthdayVerifiedBy;
    if (birthdayVerified) payload.birthdayVerifiedAt = now;
  }
  if (!snap.exists) payload.createdAt = now;

  await ref.set(payload, { merge: true });
  console.log(`Upserted player ${fullName} (${playerId})${birthday ? ` with birthday ${birthday}` : ''}. retired=${retired} active2024_25=${active2024_25}`);
}

main().catch(e => { console.error(e); process.exit(1); });
