import {
  invalidateSessionCache,
  invalidateSessionCacheByPrefix,
  peekSessionCache,
  setSessionCache,
} from "@/lib/session-memory-cache";
import type {
  MemosAdminComment,
  MemosAdminLike,
  MemosEngagePost,
  MemosPost,
  MemosSettingsPublic,
} from "@/lib/memos-settings/types";

export const MEMOS_CACHE_PREFIX = "memos:";

export type MemosPostsCache = {
  posts: MemosPost[];
  total: number;
  pageIndex: number;
  pageSize: number;
};

export type MemosEngagePostsCache = {
  posts: MemosEngagePost[];
  total: number;
  pageIndex: number;
};

export type MemosCommentsDetailCache = {
  comments: MemosAdminComment[];
  total: number;
};

export type MemosLikesDetailCache = {
  likes: MemosAdminLike[];
  total: number;
};

export function memosSettingsCacheKey() {
  return `${MEMOS_CACHE_PREFIX}settings`;
}

export function memosPostsCacheKey(pageSize: number, pageIndex: number) {
  return `${MEMOS_CACHE_PREFIX}posts:${pageSize}:${pageIndex}`;
}

export function memosCommentPostsCacheKey(
  pageIndex: number,
  pageSize = 10,
) {
  return `${MEMOS_CACHE_PREFIX}comment-posts:${pageSize}:${pageIndex}`;
}

export function memosLikePostsCacheKey(pageIndex: number, pageSize = 10) {
  return `${MEMOS_CACHE_PREFIX}like-posts:${pageSize}:${pageIndex}`;
}

export function memosCommentsDetailCacheKey(postId: string) {
  return `${MEMOS_CACHE_PREFIX}comments:${postId}`;
}

export function memosLikesDetailCacheKey(postId: string) {
  return `${MEMOS_CACHE_PREFIX}likes:${postId}`;
}

export function invalidateMemosPostsCache() {
  invalidateSessionCacheByPrefix(`${MEMOS_CACHE_PREFIX}posts:`);
}

export function invalidateMemosEngageSummaryCache(kind?: "comments" | "likes") {
  if (kind === "comments") {
    invalidateSessionCacheByPrefix(`${MEMOS_CACHE_PREFIX}comment-posts:`);
    return;
  }
  if (kind === "likes") {
    invalidateSessionCacheByPrefix(`${MEMOS_CACHE_PREFIX}like-posts:`);
    return;
  }
  invalidateSessionCacheByPrefix(`${MEMOS_CACHE_PREFIX}comment-posts:`);
  invalidateSessionCacheByPrefix(`${MEMOS_CACHE_PREFIX}like-posts:`);
}

export function invalidateMemosEngageDetailCache(
  kind: "comments" | "likes",
  postId?: string,
) {
  if (postId) {
    invalidateSessionCache(
      kind === "comments"
        ? memosCommentsDetailCacheKey(postId)
        : memosLikesDetailCacheKey(postId),
    );
    return;
  }
  invalidateSessionCacheByPrefix(
    kind === "comments"
      ? `${MEMOS_CACHE_PREFIX}comments:`
      : `${MEMOS_CACHE_PREFIX}likes:`,
  );
}

export function invalidateAllMemosCache() {
  invalidateSessionCacheByPrefix(MEMOS_CACHE_PREFIX);
}

export function patchMemosPostInCache(
  pageSize: number,
  pageIndex: number,
  post: MemosPost,
) {
  const key = memosPostsCacheKey(pageSize, pageIndex);
  const cached = peekSessionCache<MemosPostsCache>(key);
  if (!cached) return;
  setSessionCache<MemosPostsCache>(key, {
    ...cached,
    posts: cached.posts.map((item) => (item.id === post.id ? post : item)),
  });
}

export function removeMemosPostFromCache(
  pageSize: number,
  pageIndex: number,
  postId: string,
) {
  const key = memosPostsCacheKey(pageSize, pageIndex);
  const cached = peekSessionCache<MemosPostsCache>(key);
  if (!cached) return null;
  const posts = cached.posts.filter((item) => item.id !== postId);
  const next: MemosPostsCache = {
    ...cached,
    posts,
    total: Math.max(0, cached.total - 1),
  };
  setSessionCache(key, next);
  return next;
}

export function removeEngageDetailFromCache(
  kind: "comments" | "likes",
  postId: string,
  detailId: string,
) {
  if (kind === "comments") {
    const key = memosCommentsDetailCacheKey(postId);
    const cached = peekSessionCache<MemosCommentsDetailCache>(key);
    if (!cached) return null;
    const comments = cached.comments.filter((item) => item.id !== detailId);
    const next: MemosCommentsDetailCache = {
      comments,
      total: Math.max(0, cached.total - 1),
    };
    setSessionCache(key, next);
    return next;
  }

  const key = memosLikesDetailCacheKey(postId);
  const cached = peekSessionCache<MemosLikesDetailCache>(key);
  if (!cached) return null;
  const likes = cached.likes.filter((item) => item.id !== detailId);
  const next: MemosLikesDetailCache = {
    likes,
    total: Math.max(0, cached.total - 1),
  };
  setSessionCache(key, next);
  return next;
}

export function patchEngagePostCountInCache(
  kind: "comments" | "likes",
  pageIndex: number,
  postId: string,
  nextCount: number,
) {
  const key =
    kind === "comments"
      ? memosCommentPostsCacheKey(pageIndex)
      : memosLikePostsCacheKey(pageIndex);
  const cached = peekSessionCache<MemosEngagePostsCache>(key);
  if (!cached) return null;
  const posts = cached.posts.map((post) => {
    if (post.id !== postId) return post;
    return kind === "comments"
      ? { ...post, comment_count: nextCount }
      : { ...post, like_count: nextCount };
  });
  const next: MemosEngagePostsCache = { ...cached, posts };
  setSessionCache(key, next);
  return next;
}

export function peekMemosSettingsCache() {
  return peekSessionCache<MemosSettingsPublic>(memosSettingsCacheKey());
}
