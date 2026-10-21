import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function normalizeHost(value: string): string {
	return value.split(",")[0]?.trim().toLowerCase() || "";
}

function resolveRequestHost(request: NextRequest): string {
	const forwarded = request.headers.get("x-forwarded-host");
	if (forwarded) return normalizeHost(forwarded);
	return normalizeHost(request.headers.get("Host") || "");
}

function hostsMatch(a: string, b: string): boolean {
	const left = normalizeHost(a).replace(/^www\./, "");
	const right = normalizeHost(b).replace(/^www\./, "");
	return Boolean(left && right && left === right);
}

function isAllowedOrigin(originHeader: string, hostHeader: string): boolean {
	try {
		return hostsMatch(new URL(originHeader).host, hostHeader);
	} catch {
		return false;
	}
}

function isAllowedReferer(refererHeader: string, hostHeader: string): boolean {
	try {
		return hostsMatch(new URL(refererHeader).host, hostHeader);
	} catch {
		return false;
	}
}

function forbidden(message: string) {
	return NextResponse.json(
		{ status: "error", message },
		{ status: 403 },
	);
}

/** True for CMS app/API routes — never treat these as static files by extension. */
function isCmsAppPath(pathname: string): boolean {
	if (pathname.startsWith("/api/")) return true;
	const parts = pathname.split("/").filter(Boolean);
	// /{owner}/{repo}/{branch}[/...]
	return parts.length >= 3;
}

export function proxy(request: NextRequest) {
	const pathname = request.nextUrl.pathname;
	// Only skip middleware work for real static files. Do NOT classify CMS
	// routes as static just because the last segment has a dot (….ts / ….md).
	const isStaticAsset =
		pathname.startsWith("/_next/") ||
		pathname === "/favicon.ico" ||
		pathname.startsWith("/icon") ||
		pathname.startsWith("/apple-icon") ||
		(/\.[a-z0-9]+$/i.test(pathname) && !isCmsAppPath(pathname));

	if (isStaticAsset) {
		return NextResponse.next();
	}

	if (
		pathname.startsWith("/api/") &&
		pathname !== "/api/webhook/github" &&
		request.method !== "GET" &&
		request.method !== "HEAD" &&
		request.method !== "OPTIONS"
	) {
		const originHeader = request.headers.get("Origin");
		const refererHeader = request.headers.get("Referer");
		const hostHeader = resolveRequestHost(request);
		const secFetchSite = (request.headers.get("Sec-Fetch-Site") || "")
			.trim()
			.toLowerCase();
		const secFetchMode = (request.headers.get("Sec-Fetch-Mode") || "")
			.trim()
			.toLowerCase();

		if (originHeader && hostHeader) {
			if (!isAllowedOrigin(originHeader, hostHeader)) {
				return forbidden("跨域请求被拒绝。");
			}
		} else if (secFetchSite === "same-origin") {
			// OK — same-origin fetch without Origin in some privacy modes
		} else if (refererHeader && hostHeader && isAllowedReferer(refererHeader, hostHeader)) {
			// OK — some browsers omit Origin but send Referer
		} else if (!originHeader && secFetchMode === "same-origin") {
			// OK
		} else if (!originHeader) {
			return forbidden("缺少 Origin，已拒绝写请求。");
		} else {
			return forbidden("跨域请求被拒绝。");
		}
	}

	const requestHeaders = new Headers(request.headers);
	const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
	requestHeaders.set("x-return-to", returnTo);

	return NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});
}

export const config = {
	matcher: "/:path*",
};
