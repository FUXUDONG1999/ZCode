// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useProjectFileTree } from "@/project-sidebar/useProjectFileTree.js";
import type { ProjectSidebarProps } from "@/project-sidebar/contract.js";

// 个人定制：openFiles / openTaskFiles（项目行/任务行「查看文件」入口）已随左侧标签式
// 侧面板移除；本文件只保留手机端 fileTreeOpenRequest 深链消费的幂等用例。
const onOpenFileManager = vi.fn();
afterEach(() => {
  onOpenFileManager.mockClear();
});

it("consumes each open request once without reopening on rerender", () => {
  const target = { workspacePath: "/example", workspaceName: "Example" };
  const props = {
    onOpenFileManager,
    fileTreeOpenRequest: { id: 1, target },
  } as unknown as ProjectSidebarProps;
  const { rerender } = renderHook((value) => useProjectFileTree(value, { hosts: [], entries: [] }), {
    initialProps: props,
  });
  rerender({ ...props });
  expect(onOpenFileManager).toHaveBeenCalledExactlyOnceWith(target);
  rerender({ ...props, fileTreeOpenRequest: { id: 2, target } });
  expect(onOpenFileManager).toHaveBeenCalledTimes(2);
});
