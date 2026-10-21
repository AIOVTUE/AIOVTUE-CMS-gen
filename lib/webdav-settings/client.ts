import "server-only";

import { scrubSecrets } from "@/lib/security/scrub-secrets";
import {
  assertSafeOutboundUrl,
  fetchValidatedOutboundUrl,
} from "@/lib/security/ssrf-guard";

const joinUrl = (base: string, path: string) => {
  const baseUrl = new URL(base.endsWith("/") ? base : `${base}/`);
  const normalized = path.replace(/^\/+/, "");
  const url = new URL(normalized, baseUrl);
  if (url.origin !== baseUrl.origin) {
    throw Object.assign(new Error("WebDAV 路径无效。"), { status: 400 });
  }
  return url;
};

const basicAuthHeader = (username: string, password: string) => {
  const raw = `${username}:${password}`;
  const token =
    typeof Buffer !== "undefined"
      ? Buffer.from(raw, "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(raw)));
  return `Basic ${token}`;
};

const parentDirPaths = (filePath: string): string[] => {
  const parts = filePath
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  if (parts.length <= 1) return [];
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    dirs.push(parts.slice(0, i).join("/"));
  }
  return dirs;
};

const isRedirectStatus = (status: number) =>
  status === 301 ||
  status === 302 ||
  status === 303 ||
  status === 307 ||
  status === 308;

/**
 * fetchValidatedOutboundUrl uses redirect:"manual". WebDAV servers (Nextcloud etc.)
 * often 302 to add a trailing slash or canonicalize the path — follow same-origin only.
 */
const fetchWebdav = async (
  startUrl: URL,
  init: RequestInit,
  maxRedirects = 5,
): Promise<Response> => {
  let current = startUrl;
  let method = (init.method || "GET").toUpperCase();
  let body = init.body;
  const headers = new Headers(init.headers);

  for (let i = 0; i <= maxRedirects; i += 1) {
    const response = await fetchValidatedOutboundUrl(current, {
      ...init,
      method,
      headers,
      body,
      cache: "no-store",
    });

    if (!isRedirectStatus(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw Object.assign(new Error("WebDAV 重定向地址无效。"), { status: 400 });
    }

    // Re-validate target (SSRF); must stay on same origin as configured base.
    if (next.origin !== startUrl.origin) {
      throw Object.assign(
        new Error("WebDAV 重定向到了不同域名，已拒绝。"),
        { status: 400 },
      );
    }
    await assertSafeOutboundUrl(next.toString());

    // 303 / POST→GET style: drop body for safety on collection probes
    if (response.status === 303 || method === "POST") {
      method = "GET";
      body = undefined;
      headers.delete("Content-Type");
      headers.delete("Content-Length");
    }

    current = next;
  }

  throw Object.assign(new Error("WebDAV 重定向次数过多。"), { status: 400 });
};

const authFailure = (status: number) => {
  if (status === 401 || status === 403) {
    throw Object.assign(new Error("WebDAV 认证失败，请检查用户名与密码。"), {
      status: 401,
    });
  }
};

const ensureDirs = async (options: {
  validatedBase: URL;
  username: string;
  password: string;
  remoteFilePath: string;
}) => {
  const headers = {
    Authorization: basicAuthHeader(options.username, options.password),
  };
  for (const dir of parentDirPaths(options.remoteFilePath)) {
    const endpoint = joinUrl(options.validatedBase.toString(), `${dir}/`);
    const response = await fetchWebdav(endpoint, {
      method: "MKCOL",
      headers,
    });
    // 201 created; 405/409/exists; 200/204 ok
    if (
      response.ok ||
      response.status === 405 ||
      response.status === 409 ||
      response.status === 423
    ) {
      continue;
    }
    authFailure(response.status);
    const text = await response.text().catch(() => "");
    throw Object.assign(
      new Error(
        scrubSecrets(
          text.trim() || `创建 WebDAV 目录失败（${response.status}）`,
        ),
      ),
      {
        status:
          response.status >= 400 && response.status < 600
            ? response.status
            : 500,
      },
    );
  }
};

export const uploadWebdavFile = async (options: {
  baseUrl: string;
  username: string;
  password: string;
  remotePath: string;
  body: string;
  contentType?: string;
}) => {
  const baseUrl = options.baseUrl.trim().replace(/\/$/, "");
  const username = options.username.trim();
  const password = options.password;
  const remotePath = options.remotePath.trim().replace(/^\/+/, "");
  if (!baseUrl || !username || !password) {
    throw Object.assign(new Error("请先配置 WebDAV 地址、用户名与密码。"), {
      status: 400,
    });
  }
  if (!remotePath || remotePath.includes("..")) {
    throw Object.assign(new Error("WebDAV 远程路径无效。"), { status: 400 });
  }

  const validatedBase = await assertSafeOutboundUrl(baseUrl);
  await ensureDirs({
    validatedBase,
    username,
    password,
    remoteFilePath: remotePath,
  });

  const endpoint = joinUrl(validatedBase.toString(), remotePath);
  const response = await fetchWebdav(endpoint, {
    method: "PUT",
    headers: {
      Authorization: basicAuthHeader(username, password),
      "Content-Type": options.contentType || "application/json; charset=utf-8",
    },
    body: options.body,
  });

  authFailure(response.status);
  if (!response.ok && response.status !== 201 && response.status !== 204) {
    const text = await response.text().catch(() => "");
    throw Object.assign(
      new Error(
        scrubSecrets(
          text.trim() || `上传到 WebDAV 失败（${response.status}）`,
        ),
      ),
      {
        status:
          response.status >= 400 && response.status < 600
            ? response.status
            : 500,
      },
    );
  }

  return { remotePath: `/${remotePath}`, status: response.status };
};

const isTestSuccess = (status: number) =>
  status === 200 ||
  status === 204 ||
  status === 207 ||
  status === 404 ||
  status === 405;

export const testWebdavConnection = async (options: {
  baseUrl: string;
  username: string;
  password: string;
}) => {
  const baseUrl = options.baseUrl.trim().replace(/\/$/, "");
  const username = options.username.trim();
  const password = options.password;
  if (!baseUrl || !username || !password) {
    throw Object.assign(new Error("请先配置 WebDAV 地址、用户名与密码。"), {
      status: 400,
    });
  }

  const validatedBase = await assertSafeOutboundUrl(baseUrl);
  // Prefer collection URL with trailing slash (Nextcloud often 302 without it).
  const collectionUrl = new URL(
    validatedBase.pathname.endsWith("/")
      ? validatedBase.toString()
      : `${validatedBase.toString()}/`,
  );
  const auth = basicAuthHeader(username, password);

  // 1) PROPFIND Depth:0
  let response = await fetchWebdav(collectionUrl, {
    method: "PROPFIND",
    headers: {
      Authorization: auth,
      Depth: "0",
      Accept: "*/*",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>`,
  });

  if (!isTestSuccess(response.status) && response.status !== 401 && response.status !== 403) {
    // 2) Fallback HEAD / GET — some reverse proxies block PROPFIND
    response = await fetchWebdav(collectionUrl, {
      method: "HEAD",
      headers: { Authorization: auth, Accept: "*/*" },
    });
    if (!isTestSuccess(response.status) && response.status !== 401 && response.status !== 403) {
      response = await fetchWebdav(collectionUrl, {
        method: "GET",
        headers: { Authorization: auth, Accept: "*/*" },
      });
    }
  }

  authFailure(response.status);

  if (!isTestSuccess(response.status)) {
    const text = await response.text().catch(() => "");
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
    throw Object.assign(
      new Error(
        scrubSecrets(
          snippet
            ? `WebDAV 连接失败（${response.status}）：${snippet}`
            : `WebDAV 连接失败（${response.status}）`,
        ),
      ),
      {
        status:
          response.status >= 400 && response.status < 600
            ? response.status
            : 500,
      },
    );
  }

  return { ok: true as const };
};
