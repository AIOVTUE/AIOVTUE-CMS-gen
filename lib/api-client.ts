type ApiResponseLike = {
  status?: string;
  message?: string;
};

const parseJsonSafely = async <T = unknown>(
  response: Response,
): Promise<{ payload: T | null; rawText: string }> => {
  const rawText = await response.text();
  if (!rawText.trim()) return { payload: null, rawText };
  try {
    return { payload: JSON.parse(rawText) as T, rawText };
  } catch {
    return { payload: null, rawText };
  }
};

const requireApiSuccess = async <T = any>(
  response: Response,
  fallbackMessage: string,
): Promise<T> => {
  const contentType = response.headers.get("content-type") || "";
  const { payload, rawText } = await parseJsonSafely<T & ApiResponseLike>(response);

  if (!response.ok) {
    const message =
      payload?.message ||
      `${fallbackMessage}：${response.status} ${response.statusText || "Error"}`.trim();
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object") {
    if (contentType.includes("text/html") || /^\s*</.test(rawText)) {
      throw new Error(
        `${fallbackMessage}：服务器返回了网页而非 JSON（HTTP ${response.status}）。请确认已重新部署最新代码，并检查是否开启了 Vercel Deployment Protection。`,
      );
    }
    throw new Error(
      `${fallbackMessage}：服务器返回了空响应（HTTP ${response.status}）。`,
    );
  }

  if ("status" in payload && payload.status !== "success") {
    throw new Error(payload.message || fallbackMessage);
  }

  return payload as T;
};

export { requireApiSuccess };
