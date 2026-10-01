export class RequestBodyTooLargeError extends Error {
  constructor() { super("Request body too large"); }
}

/** Buffer a small Route Handler body without trusting Content-Length. */
export async function readBoundedRequestBody(request: Request, maximum: number) {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0) throw new Error("Invalid Content-Length");
    if (length > maximum) throw new RequestBodyTooLargeError();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(result.value);
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJson(request: Request, maximum: number): Promise<unknown> {
  return JSON.parse((await readBoundedRequestBody(request, maximum)).toString("utf8"));
}
