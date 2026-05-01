export { createDatabase, getDatabase, closeDatabase } from "./db/index.js";
import { createFile, readFile, updateFile, deleteFile, listFiles, moveFile, createFolder, deleteFolder, listProjectFolders, slugify } from "./files/index.js";
export { createFile, readFile, updateFile, deleteFile, listFiles, moveFile, createFolder, deleteFolder, listProjectFolders, slugify };
export {
  addTags, removeTags, setFavorite, search,
  registerProject, unregisterProject, discoverFiles, listTags, listProjects,
  findRelated, getTagsForFiles, type RelatedFileRecord,
} from "./metadata/index.js";
export { commitFile, getHistory, getDiff, restoreVersion, syncBackup, syncGlobalVault, getGlobalRemote, setGlobalRemote, isValidGitRemoteUrl, type SyncStage } from "./git/index.js";
export { withLock } from "./util/safety.js";
export { createFileWatcher, type WatcherEvent } from "./watcher/index.js";
export { bundleSearch, type BundleFormat, type BundleOptions, type BundleResult, type BundleIncludedItem, type BundleSkippedItem } from "./bundle/index.js";
export { estimateTokensFromBuffer, estimateTokensFromString } from "./util/tokens.js";
export type * from "./types.js";
export { clipUrl, ClipError, type ClipErrorCode, type ClipUrlOptions } from "./clip/index.js";
export {
  whatsNew, resolveSince,
  type WhatsNewOptions, type WhatsNewResult, type WhatsNewEntry, type ChangeKind,
} from "./whats-new/index.js";
export {
  projectMap,
  type ProjectMapOptions, type ProjectMapResult, type ProjectMapStats,
} from "./project-map/index.js";
