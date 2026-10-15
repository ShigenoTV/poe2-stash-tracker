// Écrit dans $GITHUB_OUTPUT (ou affiche) la section du CHANGELOG de la version de package.json,
// reprise comme texte de la release GitHub.
import { appendFileSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const lines = readFileSync("CHANGELOG.md", "utf8").split(/\r?\n/);
const start = lines.findIndex((l) => new RegExp(`^##\\s+v?${version.replace(/\./g, "\\.")}\\b`).test(l));
let body = "Voir les commits depuis la version précédente.";
if (start >= 0) {
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  body = lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim() || body;
} else {
  console.warn(`::warning::Pas de section ${version} dans CHANGELOG.md`);
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `body<<NOTES_EOF\n${body}\nNOTES_EOF\n`);
else console.log(body);
