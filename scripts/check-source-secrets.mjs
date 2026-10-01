/** High-confidence source guard. Never prints the matching value or file content.
 * Git-ignored files and .env are intentionally not read. This is not a history scan.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync, existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const patterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
  ["sendgrid-key", /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{35,}\b/g],
  ["supabase-secret-key", /\bsb_secret_[A-Za-z0-9_-]{25,}\b/g],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})\b/g],
  ["mollie-live-key", /\blive_[A-Za-z0-9]{30,}\b/g],
];
export function secretIndicators(source) {
  const findings = [];
  const add = (kind,index) => findings.push({kind,line:source.slice(0,index).split("\n").length});
  for (const [kind, pattern] of patterns) for (const match of source.matchAll(new RegExp(pattern))) add(kind,match.index);
  for (const match of source.matchAll(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\b/g)) {
    try { if (JSON.parse(Buffer.from(match[0].split(".")[1],"base64url").toString()).role === "service_role") add("supabase-service-jwt",match.index); }
    catch { /* Not a recognized credential format. */ }
  }
  return findings;
}
function main() {
  const root = realpathSync(process.cwd());
  const files = [...new Set(execFileSync("git",["ls-files","-z","--cached","--others","--exclude-standard"],{encoding:"utf8"}).split("\0").filter(Boolean))];
  let checked=0, failures=0;
  for (const file of files) {
    const path=resolve(root,file);
    if (!existsSync(path)) continue; // A reviewed deletion is not a source file.
    const actual=realpathSync(path), stat=statSync(actual);
    if (!actual.startsWith(root+sep) || !stat.isFile() || stat.size>16*1024*1024) throw new Error("Unscannable source entry; review repository paths/large files before release.");
    const bytes=readFileSync(actual);
    if (bytes.includes(0)) continue;
    checked++;
    for (const finding of secretIndicators(bytes.toString("utf8"))) {
      failures++;
      console.error(`Potential ${finding.kind} at ${file}:${finding.line}; value withheld.`);
    }
  }
  if (failures) throw new Error("Potential credential in release sources. Remove it and assess rotation; do not print the value.");
  console.log(`${checked} text files checked for recognized credential formats; no matches. Git history and unknown formats are not covered.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch { console.error("Source credential check failed; inspect only the reported paths, never log secret values."); process.exitCode=1; }
}
