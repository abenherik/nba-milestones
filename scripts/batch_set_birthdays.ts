import { playersCol } from '../src/lib/db';
import admin from 'firebase-admin';

const players: Array<{ id: string; name: string; dob: string }> = [
  { id: '76673', name: 'Alex English', dob: '1954-01-05' },
  { id: '947',   name: 'Allen Iverson', dob: '1975-06-07' },
  { id: '787',   name: 'Charles Barkley', dob: '1963-02-20' },
  { id: '1122',  name: 'Dominique Wilkins', dob: '1960-01-12' },
  { id: '77685', name: 'Larry Nance', dob: '1959-02-12' },
  { id: '951',   name: 'Ray Allen', dob: '1975-07-20' },
  { id: '397',   name: 'Reggie Miller', dob: '1965-08-25' },
  { id: '1713',  name: 'Vince Carter', dob: '1977-01-26' },
];

async function run() {
  const del = admin.firestore.FieldValue.delete();
  const now = Date.now();
  let ok = 0;
  for (const p of players) {
    const [first, ...rest] = p.name.split(' ').filter(Boolean);
    const last = rest.join(' ');
    const ref = playersCol().doc(p.id);
    const snap = await ref.get();
    const payload: Record<string, unknown> = {
      full_name: p.name,
      first_name: first || undefined,
      last_name: last || undefined,
      nameLower: p.name.toLowerCase(),
      player_id: p.id,
      retired: true,
      active2024_25: false,
      birthday: p.dob,
      updatedAt: now,
      birthdayVerified: del,
      birthdayVerifiedAt: del,
      birthdaySingleSourceOfTruth: del,
      birthdaySource: del,
      birthdayVerifiedBy: del,
    };
    if (!snap.exists) (payload as any).createdAt = now;
    await ref.set(payload, { merge: true });
    ok++;
  }
  console.log(`Updated ${ok} players with birthdays.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
