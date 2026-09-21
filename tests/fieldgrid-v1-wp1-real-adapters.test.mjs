import assert from "node:assert/strict";
import { test } from "node:test";
import { createWp1SupabaseAdapters } from "../scripts/fieldgrid-v1-wp1-real-adapters.mjs";

function client({ users = [], listError, removeError, deleteError } = {}) {
  const removed = [];
  return { removed, auth: { admin: { async listUsers({ page, perPage }) {
    if (listError) return { error: listError }; return { data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null };
  }, async deleteUser(id) { removed.push(`user:${id}`); return { error: deleteError ?? null }; } } }, storage: { from(bucket) { return {
    async list() { return { data: [], error: null }; }, async remove(paths) { removed.push(`${bucket}:${paths.length}`); return { error: removeError ?? null }; },
  }; } } };
}
test("Auth adapter paginates and refuses ambiguous identities without leaking provider detail", async () => {
  const users = Array.from({ length: 101 }, (_, index) => ({ id: `test-${index}` }));
  const provider = client({ users });
  const adapter = createWp1SupabaseAdapters(provider, { candidateIdentity: () => "candidate", preserveIdentity: () => false });
  assert.equal((await adapter.auth.candidates()).length, 101);
  const ambiguous = createWp1SupabaseAdapters(client({ users: [{ id: "secret-user" }] }), { candidateIdentity: () => "unknown", preserveIdentity: () => false });
  await assert.rejects(ambiguous.auth.candidates(), /ambiguous Auth identity/);
});
test("Auth adapter treats 404 as idempotent and redacts provider failures", async () => {
  const provider = client({ users: [{ id: "gone" }], deleteError: { status: 404, message: "https://secret.example/token" } });
  const adapter = createWp1SupabaseAdapters(provider, { candidateIdentity: () => "candidate", preserveIdentity: () => false });
  await adapter.auth.removeCandidatesExactly(["gone"]);
  const broken = createWp1SupabaseAdapters(client({ users: [], listError: { status: 429, message: "https://secret.example/token" } }), { candidateIdentity: () => "candidate", preserveIdentity: () => false });
  await assert.rejects(broken.auth.candidates(), (error) => !error.message.includes("secret.example"));
});
