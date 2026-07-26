#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FIELD_HEADER = /^[ \t]{4}([A-Za-z][A-Za-z]+):[ \t]*(.*)$/u;
const ENTRY_HEADER = /^Sudoers entry:(?:[ \t].*)?$/mu;

function parseEntry(rawEntry) {
  const fields = new Map();
  let currentField = "";

  for (const line of rawEntry.split(/\r?\n/u)) {
    const header = line.match(FIELD_HEADER);
    if (header) {
      currentField = header[1];
      fields.set(currentField, header[2].trim());
      continue;
    }

    if (!currentField || !/^[ \t]+/u.test(line)) continue;
    const continuation = line.trim();
    if (!continuation) continue;
    fields.set(
      currentField,
      `${fields.get(currentField) ?? ""}\n${continuation}`.trim(),
    );
  }

  return fields;
}

function splitSudoCommands(value) {
  const commands = [];
  let command = "";
  let precedingBackslashes = 0;

  const flush = () => {
    const normalized = command.trim();
    if (normalized) commands.push(normalized);
    command = "";
    precedingBackslashes = 0;
  };

  for (const character of value) {
    if (character === "," && precedingBackslashes % 2 === 0) {
      flush();
      continue;
    }
    if (character === "\n") {
      flush();
      continue;
    }

    command += character;
    precedingBackslashes = character === "\\" ? precedingBackslashes + 1 : 0;
  }
  flush();

  return commands;
}

function parseEntries(listing) {
  return listing.split(ENTRY_HEADER).slice(1).map(parseEntry);
}

function entryCommands(entry) {
  return splitSudoCommands(entry.get("Commands") ?? "");
}

function isExactRootNopasswdEntry(entry, expectedCommand) {
  const runAsUsers = (entry.get("RunAsUsers") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const options = (entry.get("Options") ?? "")
    .split(/[,\n]/u)
    .map((value) => value.trim())
    .filter(Boolean);

  return (
    runAsUsers.length === 1 &&
    runAsUsers[0] === "root" &&
    options.includes("!authenticate") &&
    entryCommands(entry).includes(expectedCommand)
  );
}

function isRelevantControl(command, expectedCommand) {
  const normalized = command.replace(/^!+/u, "").trim();
  if (normalized === expectedCommand) return true;
  if (normalized === "ALL") return true;

  // A wildcard or regex command can supersede an exact grant while still
  // authorizing the command-filtered sudo listing. Reject it fail-closed
  // instead of attempting to reimplement sudoers pattern matching.
  return /[*?[\]]/u.test(normalized) || normalized.startsWith("^");
}

function hasEffectiveCommandMatch(listing, expectedCommand) {
  if (ENTRY_HEADER.test(listing)) {
    return hasExactRootNopasswdCommand(listing, expectedCommand);
  }

  const commands = listing
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
  return commands.length === 1 && commands[0] === expectedCommand;
}

export function hasExactRootNopasswdCommand(listing, expectedCommand) {
  if (!expectedCommand || /[\r\n]/u.test(expectedCommand)) return false;

  const relevantEntries = parseEntries(listing).filter((entry) =>
    entryCommands(entry).some((command) =>
      isRelevantControl(command, expectedCommand),
    ),
  );
  const effectiveEntry = relevantEntries.at(-1);

  return (
    effectiveEntry !== undefined &&
    entryCommands(effectiveEntry).every(
      (command) =>
        !isRelevantControl(command, expectedCommand) ||
        command === expectedCommand,
    ) &&
    isExactRootNopasswdEntry(effectiveEntry, expectedCommand)
  );
}

export function hasEffectiveExactRootNopasswdCommand(
  listing,
  effectiveListing,
  expectedCommand,
) {
  return (
    hasExactRootNopasswdCommand(listing, expectedCommand) &&
    hasEffectiveCommandMatch(effectiveListing, expectedCommand)
  );
}

function run() {
  const expectedCommand = process.argv.slice(2).join(" ");
  const input = readFileSync(0, "utf8");
  const separator = input.indexOf("\0");
  const listing = separator >= 0 ? input.slice(0, separator) : "";
  const effectiveListing = separator >= 0 ? input.slice(separator + 1) : "";

  if (
    !hasEffectiveExactRootNopasswdCommand(
      listing,
      effectiveListing,
      expectedCommand,
    )
  ) {
    process.stderr.write(
      `missing exact root NOPASSWD sudo capability: ${expectedCommand}\n`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run();
}
