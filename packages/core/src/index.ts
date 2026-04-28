export { createDatabase, getDatabase, closeDatabase } from "./db/index.js";
import { createFile, readFile, updateFile, deleteFile, listFiles, moveFile, createFolder, listProjectFolders } from "./files/index.js";
export { createFile, readFile, updateFile, deleteFile, listFiles, moveFile, createFolder, listProjectFolders };
export {
  addTags, removeTags, setFavorite, search,
  registerProject, discoverFiles, listTags, listProjects,
} from "./metadata/index.js";
export { commitFile, getHistory, getDiff, restoreVersion, syncBackup } from "./git/index.js";
export { createFileWatcher, type WatcherEvent } from "./watcher/index.js";
export type * from "./types.js";
