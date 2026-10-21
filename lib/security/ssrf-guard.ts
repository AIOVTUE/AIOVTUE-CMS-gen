import "server-only";

import dns from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
]);

const IPV4_MAPPED_PREFIX = "::ffff:";

const isPrivateOrReservedIpv4 = (ip: string) => {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
};

const isPrivateOrReservedIp = (ip: string) => {
  const normalized = ip.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 / ::ffff:7f00:1)
  if (normalized.startsWith(IPV4_MAPPED_PREFIX)) {
    const mapped = normalized.slice(IPV4_MAPPED_PREFIX.length);
    if (mapped.includes(".")) {
      return isPrivateOrReservedIpv4(mapped);
    }
    // dotted-quad alternative: ::ffff:7f00:1
    const hexParts = mapped.split(":");
    if (hexParts.length === 2) {
      const hi = Number.parseInt(hexParts[0]!, 16);
      const lo = Number.parseInt(hexParts[1]!, 16);
      if (!Number.isFinite(hi) || !Number.isFinite(lo)) return true;
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      const c = (lo >> 8) & 0xff;
      const d = lo & 0xff;
      return isPrivateOrReservedIpv4(`${a}.${b}.${c}.${d}`);
    }
    return true;
  }

  if (isIP(normalized) === 4) {
    return isPrivateOrReservedIpv4(normalized);
  }

  if (isIP(normalized) === 6) {
    if (normalized === "::1") return true;
    // Unique local, link-local, multicast, unspecified, documentation, etc.
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("fe80:")) return true;
    if (normalized.startsWith("ff")) return true;
    if (normalized === "::") return true;
    if (normalized.startsWith("2001:db8:")) return true;
    return false;
  }

  return true;
};

const assertPublicAddress = (address: string) => {
  if (isPrivateOrReservedIp(address)) {
    throw Object.assign(new Error("不允许访问内网或保留地址。"), { status: 400 });
  }
};

const DNS_CACHE_TTL_MS = 30_000;
const dnsCache = new Map<string, { addresses: string[]; expiresAt: number }>();
const dnsInflight = new Map<string, Promise<string[]>>();

const resolvePublicAddresses = async (hostname: string) => {
  const key = hostname.trim().toLowerCase();
  const cached = dnsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.addresses;
  }

  const pending = dnsInflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    let records: Array<{ address: string }> = [];
    try {
      const lookup: unknown = await dns.lookup(key, {
        all: true,
        verbatim: true,
      });
      if (Array.isArray(lookup)) {
        for (const item of lookup) {
          const address =
            item && typeof item === "object" && "address" in item
              ? String((item as { address: unknown }).address ?? "")
              : "";
          if (address) records.push({ address });
        }
      } else if (lookup && typeof lookup === "object" && "address" in lookup) {
        const address = String((lookup as { address: unknown }).address ?? "");
        if (address) records.push({ address });
      }
    } catch {
      throw Object.assign(new Error("无法解析主机地址。"), { status: 400 });
    }

    if (records.length === 0) {
      throw Object.assign(new Error("无法解析主机地址。"), { status: 400 });
    }

    for (const record of records) {
      assertPublicAddress(record.address);
    }

    const addresses = records.map((record) => record.address);
    dnsCache.set(key, {
      addresses,
      expiresAt: Date.now() + DNS_CACHE_TTL_MS,
    });
    return addresses;
  })().finally(() => {
    dnsInflight.delete(key);
  });

  dnsInflight.set(key, promise);
  return promise;
};

export const assertSafeOutboundUrl = async (rawUrl: string) => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw Object.assign(new Error("URL 格式无效。"), { status: 400 });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw Object.assign(new Error("仅允许 http:// 或 https:// 地址。"), {
      status: 400,
    });
  }

  if (url.username || url.password) {
    throw Object.assign(new Error("URL 中不能包含用户名或密码。"), { status: 400 });
  }

  const hostname = url.hostname.trim().toLowerCase();
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost")) {
    throw Object.assign(new Error("不允许访问该主机。"), { status: 400 });
  }

  if (isIP(hostname)) {
    assertPublicAddress(hostname);
    return url;
  }

  await resolvePublicAddresses(hostname);
  return url;
};

/** Fetch a URL that was already returned by `assertSafeOutboundUrl` (same-origin derived OK). */
export const fetchValidatedOutboundUrl = async (
  url: URL,
  init?: RequestInit,
) => {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw Object.assign(new Error("仅允许 http:// 或 https:// 地址。"), {
      status: 400,
    });
  }
  if (url.username || url.password) {
    throw Object.assign(new Error("URL 中不能包含用户名或密码。"), { status: 400 });
  }

  // Re-resolve immediately before fetch to shrink DNS-rebinding windows.
  const hostname = url.hostname.trim().toLowerCase();
  if (isIP(hostname)) {
    assertPublicAddress(hostname);
  } else {
    await resolvePublicAddresses(hostname);
  }

  return fetch(url.toString(), {
    ...init,
    redirect: "manual",
  });
};

export const safeOutboundFetch = async (
  rawUrl: string,
  init?: RequestInit,
) => {
  const url = await assertSafeOutboundUrl(rawUrl);
  return fetchValidatedOutboundUrl(url, init);
};
