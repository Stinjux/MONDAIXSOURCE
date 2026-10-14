// GET /api/data — export JSON des leads (Bearer ADMIN_PASSWORD ou session administrateur).
import { requestAuthorized } from "@/lib/auth";
import { latestRuns, loadProducts } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requestAuthorized(request, "admin"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [{ products }, imports] = await Promise.all([loadProducts(), latestRuns(10)]);
  return Response.json({ products, imports });
}
