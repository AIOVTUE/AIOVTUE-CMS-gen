import "server-only";

import { randomBytes } from "crypto";
import {
  isAdminBootstrapped,
  isDbSetupComplete,
  saveBootstrapAppConfig,
} from "@/lib/app-config/store";
import { ensureDbUser } from "@/lib/ai/ensure-user";
import {
  assertValidEmail,
  assertValidPassword,
  upsertEmailLoginSettings,
} from "@/lib/email-login/settings";

/** Single-flight lock so concurrent first-run POSTs cannot both create admins. */
let bootstrapInflight: Promise<unknown> | null = null;

const assertSafeBootstrapBaseUrl = (raw: string) => {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) {
    throw Object.assign(new Error("请填写站点地址。"), { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw Object.assign(new Error("站点地址必须是有效的 http(s) URL。"), {
      status: 400,
    });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw Object.assign(new Error("站点地址必须是有效的 http(s) URL。"), {
      status: 400,
    });
  }
  if (parsed.username || parsed.password) {
    throw Object.assign(new Error("站点地址不能包含用户名或密码。"), {
      status: 400,
    });
  }
  return trimmed;
};

async function bootstrapAdminAccountUnlocked(input: {
  email: string;
  password: string;
  baseUrl: string;
}) {
  if (await isDbSetupComplete()) {
    throw Object.assign(new Error("初始化已完成，请直接登录。"), {
      status: 409,
    });
  }
  if (await isAdminBootstrapped()) {
    throw Object.assign(
      new Error("管理员账号已创建，请继续完成初始化配置。"),
      { status: 409 },
    );
  }

  const email = assertValidEmail(input.email);
  const password = assertValidPassword(input.password);
  const baseUrl = assertSafeBootstrapBaseUrl(input.baseUrl);

  await saveBootstrapAppConfig({
    baseUrl,
    adminEmails: email,
  });

  const user = await ensureDbUser({
    id: randomBytes(16).toString("hex"),
    email,
    name: email.split("@")[0] || email,
    emailVerified: true,
  });

  await upsertEmailLoginSettings({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: true,
    },
    enabled: true,
    email,
    password,
  });

  return { email };
}

export async function bootstrapAdminAccount(input: {
  email: string;
  password: string;
  baseUrl: string;
}) {
  if (bootstrapInflight) {
    await bootstrapInflight.catch(() => undefined);
    if (await isAdminBootstrapped() || (await isDbSetupComplete())) {
      throw Object.assign(
        new Error("管理员账号已创建，请登录后继续初始化。"),
        { status: 409 },
      );
    }
  }

  const run = bootstrapAdminAccountUnlocked(input);
  bootstrapInflight = run.finally(() => {
    bootstrapInflight = null;
  });
  return run;
}
