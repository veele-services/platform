import { z } from "zod";
import { travelDay, travelGeometry, manualTravel } from "@/lib/travel/service";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/http/request-body";
export async function POST(request: Request) {
  const headers = { "cache-control": "private, no-store" };
  try {
    const origin = request.headers.get("origin");
    if (
      !origin ||
      new URL(origin).host !== request.headers.get("host") ||
      ((process.env.DEPLOY_TARGET ?? "local") !== "local" &&
        new URL(origin).protocol !== "https:") ||
      !request.headers.get("content-type")?.startsWith("application/json")
    )
      return Response.json(
        { error: "Deze aanvraag is niet toegestaan." },
        { status: 403, headers },
      );
    const input = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("day"),
          day: z.string().date(),
          personId: z.string().uuid().optional(),
        }),
        z.object({
          action: z.literal("geometry"),
          day: z.string().date(),
          assignmentId: z.string().uuid(),
          direction: z.enum(["before", "after"]),
        }),
        z
          .object({
            action: z.literal("manual"),
            day: z.string().date(),
            assignmentId: z.string().uuid(),
            direction: z.enum(["before", "after"]),
            expectedSignature: z.string().regex(/^[a-f0-9]{64}$/),
            minutes: z.number().int().min(0).max(2880).nullable(),
            metres: z.number().min(0).max(10000000).nullable(),
            reason: z.string().trim().max(500),
          })
          .refine((v) => v.minutes === null || v.reason.length >= 3),
      ])
      .parse(await readBoundedJson(request, 4096));
    if (input.action === "day")
      return Response.json(await travelDay(input.day, input.personId), {
        headers,
      });
    if (input.action === "geometry")
      return Response.json(
        await travelGeometry(input.day, input.assignmentId, input.direction),
        { headers },
      );
    await manualTravel(input);
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    if (e instanceof RequestBodyTooLargeError)
      return Response.json({ error: "Deze aanvraag is te groot." }, { status: 413, headers });
    const error =
      e instanceof z.ZodError
        ? "Controleer de reisgegevens."
        : e instanceof Error &&
            !/cookie|token|supabase|https:|jwt/i.test(e.message)
          ? e.message
          : "Reisgegevens tijdelijk niet beschikbaar. Log zo nodig opnieuw in.";
    return Response.json({ error }, { status: 400, headers });
  }
}
