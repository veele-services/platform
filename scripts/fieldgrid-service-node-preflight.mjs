#!/usr/bin/env node

import { constants, accessSync, readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const EXPECTED_NODE_ENGINE = ">=24.0.0 <25";
const EXPECTED_NODE_MAJOR = 24;

const requiredPath = (label, value) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} path is required`);
  }
  return value;
};

const executableRealpath = (label, value) => {
  const path = requiredPath(label, value);
  try {
    accessSync(path, constants.X_OK);
    return realpathSync(path);
  } catch {
    throw new Error(`${label} is missing or not executable: ${path}`);
  }
};

const readNodeEngine = (packageJsonPath) => {
  const path = requiredPath("package.json", packageJsonPath);
  let packageJson;
  try {
    packageJson = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`package.json cannot be read: ${path}`);
  }
  const engine = packageJson.engines?.node;
  if (engine !== EXPECTED_NODE_ENGINE) {
    throw new Error(
      `repository Node engine must remain ${EXPECTED_NODE_ENGINE}; received ${engine ?? "missing"}`,
    );
  }
  return engine;
};

export const validateServiceNodePreflight = ({
  serviceNodePath,
  buildNodePath,
  packageJsonPath,
  runtimeExecPath = process.execPath,
  runtimeVersion = process.versions.node,
}) => {
  const serviceNodeRealpath = executableRealpath(
    "service Node",
    serviceNodePath,
  );
  const buildNodeRealpath = executableRealpath("build Node", buildNodePath);
  const runtimeNodeRealpath = executableRealpath(
    "preflight runtime Node",
    runtimeExecPath,
  );

  if (buildNodeRealpath !== serviceNodeRealpath) {
    throw new Error(
      `build Node ${buildNodeRealpath} differs from service Node ${serviceNodeRealpath}`,
    );
  }
  if (runtimeNodeRealpath !== serviceNodeRealpath) {
    throw new Error(
      `preflight runtime Node ${runtimeNodeRealpath} differs from service Node ${serviceNodeRealpath}`,
    );
  }

  const versionMatch =
    typeof runtimeVersion === "string"
      ? /^v?(\d+)\.(\d+)\.(\d+)$/u.exec(runtimeVersion)
      : null;
  if (!versionMatch || Number(versionMatch[1]) !== EXPECTED_NODE_MAJOR) {
    throw new Error(
      `service Node must satisfy ${EXPECTED_NODE_ENGINE}; received ${runtimeVersion ?? "missing"}`,
    );
  }

  return {
    nodeEngine: readNodeEngine(packageJsonPath),
    nodePath: serviceNodeRealpath,
    nodeVersion: runtimeVersion.replace(/^v/u, ""),
  };
};

const parseArguments = (argumentsToParse) => {
  const values = new Map();
  for (let index = 0; index < argumentsToParse.length; index += 2) {
    const name = argumentsToParse[index];
    const value = argumentsToParse[index + 1];
    if (
      !["--service-node", "--build-node", "--package-json"].includes(name) ||
      typeof value !== "string"
    ) {
      throw new Error(
        "use --service-node PATH --build-node PATH --package-json PATH",
      );
    }
    values.set(name, value);
  }
  return {
    buildNodePath: values.get("--build-node"),
    packageJsonPath: values.get("--package-json"),
    serviceNodePath: values.get("--service-node"),
  };
};

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    const result = validateServiceNodePreflight({
      ...parseArguments(process.argv.slice(2)),
    });
    process.stdout.write(
      `fieldgrid-service-node-preflight: ok path=${result.nodePath} version=${result.nodeVersion} engine="${result.nodeEngine}"\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`fieldgrid-service-node-preflight: ${message}\n`);
    process.exitCode = 1;
  }
}
