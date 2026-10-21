import { and, eq, sql } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { db } from "@/db";
import { collaboratorInviteTable, collaboratorTable } from "@/db/schema";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { logServerError } from "@/lib/security/scrub-secrets";

export const dynamic = "force-dynamic";

type InviteState =
  | { status: "unavailable" }
  | { status: "wrong_account" }
  | { status: "ready"; destinationPath: string }
  | {
      status: "otp_required";
      maskedEmail: string;
      destinationPath: string;
    };

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const getInvite = async (token: string) => {
  const invite = await db.query.collaboratorInviteTable.findFirst({
    where: eq(collaboratorInviteTable.token, token),
  });

  if (!invite) return null;

  if (invite.expiresAt <= new Date()) {
    await db
      .delete(collaboratorInviteTable)
      .where(eq(collaboratorInviteTable.id, invite.id));
    return null;
  }

  const collaborator = await db.query.collaboratorTable.findFirst({
    where: and(
      sql`lower(${collaboratorTable.email}) = lower(${invite.email})`,
      sql`lower(${collaboratorTable.owner}) = lower(${invite.owner})`,
      sql`lower(${collaboratorTable.repo}) = lower(${invite.repo})`,
    ),
  });

  if (!collaborator) {
    await db
      .delete(collaboratorInviteTable)
      .where(eq(collaboratorInviteTable.id, invite.id));
    return null;
  }

  return invite;
};

const getDestinationPath = (invite: typeof collaboratorInviteTable.$inferSelect) => {
  return `/${encodeURIComponent(invite.owner)}/${encodeURIComponent(invite.repo)}`;
};

const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;

  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(1, name.length - visible.length))}@${domain}`;
};

const claimInvite = async (
  invite: typeof collaboratorInviteTable.$inferSelect,
  user: { id: string; email: string },
) => {
  if (normalizeEmail(user.email) !== normalizeEmail(invite.email)) {
    return false;
  }

  await db
    .update(collaboratorTable)
    .set({ userId: user.id })
    .where(
      and(
        sql`lower(${collaboratorTable.email}) = lower(${invite.email})`,
        sql`lower(${collaboratorTable.owner}) = lower(${invite.owner})`,
        sql`lower(${collaboratorTable.repo}) = lower(${invite.repo})`,
      ),
    );

  await db
    .delete(collaboratorInviteTable)
    .where(eq(collaboratorInviteTable.id, invite.id));

  return true;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const invite = await getInvite(token);
  if (!invite) {
    return Response.json({ status: "unavailable" } satisfies InviteState);
  }

  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  const destinationPath = getDestinationPath(invite);

  if (!session?.user) {
    // Never return the raw invite email unauthenticated.
    return Response.json({
      status: "otp_required",
      maskedEmail: maskEmail(invite.email),
      destinationPath,
    } satisfies InviteState);
  }

  const claimed = await claimInvite(invite, session.user);
  if (!claimed) {
    return Response.json({ status: "wrong_account" } satisfies InviteState);
  }

  return Response.json({
    status: "ready",
    destinationPath,
  } satisfies InviteState);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const invite = await getInvite(token);
    if (!invite) {
      return Response.json({ status: "unavailable" } satisfies InviteState, {
        status: 404,
      });
    }

    const body = await request.json().catch(() => null);
    const action =
      body && typeof body === "object" && typeof body.action === "string"
        ? body.action
        : "claim";

    const auth = await getAuth();

    if (action === "send-otp") {
      await auth.api.sendVerificationOTP({
        body: { email: invite.email, type: "sign-in" },
      });
      return Response.json({ status: "success" });
    }

    if (action === "verify-otp") {
      const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
      if (!/^\d{6}$/.test(otp)) {
        throw createHttpError("请输入 6 位验证码。", 400);
      }

      await auth.api.signInEmailOTP({
        body: { email: invite.email, otp },
        headers: request.headers,
      });

      const session = await auth.api.getSession({
        headers: request.headers,
      });
      if (!session?.user) {
        throw createHttpError("登录失败，请重试。", 401);
      }

      const claimed = await claimInvite(invite, session.user);
      if (!claimed) {
        return Response.json({ status: "wrong_account" } satisfies InviteState, {
          status: 403,
        });
      }

      return Response.json({
        status: "ready",
        destinationPath: getDestinationPath(invite),
      } satisfies InviteState);
    }

    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.user) {
      return Response.json({ status: "unavailable" } satisfies InviteState, {
        status: 401,
      });
    }

    const claimed = await claimInvite(invite, session.user);
    if (!claimed) {
      return Response.json({ status: "wrong_account" } satisfies InviteState, {
        status: 403,
      });
    }

    return Response.json({
      status: "ready",
      destinationPath: getDestinationPath(invite),
    } satisfies InviteState);
  } catch (error: unknown) {
    logServerError(error, "collaborator-invites/[token]");
    return toErrorResponse(error);
  }
}
