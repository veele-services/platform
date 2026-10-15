const transientConnectionCodes = new Set([
  "UND_ERR_SOCKET", "ECONNRESET", "EPIPE", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT",
]);

function isTransientConnectionError(error: unknown): boolean {
  if (!(error instanceof TypeError) || !(error.cause instanceof Error)) return false;
  return "code" in error.cause && transientConnectionCodes.has(String(error.cause.code));
}

/** Retry a dropped server connection only for reads, never RPCs, writes or mail. */
export function createReadResilientFetch(fetcher: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined;
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const signal = init?.signal ?? request?.signal;
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetcher(input, init);
      } catch (error) {
        if (!['GET', 'HEAD'].includes(method) || signal?.aborted || attempt >= 2 || !isTransientConnectionError(error)) throw error;
        await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 100 : 250));
        signal?.throwIfAborted();
      }
    }
  };
}
