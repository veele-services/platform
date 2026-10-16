import { z } from "zod";
import {
  authorizedFileResponse,
  privateFileHeaders,
  type PrivateFile,
} from "@/lib/files/private-download";
import { productQuery } from "@/lib/product/data";
import { productWorkspaceSchema } from "@/lib/product/model";
export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const id = z.uuid().parse((await params).id),
      workspace = productWorkspaceSchema.parse(
        new URL(request.url).searchParams.get("workspace"),
      );
    return await authorizedFileResponse(
      async () =>
        z
          .object({
            bucket: z.literal("product-documents"),
            path: z.string(),
            scope: z.array(z.string()),
            name: z.string(),
            mime: z.string(),
            sha256: z.string(),
          })
          .parse(
            await productQuery(workspace, "file", { id }),
          ) satisfies PrivateFile,
      "inline",
    );
  } catch {
    return new Response("Bijlage niet beschikbaar", {
      status: 404,
      headers: privateFileHeaders,
    });
  }
}
