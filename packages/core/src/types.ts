/**
 * Shared TypeScript interfaces for CtxNest
 */

export type StorageType = "local" | "reference" | "backup";
export type Destination = "knowledge" | "project" | "ctxnest";

export interface FileRecord {
  id: number;
  path: string;
  title: string;
  project_id: number | null;
  storage_type: StorageType;
  source_path: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRecord {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  path: string | null;
  created_at: string;
}

export interface TagRecord {
  id: number;
  name: string;
  color: string | null;
}

export interface FileTagRecord {
  file_id: number;
  tag_id: number;
}

export interface FavoriteRecord {
  file_id: number;
  created_at: string;
}

export interface UserRecord {
  id: number;
  name: string;
  email: string | null;
  created_at: string;
}

export interface FileFilters {
  project_id?: number;
  tag?: string;
  favorite?: boolean;
  folder?: string;
  storage_type?: StorageType;
  limit?: number;
  offset?: number;
}

export interface SearchFilters {
  query: string;
  project_id?: number;
  tags?: string[];
  favorite?: boolean;
}
