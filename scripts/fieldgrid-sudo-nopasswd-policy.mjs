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

export function hasExactRootNopasswdCommand(listing, expectedCommand) {
  if (!expectedCommand || /[\r\n]/u.test(expectedCommand)) return false;

  return listing
    .split(ENTRY_HEADER)
    .slice(1)
    .map(parseEntry)
    .some((entry) => {
      const runAsUsers = (entry.get("RunAsUsers") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const options = (entry.get("Options") ?? "")
        .split(/[,\n]/u)
        .map((value) => value.trim())
        .filter(Boolean);
      const commands = splitSudoCommands(entry.get("Commands") ?? "");

      return (
        runAsUsers.length === 1 &&
        runAsUsers[0] === "root" &&
        options.includes("!authenticate") &&
        commands.includes(expectedCommand)
      );
    });
}

function run() {
  const expectedCommand = process.argv.slice(2).join(" ");
  const listing = readFileSync(0, "utf8");

  if (!hasExactRootNopasswdCommand(listing, expectedCommand)) {
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
