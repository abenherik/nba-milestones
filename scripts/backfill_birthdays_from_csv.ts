import { playersCol } from "../src/lib/db";
import fs from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";

function boolEnv(name: string, def = false) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return def;
  return v === "1" || v === "true" || v === "yes" || v === "y";
}

function normalizeDateStr(s: string): string | null {
  if (!s) return null;
  const cleaned = s.replace(" 00:00:00", "");
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) return null;
  // Return YYYY-MM-DD
  return d.toISOString().slice(0, 10);
}

type CsvRow = Record<string, string>;

async function main() {
  const ONLY_RETIRED = boolEnv("ONLY_RETIRED", true);
  const OVERWRITE = boolEnv("OVERWRITE", false);
  const DRY_RUN = boolEnv("DRY_RUN", false);

  const csvPath = path.resolve(process.cwd(), "data", "raw", "csv", "common_player_info.csv");
  if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);
  const text = fs.readFileSync(csvPath, "utf8");
  const records = parseCsv(text, { columns: true, skip_empty_lines: true }) as CsvRow[];

  // Build CSV map: id -> YYYY-MM-DD
  const csvMap = new Map<string, string>();
  for (const rec of records) {
    const id = String(rec.person_id || "").trim();
    const bd = normalizeDateStr(String(rec.birthdate || "").trim());
    if (id && bd) csvMap.set(id, bd);
  }

  // Explicit corrections requested by user
  const overrides = new Map<string, string>([
    ["1882", "1979-03-11"], // Elton Brand
    ["1503", "1979-05-24"], // Tracy McGrady
    ["1112", "1974-09-10"], // Ben Wallace
    ["77147", "1947-06-19"], // George E. Johnson (ensure correct DOB)
    ["77149", "1948-12-18"], // George T. Johnson
  ]);

  let updates = 0;
  const batchSize = 400;
  let batch = (await import("firebase-admin")).default.firestore().batch();

  // We iterate docs in players collection to avoid touching unknown IDs.
  const baseQuery = ONLY_RETIRED ? playersCol().where("retired", "==", true) : playersCol();
  const snap = await baseQuery.get();
  for (const d of snap.docs) {
    const id = d.id;
    const data = d.data() as Record<string, unknown>;
    const current = data?.birthday ? String(data.birthday) : "";
    const override = overrides.get(id);
    const csv = csvMap.get(id) || null;
    let next: string | null = null;
    let reason: string | null = null;

    if (override) {
      if (current !== override) { next = override; reason = "override"; }
    } else if (!current && csv) {
      next = csv; reason = "csv";
    } else if (OVERWRITE && csv && current && current !== csv) {
      next = csv; reason = "csv-overwrite";
    }

    // Also rename George E. Johnson (77147)
    const renameGeorgeE = id === "77147" && String(data.full_name || "") === "George Johnson";

    if (next || renameGeorgeE) {
      const ref = playersCol().doc(id);
      const payload: Record<string, unknown> = { updatedAt: Date.now() };
      if (next) payload.birthday = next;
      if (renameGeorgeE) {
        payload.full_name = "George E. Johnson";
        payload.nameLower = "george e. johnson";
        payload.first_name = (data as any).first_name || "George";
        payload.last_name = (data as any).last_name || "Johnson";
      }
      if (!DRY_RUN) batch.set(ref, payload, { merge: true });
      updates++;
      if (updates % batchSize === 0) {
        if (!DRY_RUN) await batch.commit();
        batch = (await import("firebase-admin")).default.firestore().batch();
      }
      console.log(`Will update ${id}: ${next ? `birthday=${next} (${reason})` : ""}${renameGeorgeE ? "; rename to George E. Johnson" : ""}`);
    }
  }

  if (updates % batchSize !== 0) {
    if (!DRY_RUN) await batch.commit();
  }
  console.log(`Backfill completed. ${updates} player(s) updated.${DRY_RUN ? " [DRY RUN]" : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
