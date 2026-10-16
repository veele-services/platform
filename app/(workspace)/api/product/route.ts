import { z } from "zod";
import { productDetail, productList, productQuery } from "@/lib/product/data";
import { productWorkspaceSchema, querySchema } from "@/lib/product/model";
import { privateFileHeaders } from "@/lib/files/private-download";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url),
      workspace = productWorkspaceSchema.parse(
        url.searchParams.get("workspace"),
      ),
      kind = z
        .enum(["ideas", "roadmap", "releases"])
        .parse(url.searchParams.get("section") ?? "releases");
    let value: unknown;
    if (url.searchParams.get("preview") === "true")
      value = await productQuery(workspace, "preview", {
        tenantId: z.uuid().parse(url.searchParams.get("tenantId")),
        group: z
          .enum(["backoffice", "staff", "customer"])
          .parse(url.searchParams.get("group")),
        id: z.uuid().parse(url.searchParams.get("id")),
        kind,
      });
    else if (url.searchParams.get("id"))
      value = await productDetail(workspace, kind, url.searchParams.get("id")!);
    else {
      const values = Object.fromEntries(
        [...url.searchParams].filter(
          ([k]) => k !== "workspace" && k !== "section",
        ),
      );
      value = await productList(workspace, kind, querySchema.parse(values));
    }
    return Response.json(value, { headers: privateFileHeaders });
  } catch (error) {
    const e = error as {
      code?: string;
    };
    if (e.code === "42501") {
      const url = new URL(request.url),
        workspace = productWorkspaceSchema.safeParse(
          url.searchParams.get("workspace"),
        );
      if (
        workspace.success &&
        url.searchParams.get("id") &&
        url.searchParams.get("preview") !== "true"
      ) {
        try {
          await productQuery(workspace.data, "access");
          return Response.json(
            { error: "Productinformatie niet beschikbaar." },
            { status: 404, headers: privateFileHeaders },
          );
        } catch {}
      }
    }
    return Response.json(
      { error: "Productinformatie niet beschikbaar." },
      {
        status:
          error instanceof z.ZodError ? 400 : e.code === "40001" ? 409 : 403,
        headers: privateFileHeaders,
      },
    );
  }
}
