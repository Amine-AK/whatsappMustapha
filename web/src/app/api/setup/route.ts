import { handleError, jsonError, readJson } from "@/lib/api";
import { needsSetup, setup } from "@/lib/store";

export const maxDuration = 60;

/** Create the new tabs and move the customers of the old "Feuille 1" into them. */
export async function POST(request: Request) {
  const body = await readJson<{ confirm?: boolean }>(request);
  if (body instanceof Response) return body;
  if (body.confirm !== true) return jsonError("confirm is required", 400);
  try {
    if (!(await needsSetup())) return jsonError("الأوراق الجديدة كاينة من قبل", 409);
    return Response.json(await setup());
  } catch (e) {
    return handleError(e);
  }
}
