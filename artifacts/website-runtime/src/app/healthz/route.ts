export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export function GET(): Response {
  return Response.json(
    {
      status: "ok",
      service: "fieldgrid-website-runtime",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
