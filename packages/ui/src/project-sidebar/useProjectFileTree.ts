import { useEffect, useRef } from "react";
import type { ProjectSidebarProps } from "@/project-sidebar/contract.js";

// 个人定制：项目行/任务行的「查看文件」入口（openFiles / openTaskFiles）已随左侧标签式
// 侧面板一起移除；本 hook 仅保留手机端 fileTreeOpenRequest 深链消费，避免协议请求悬空。
export function useProjectFileTree(
  props: ProjectSidebarProps,
  _directory: unknown,
  _remoteService?: unknown,
) {
  const request = useRef(0);
  const consumedRequest = useRef<ProjectSidebarProps["fileTreeOpenRequest"]>(null);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  useEffect(() => {
    const next = props.fileTreeOpenRequest;
    if (!next || consumedRequest.current === next || !props.onOpenFileManager) return;
    consumedRequest.current = next;
    request.current++;
    props.onOpenFileManager(next.target);
  }, [props.fileTreeOpenRequest, props.onOpenFileManager]);
}
