import { handleLeadRequest } from "@/app/api/_lib/forms";

export async function POST(request: Request) {
  return handleLeadRequest(request, ["contact", "sollicitatie"]);
}
