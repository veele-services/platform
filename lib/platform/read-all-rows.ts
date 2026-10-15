/** Platform administration must not silently lose rows at the Data API limit.
 * Each caller supplies a deterministic order ending in its unique key. */
export async function readAllPlatformRows<T>(page: (from: number, to: number) => PromiseLike<{data: T[] | null; error: {message: string} | null}>) {
  const size = 500, rows: T[] = [];
  for (let offset = 0; offset < 500000; offset += size) {
    const result = await page(offset, offset + size - 1);
    if (result.error) return {data: null, error: result.error};
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < size) return {data: rows, error: null};
  }
  throw new Error("Te veel platformgegevens om veilig in één overzicht te laden.");
}
