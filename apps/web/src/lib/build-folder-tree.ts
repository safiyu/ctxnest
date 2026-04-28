export interface FolderTreeNode {
  name: string;
  path: string;
  children: FolderTreeNode[];
  files: { id: number; title: string; path: string }[];
}

export function buildFolderTree(
  files: { id: number; title: string; path: string }[],
  projectPath: string,
  emptyFolders: string[] = []
): FolderTreeNode {
  const root: FolderTreeNode = {
    name: "",
    path: "",
    children: [],
    files: [],
  };

  const normalizedProjectPath = projectPath.endsWith("/")
    ? projectPath
    : projectPath + "/";

  for (const file of files) {
    const relativePath = file.path.startsWith(normalizedProjectPath)
      ? file.path.slice(normalizedProjectPath.length)
      : file.path;

    const segments = relativePath.split("/");
    const fileName = segments.pop()!;

    let current = root;
    let currentPath = "";

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let child = current.children.find((c) => c.name === segment);
      if (!child) {
        child = { name: segment, path: currentPath, children: [], files: [] };
        current.children.push(child);
      }
      current = child;
    }

    current.files.push({ id: file.id, title: file.title, path: file.path });
  }

  // Inject empty folders
  for (const folderPath of emptyFolders) {
    const segments = folderPath.split("/");
    let current = root;
    let currentPath = "";

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let child = current.children.find((c) => c.name === segment);
      if (!child) {
        child = { name: segment, path: currentPath, children: [], files: [] };
        current.children.push(child);
      }
      current = child;
    }
  }

  sortTree(root);
  return root;
}

function sortTree(node: FolderTreeNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name));
  node.files.sort((a, b) => a.title.localeCompare(b.title));
  for (const child of node.children) {
    sortTree(child);
  }
}
