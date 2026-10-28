import { describe, expect, it } from "vitest";
import { sortInstalledEditorsForOpenWith } from "@/lib/openWithEditors.js";
import {
  addDeletedGitStatusRowsToWorkspaceFileTree,
  areWorkspaceFilePathsEqual,
  buildWorkspaceFileGitStatusByPath,
  buildWorkspaceFileIgnoredPathSet,
  createCodeViewerSourceForWorkspaceFile,
  filterWorkspaceFileTreeRows,
  flattenWorkspaceFileTreeRows,
  getWorkspaceDirectoryGitStatuses,
  getWorkspaceFileGitStatus,
  getWorkspaceFileAncestorDirectories,
  getWorkspaceFileDirectoryChildDepth,
  getWorkspaceFileParentDirectory,
  getWorkspaceFileRelativePath,
  isWorkspaceFileTreeGitStatusAvailable,
  isWorkspaceFileTreeDeletedFile,
  isWorkspaceFileGitIgnored,
  type WorkspaceFileTreeNode,
  type WorkspaceFileTreeRow,
  isWorkspaceFilePathInside,
} from "@/workspace-file-tree/model.js";

function node(
  path: string,
  type: WorkspaceFileTreeNode["type"],
  depth: number,
): WorkspaceFileTreeNode {
  return {
    path,
    name: path.split("/").pop() ?? path,
    type,
    depth,
  };
}

function row(
  path: string,
  type: WorkspaceFileTreeNode["type"],
  depth: number,
  expanded = false,
): WorkspaceFileTreeRow {
  return {
    ...node(path, type, depth),
    expanded,
    loaded: true,
    loading: false,
    error: null,
  };
}

describe("workspace file tree model", () => {
  it("keeps QSpace next to Finder in local open-with menus", () => {
    const iconDataUrl = "data:image/png;base64,AA==";

    expect(
      sortInstalledEditorsForOpenWith([
        { id: "vscode", name: "VS Code", iconDataUrl },
        { id: "finder", name: "Finder", iconDataUrl },
        { id: "qspace", name: "QSpace", iconDataUrl },
        { id: "qspace-pro", name: "QSpace Pro", iconDataUrl },
        { id: "cursor", name: "Cursor", iconDataUrl },
      ]).map((editor) => editor.id),
    ).toEqual(["finder", "qspace", "qspace-pro", "vscode", "cursor"]);
  });

  it("only treats Git status as available inside a Git repository", () => {
    expect(
      isWorkspaceFileTreeGitStatusAvailable({
        isGitAvailable: true,
        isRepository: true,
      }),
    ).toBe(true);
    expect(
      isWorkspaceFileTreeGitStatusAvailable({
        isGitAvailable: true,
        isRepository: false,
      }),
    ).toBe(false);
    expect(
      isWorkspaceFileTreeGitStatusAvailable({
        isGitAvailable: false,
        isRepository: false,
      }),
    ).toBe(false);
  });

  it("flattens only visible expanded rows", () => {
    const childrenByDirectory = new Map<string, WorkspaceFileTreeNode[]>([
      [
        "/workspace",
        [node("/workspace/src", "directory", 0), node("/workspace/README.md", "file", 0)],
      ],
      ["/workspace/src", [node("/workspace/src/index.ts", "file", 1)]],
    ]);

    expect(
      flattenWorkspaceFileTreeRows({
        rootPath: "/workspace",
        childrenByDirectory,
        expandedPaths: new Set(),
        loadedDirectoryPaths: new Set(["/workspace"]),
        loadingDirectoryPaths: new Set(),
        errorByDirectory: new Map(),
      }).map((row) => row.path),
    ).toEqual(["/workspace/src", "/workspace/README.md"]);

    expect(
      flattenWorkspaceFileTreeRows({
        rootPath: "/workspace",
        childrenByDirectory,
        expandedPaths: new Set(["/workspace/src"]),
        loadedDirectoryPaths: new Set(["/workspace", "/workspace/src"]),
        loadingDirectoryPaths: new Set(),
        errorByDirectory: new Map(),
      }).map((row) => row.path),
    ).toEqual(["/workspace/src", "/workspace/src/index.ts", "/workspace/README.md"]);
  });

  it("flattens loaded empty directory chains", () => {
    const childrenByDirectory = new Map<string, WorkspaceFileTreeNode[]>([
      ["/workspace", [node("/workspace/src", "directory", 0)]],
      ["/workspace/src", [node("/workspace/src/features", "directory", 1)]],
      ["/workspace/src/features", [node("/workspace/src/features/auth", "directory", 2)]],
      ["/workspace/src/features/auth", [node("/workspace/src/features/auth/index.ts", "file", 3)]],
    ]);

    const rows = flattenWorkspaceFileTreeRows({
      rootPath: "/workspace",
      childrenByDirectory,
      expandedPaths: new Set(["/workspace/src"]),
      loadedDirectoryPaths: new Set([
        "/workspace",
        "/workspace/src",
        "/workspace/src/features",
        "/workspace/src/features/auth",
      ]),
      loadingDirectoryPaths: new Set(),
      errorByDirectory: new Map(),
      flattenEmptyDirectories: true,
    });

    expect(rows.map((row) => ({ path: row.path, name: row.name, depth: row.depth }))).toEqual([
      {
        path: "/workspace/src/features/auth",
        name: "src/features/auth",
        depth: 0,
      },
      {
        path: "/workspace/src/features/auth/index.ts",
        name: "index.ts",
        depth: 1,
      },
    ]);
    expect(rows[0]?.compactedPaths).toEqual([
      "/workspace/src",
      "/workspace/src/features",
      "/workspace/src/features/auth",
    ]);
  });

  it("does not flatten directories that contain files", () => {
    const childrenByDirectory = new Map<string, WorkspaceFileTreeNode[]>([
      ["/workspace", [node("/workspace/src", "directory", 0)]],
      [
        "/workspace/src",
        [
          node("/workspace/src/features", "directory", 1),
          node("/workspace/src/index.ts", "file", 1),
        ],
      ],
    ]);

    expect(
      flattenWorkspaceFileTreeRows({
        rootPath: "/workspace",
        childrenByDirectory,
        expandedPaths: new Set(["/workspace/src"]),
        loadedDirectoryPaths: new Set(["/workspace", "/workspace/src"]),
        loadingDirectoryPaths: new Set(),
        errorByDirectory: new Map(),
        flattenEmptyDirectories: true,
      }).map((row) => row.path),
    ).toEqual(["/workspace/src", "/workspace/src/features", "/workspace/src/index.ts"]);
  });

  it("does not flatten through symlink directories", () => {
    const symlinkDirectory = {
      ...node("/workspace/src/linked-dir", "directory", 1),
      isSymbolicLink: true,
    } as WorkspaceFileTreeNode;
    const childrenByDirectory = new Map<string, WorkspaceFileTreeNode[]>([
      ["/workspace", [node("/workspace/src", "directory", 0)]],
      ["/workspace/src", [symlinkDirectory]],
      ["/workspace/src/linked-dir", [node("/workspace/src/linked-dir/index.ts", "file", 2)]],
    ]);

    const rows = flattenWorkspaceFileTreeRows({
      rootPath: "/workspace",
      childrenByDirectory,
      expandedPaths: new Set(["/workspace/src"]),
      loadedDirectoryPaths: new Set(["/workspace", "/workspace/src", "/workspace/src/linked-dir"]),
      loadingDirectoryPaths: new Set(),
      errorByDirectory: new Map(),
      flattenEmptyDirectories: true,
    });

    expect(
      rows.map((row) => ({
        path: row.path,
        name: row.name,
        compactedPaths: row.compactedPaths,
      })),
    ).toEqual([
      {
        path: "/workspace/src",
        name: "src",
        compactedPaths: undefined,
      },
      {
        path: "/workspace/src/linked-dir",
        name: "linked-dir",
        compactedPaths: undefined,
      },
    ]);
  });

  it("uses workspace-relative paths for local and Windows separators", () => {
    expect(getWorkspaceFileRelativePath("/workspace", "/workspace/src/index.ts")).toBe(
      "src/index.ts",
    );
    expect(getWorkspaceFileRelativePath("C:\\repo", "C:\\repo\\src\\index.ts")).toBe(
      "src/index.ts",
    );
  });

  it("builds ancestor directories for revealing active side pane files", () => {
    expect(
      getWorkspaceFileAncestorDirectories("/workspace", "/workspace/src/app/index.tsx"),
    ).toEqual(["/workspace/src", "/workspace/src/app"]);
    expect(
      getWorkspaceFileAncestorDirectories("C:\\repo", "C:\\repo\\src\\app\\index.tsx"),
    ).toEqual(["C:\\repo\\src", "C:\\repo\\src\\app"]);
    expect(getWorkspaceFileAncestorDirectories("/workspace", "/outside/index.ts")).toEqual([]);
  });

  it("resolves directory refresh depth and parents across separators", () => {
    expect(getWorkspaceFileDirectoryChildDepth("/workspace", "/workspace")).toBe(0);
    expect(getWorkspaceFileDirectoryChildDepth("/workspace", "/workspace/src")).toBe(1);
    expect(getWorkspaceFileDirectoryChildDepth("/workspace", "/workspace/src/app")).toBe(2);
    expect(getWorkspaceFileDirectoryChildDepth("C:\\repo", "C:\\repo\\src\\app")).toBe(2);

    expect(getWorkspaceFileParentDirectory("/workspace", "/workspace/src/app")).toBe(
      "/workspace/src",
    );
    expect(getWorkspaceFileParentDirectory("/workspace", "/workspace/src")).toBe("/workspace");
    expect(getWorkspaceFileParentDirectory("/workspace", "/workspace")).toBeNull();
    expect(getWorkspaceFileParentDirectory("C:\\repo", "C:\\repo\\src\\app")).toBe("C:\\repo\\src");
  });

  it("compares paths across Windows and POSIX separators", () => {
    expect(areWorkspaceFilePathsEqual("C:\\repo\\src\\app.tsx", "C:/repo/src/app.tsx")).toBe(true);
    expect(areWorkspaceFilePathsEqual("/repo/src/app.tsx", "/repo/src/other.tsx")).toBe(false);
  });

  it("detects paths inside a workspace across separators", () => {
    expect(isWorkspaceFilePathInside("/workspace", "/workspace/src/index.ts")).toBe(true);
    expect(isWorkspaceFilePathInside("C:\\repo", "C:/repo/src/index.ts")).toBe(true);
    expect(isWorkspaceFilePathInside("/workspace", "/workspace-other/index.ts")).toBe(false);
  });

  it("opens raster images as image previews but keeps svg as file preview", () => {
    expect(createCodeViewerSourceForWorkspaceFile("/workspace/logo.png")).toEqual({
      type: "image",
      title: "logo.png",
      path: "/workspace/logo.png",
      mediaType: "image/png",
    });
    expect(createCodeViewerSourceForWorkspaceFile("/workspace/logo.svg")).toEqual({
      type: "file",
      title: "logo.svg",
      path: "/workspace/logo.svg",
    });
  });

  it("keeps pdf as file preview and relies on preview pane lazy upgrade", () => {
    // pdf 的类型升级收口在 PreviewPane 的 resolvePreviewPanePdfSource，
    // 文件树保持 file，让所有入口的 tab key 都是 file:{path}，避免同一文件开出两个 tab。
    expect(createCodeViewerSourceForWorkspaceFile("/workspace/report.pdf")).toEqual({
      type: "file",
      title: "report.pdf",
      path: "/workspace/report.pdf",
    });
  });

  it("maps Git changes to file tree status indicators", () => {
    const statusByPath = buildWorkspaceFileGitStatusByPath([
      {
        path: "/workspace/src/index.ts",
        section: "unstaged",
        isUntracked: false,
        kind: "modified",
      },
      {
        path: "/workspace/src/new.ts",
        section: "untracked",
        isUntracked: true,
        kind: "added",
      },
      {
        path: "C:\\repo\\src\\app.tsx",
        section: "staged",
        isUntracked: false,
        kind: "modified",
      },
      {
        path: "/workspace/src/staged-new.ts",
        section: "staged",
        isUntracked: false,
        kind: "added",
      },
      {
        path: "/workspace/src/removed.ts",
        section: "unstaged",
        isUntracked: false,
        kind: "deleted",
      },
      {
        path: "/workspace/src/moved.ts",
        section: "staged",
        isUntracked: false,
        kind: "renamed",
      },
    ]);

    expect(getWorkspaceFileGitStatus(statusByPath, "/workspace/src/index.ts")).toBe("modified");
    expect(getWorkspaceFileGitStatus(statusByPath, "/workspace/src/new.ts")).toBe("untracked");
    expect(getWorkspaceFileGitStatus(statusByPath, "C:/repo/src/app.tsx")).toBe("modified");
    expect(getWorkspaceFileGitStatus(statusByPath, "/workspace/src/staged-new.ts")).toBe("added");
    expect(getWorkspaceFileGitStatus(statusByPath, "/workspace/src/removed.ts")).toBe("deleted");
    expect(getWorkspaceFileGitStatus(statusByPath, "/workspace/src/moved.ts")).toBe("renamed");
    expect(getWorkspaceFileGitStatus(statusByPath, "/workspace/src/clean.ts")).toBeNull();
  });

  it("keeps the strongest Git status when staged and unstaged entries share a path", () => {
    const statusByPath = buildWorkspaceFileGitStatusByPath([
      {
        path: "/workspace/src/index.ts",
        section: "unstaged",
        isUntracked: false,
        kind: "modified",
      },
      {
        path: "/workspace/src/index.ts",
        section: "staged",
        isUntracked: false,
        kind: "added",
      },
    ]);

    expect(getWorkspaceFileGitStatus(statusByPath, "/workspace/src/index.ts")).toBe("added");
  });

  it("treats deleted file tree rows as non-openable virtual files", () => {
    expect(
      isWorkspaceFileTreeDeletedFile(row("/workspace/src/removed.ts", "file", 1), "deleted"),
    ).toBe(true);
    expect(
      isWorkspaceFileTreeDeletedFile(row("/workspace/src/index.ts", "file", 1), "modified"),
    ).toBe(false);
    expect(isWorkspaceFileTreeDeletedFile(row("/workspace/src", "directory", 0), "deleted")).toBe(
      false,
    );
  });

  it("aggregates Git statuses for directories", () => {
    const statusByPath = buildWorkspaceFileGitStatusByPath([
      {
        path: "/workspace/src/index.ts",
        section: "unstaged",
        isUntracked: false,
        kind: "modified",
      },
      {
        path: "/workspace/src/new.ts",
        section: "untracked",
        isUntracked: true,
        kind: "added",
      },
      {
        path: "/workspace/src/deleted.ts",
        section: "staged",
        isUntracked: false,
        kind: "deleted",
      },
      {
        path: "/workspace/docs/readme.md",
        section: "unstaged",
        isUntracked: false,
        kind: "modified",
      },
    ]);

    expect(getWorkspaceDirectoryGitStatuses(statusByPath, "/workspace/src")).toEqual([
      "modified",
      "untracked",
      "deleted",
    ]);
    expect(getWorkspaceDirectoryGitStatuses(statusByPath, "/workspace/docs")).toEqual(["modified"]);
    expect(getWorkspaceDirectoryGitStatuses(statusByPath, "/workspace/empty")).toEqual([]);
  });

  it("matches ignored paths across separators without treating them as changed descendants", () => {
    const ignoredPathSet = buildWorkspaceFileIgnoredPathSet([
      "C:\\repo\\dist\\bundle.js",
      "/workspace/build/output.txt",
    ]);

    expect(isWorkspaceFileGitIgnored(ignoredPathSet, "C:/repo/dist/bundle.js")).toBe(true);
    expect(isWorkspaceFileGitIgnored(ignoredPathSet, "/workspace/build/output.txt")).toBe(true);
    expect(isWorkspaceFileGitIgnored(ignoredPathSet, "/workspace/src/index.ts")).toBe(false);
  });

  it("adds deleted Git rows under loaded directories", () => {
    const childrenByDirectory = new Map<string, WorkspaceFileTreeNode[]>([
      ["/workspace", [node("/workspace/src", "directory", 0)]],
      ["/workspace/src", [node("/workspace/src/index.ts", "file", 1)]],
    ]);
    const statusByPath = new Map([
      ["/workspace/src/deleted.ts", "deleted" as const],
      ["/workspace/unloaded/deleted.ts", "deleted" as const],
    ]);

    const nextChildrenByDirectory = addDeletedGitStatusRowsToWorkspaceFileTree({
      rootPath: "/workspace",
      childrenByDirectory,
      statusByPath,
    });

    expect(nextChildrenByDirectory.get("/workspace/src")?.map((child) => child.path)).toEqual([
      "/workspace/src/deleted.ts",
      "/workspace/src/index.ts",
    ]);
    expect(nextChildrenByDirectory.get("/workspace/unloaded")).toBeUndefined();
    expect(childrenByDirectory.get("/workspace/src")?.map((child) => child.path)).toEqual([
      "/workspace/src/index.ts",
    ]);
  });

  it("filters file tree rows by filename while keeping visible ancestors", () => {
    const rows: WorkspaceFileTreeRow[] = [
      row("/workspace/src", "directory", 0, true),
      row("/workspace/src/app", "directory", 1, true),
      row("/workspace/src/app/index.ts", "file", 2),
      row("/workspace/src/app/view.tsx", "file", 2),
      row("/workspace/docs", "directory", 0, true),
      row("/workspace/docs/readme.md", "file", 1),
    ];

    expect(
      filterWorkspaceFileTreeRows({
        rows,
        searchQuery: "index",
        changedOnly: false,
        statusByPath: new Map(),
      }).map((item) => item.path),
    ).toEqual(["/workspace/src", "/workspace/src/app", "/workspace/src/app/index.ts"]);
  });

  it("filters file tree rows to changed files and changed descendant directories", () => {
    const rows: WorkspaceFileTreeRow[] = [
      row("/workspace/src", "directory", 0, true),
      row("/workspace/src/app", "directory", 1, true),
      row("/workspace/src/app/index.ts", "file", 2),
      row("/workspace/src/app/view.tsx", "file", 2),
      row("/workspace/docs", "directory", 0, false),
      row("/workspace/README.md", "file", 0),
    ];
    const statusByPath = new Map([
      ["/workspace/src/app/view.tsx", "modified" as const],
      ["/workspace/docs/readme.md", "added" as const],
    ]);

    expect(
      filterWorkspaceFileTreeRows({
        rows,
        searchQuery: "",
        changedOnly: true,
        statusByPath,
      }).map((item) => item.path),
    ).toEqual([
      "/workspace/src",
      "/workspace/src/app",
      "/workspace/src/app/view.tsx",
      "/workspace/docs",
    ]);
  });

  it("combines filename search with changed-only filtering", () => {
    const rows: WorkspaceFileTreeRow[] = [
      row("/workspace/src", "directory", 0, true),
      row("/workspace/src/index.ts", "file", 1),
      row("/workspace/src/view.tsx", "file", 1),
    ];
    const statusByPath = new Map([["/workspace/src/view.tsx", "modified" as const]]);

    expect(
      filterWorkspaceFileTreeRows({
        rows,
        searchQuery: "index",
        changedOnly: true,
        statusByPath,
      }),
    ).toEqual([]);
  });
});
