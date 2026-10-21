import { cache } from "react";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { db } from "@/db";
import { userTable } from "@/db/schema";
import { isLocalDevBypassAuth } from "@/lib/local-repo/config";
import { getLocalDevUser } from "@/lib/local-repo/dev-user";

const getServerSession = cache(async () => {
  if (isLocalDevBypassAuth()) {
    const base = getLocalDevUser();
    try {
      const row = await db.query.userTable.findFirst({
        where: eq(userTable.id, base.id),
      });
      if (row) {
        return {
          user: {
            ...base,
            name: row.name || base.name,
            image: row.image ?? base.image,
            email: row.email || base.email,
            githubUsername: row.githubUsername ?? base.githubUsername,
          },
          session: { id: "local-dev-session" },
        };
      }
    } catch {
      // DB optional in some local setups
    }
    return { user: base, session: { id: "local-dev-session" } };
  }

  const auth = await getAuth();
  return auth.api.getSession({
    headers: await headers(),
  });
});

const requireApiUserSession = async () => {
  if (isLocalDevBypassAuth()) {
    const session = await getServerSession();
    return { user: session!.user };
  }

  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    return {
      response: Response.json(
        { status: "error", message: "未登录或登录已过期，请重新登录。" },
        { status: 401 },
      ),
    };
  }

  return { user: session.user };
};

export { getServerSession, requireApiUserSession };
