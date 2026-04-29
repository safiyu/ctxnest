export { createDatabase, getDatabase, closeDatabase } from "./db/index.js";
import { createFile, readFile, updateFile, deleteFile, listFiles, moveFile, createFolder, deleteFolder, listProjectFolders } from "./files/index.js";
export { createFile, readFile, updateFile, deleteFile, listFiles, moveFile, createFolder, deleteFolder, listProjectFolders };
export {
  addTags, removeTags, setFavorite, search,
  registerProject, unregisterProject, discoverFiles, listTags, listProjects,
} from "./metadata/index.js";
export { commitFile, getHistory, getDiff, restoreVersion, syncBackup, getGlobalRemote, setGlobalRemote, type SyncStage } from "./git/index.js";
export { createFileWatcher, type WatcherEvent } from "./watcher/index.js";
export type * from "./types.js";
