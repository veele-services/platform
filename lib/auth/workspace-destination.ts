import { safeNext } from "./safe-next";

/** Reset completion chooses a workspace home, never a caller-provided URL. */
export function resetWorkspaceHome(value:unknown):"/app"|"/staff"|"/klant" {
 return value==="/staff"?"/staff":value==="/klant"?"/klant":"/app";
}
/** Already-authenticated login visits retain a bounded requested workspace.
 * This is navigation only: each destination still performs its own role check. */
export function signedInLoginDestination(value?:string|null):string {
 const next=safeNext(value);
 return /^\/(?:app|staff|klant|platform)(?:[/?#]|$)/.test(next)?next:"/app";
}
