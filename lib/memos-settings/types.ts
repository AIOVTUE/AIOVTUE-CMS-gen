export type MemosSettingsPublic = {
  apiUrl: string;
  username: string;
  hasPassword: boolean;
  configured: boolean;
  updatedAt: string | null;
};

export type MemosPostComment = {
  id: string;
  post_id: string;
  parent_id: string;
  author_name: string;
  author_url?: string;
  content: string;
  created_at: number;
};

export type MemosPost = {
  id: string;
  content: string;
  images: string[];
  created_at: number;
  updated_at: number;
  like_count: number;
  comment_count: number;
  liked?: boolean;
  likers?: Array<{ name: string }>;
  comments?: MemosPostComment[];
};

export type MemosPostsPage = {
  posts: MemosPost[];
  total: number;
  limit: number;
  offset: number;
};

export type MemosPostInput = {
  content: string;
  images: string[];
  created_at?: number | null;
};

export type MemosEngagePost = {
  id: string;
  content: string;
  created_at: number;
  last_at: number;
  comment_count?: number;
  like_count?: number;
};

export type MemosEngagePostsPage = {
  posts: MemosEngagePost[];
  total: number;
  limit: number;
  offset: number;
};

export type MemosAdminComment = {
  id: string;
  post_id: string;
  parent_id: string;
  author_name: string;
  author_email?: string;
  author_url?: string;
  content: string;
  created_at: number;
  post_excerpt?: string;
  post_created_at?: number;
};

export type MemosAdminLike = {
  id: string;
  post_id: string;
  client_id?: string;
  author_name: string;
  created_at: number;
  post_excerpt?: string;
  post_created_at?: number;
};

export type MemosAdminCommentsPage = {
  comments: MemosAdminComment[];
  total: number;
  limit: number;
  offset: number;
};

export type MemosAdminLikesPage = {
  likes: MemosAdminLike[];
  total: number;
  limit: number;
  offset: number;
};
