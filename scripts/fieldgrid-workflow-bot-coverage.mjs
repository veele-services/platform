#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { FIELDGRID_CRITICAL_WORKFLOWS } from "../e2e/fieldgrid/workflow-manifest.mjs";

export function validateWorkflowManifest(workflows = FIELDGRID_CRITICAL_WORKFLOWS) {
  if (!Array.isArray(workflows) || workflows.length === 0) throw new Error("Workflowmanifest is leeg.");
  const ids = new Set();
  const mutations = new Set();
  for (const workflow of workflows) {
    if (!workflow?.id || ids.has(workflow.id)) throw new Error(`Ongeldig of dubbel workflow-ID: ${workflow?.id}`);
    ids.add(workflow.id);
    if (!Array.isArray(workflow.surfaces) || workflow.surfaces.length === 0 ||
        !Array.isArray(workflow.actors) || workflow.actors.length === 0 ||
        !Array.isArray(workflow.mutations) || workflow.mutations.length === 0) {
      throw new Error(`Workflow ${workflow.id} mist surface-, actor- of mutationdekking.`);
    }
    const source = readFileSync(workflow.evidenceFile, "utf8");
    if (!source.includes(workflow.evidenceMarker)) {
      throw new Error(`Workflow ${workflow.id} mist bewijsmarker ${workflow.evidenceMarker}.`);
    }
    workflow.mutations.forEach((mutation) => mutations.add(mutation));
  }
  const requiredSurfaces = ["backoffice", "customer-pwa", "personnel-pwa"];
  const coveredSurfaces = new Set(workflows.flatMap((workflow) => workflow.surfaces));
  for (const surface of requiredSurfaces) {
    if (!coveredSurfaces.has(surface)) throw new Error(`Kritieke surface zonder workflowbewijs: ${surface}`);
  }
  return { workflows: workflows.length, mutations: mutations.size, surfaces: [...coveredSurfaces].sort() };
}

if (process.argv[1]?.endsWith("fieldgrid-workflow-bot-coverage.mjs")) {
  try {
    const summary = validateWorkflowManifest();
    console.log(`Workflowbewijsinventaris: ${summary.workflows} vastgelegde journeys, ${summary.mutations} gecontroleerde gedragingen, ${summary.surfaces.length} surfaces.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
