import raw from "../../CHANGELOG.md?raw";

export interface ReleaseNotes {
  version: string;
  date: string | null;
  notes: string[];
}

/** Sections publiées du CHANGELOG (« ## X.Y.Z (date) »), de la plus récente à la plus ancienne. */
export function parseChangelog(text: string): ReleaseNotes[] {
  const out: ReleaseNotes[] = [];
  let cur: ReleaseNotes | null = null;
  for (const line of text.split(/\r?\n/)) {
    const head = line.match(/^##\s+(.+?)\s*$/);
    if (head) {
      const m = head[1].match(/^v?(\d+\.\d+\.\d+)(?:\s*\(([^)]*)\))?/);
      cur = m ? { version: m[1], date: m[2] ?? null, notes: [] } : null;
      if (cur) out.push(cur);
      continue;
    }
    const item = line.match(/^[-*]\s+(.*)$/);
    if (cur && item) cur.notes.push(item[1].trim());
    else if (cur && line.trim() && cur.notes.length > 0 && /^\s+/.test(line)) cur.notes[cur.notes.length - 1] += " " + line.trim();
  }
  return out;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Notes des versions plus récentes que `seen`, jusqu'à `current` incluse ; seulement `current` si `seen` est inconnue. */
export function notesSince(all: ReleaseNotes[], seen: string | null, current: string): ReleaseNotes[] {
  return all.filter(
    (r) => compareVersions(r.version, current) <= 0 && (seen ? compareVersions(r.version, seen) > 0 : r.version === current),
  );
}

export const CHANGELOG = parseChangelog(raw);

const SEEN_KEY = "notes-seen-version";

export function loadSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function saveSeenVersion(v: string) {
  try {
    localStorage.setItem(SEEN_KEY, v);
  } catch {
    // Les notes reviendront au prochain lancement : sans gravité.
  }
}
