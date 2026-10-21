import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

async function resolveHandlers() {
  const auth = await getAuth();
  return toNextJsHandler(auth);
}

export async function GET(request: Request) {
  const { GET: handler } = await resolveHandlers();
  return handler(request);
}

export async function POST(request: Request) {
  const { POST: handler } = await resolveHandlers();
  return handler(request);
}
