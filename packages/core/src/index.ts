export { createDatabase, getDatabase, closeDatabase } from "./db/index.js";
import { createFile, readFile, updateFile, deleteFile, listFiles, moveFile, createFolder, deleteFolder, listProjectFolders } from "./files/index.js";
export { createFile, readFile, updateFile, deleteFile, listFiles, moveFile, createFolder, deleteFolder, listProjectFolders };
export {
  addTags, removeTags, setFavorite, search,
  registerProject, unregisterProject, discoverFiles, listTags, listProjects,
} from "./metadata/index.js";
export { commitFile, getHistory, getDiff, restoreVersion, syncBackup, getGlobalRemote, setGlobalRemote, type SyncStage } from "./git/index.js";
export { createFileWatcher, type WatcherEvent } from "./watcher/index.js";
export { bundleSearch, type BundleFormat, type BundleOptions, type BundleResult, type BundleIncludedItem, type BundleSkippedItem } from "./bundle/index.js";
export { estimateTokensFromBuffer, estimateTokensFromString } from "./util/tokens.js";
export type * from "./types.js";
