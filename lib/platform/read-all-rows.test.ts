import {expect, it, vi} from "vitest";
import {readAllPlatformRows} from "./read-all-rows";
it("reads beyond the API page boundary without dropping a newly provisioned tenant's templates", async () => {
  const rows = Array.from({length: 1401}, (_, id) => ({id}));
  const page = vi.fn(async (from: number, to: number) => ({data: rows.slice(from, to + 1), error: null}));
  expect((await readAllPlatformRows(page)).data).toEqual(rows);
  expect(page.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
});
it("fails closed on a later denied page instead of presenting an incomplete overview", async () => {
  const page = vi.fn().mockResolvedValueOnce({data: Array(500).fill({id: "fixture"}), error: null}).mockResolvedValueOnce({data: null, error: {message: "Denied"}});
  expect(await readAllPlatformRows(page)).toEqual({data: null, error: {message: "Denied"}});
});
