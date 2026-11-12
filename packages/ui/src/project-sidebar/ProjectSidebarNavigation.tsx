import { memo } from "react";
import type { ProjectSidebarProps } from "@/project-sidebar/contract.js";
import { NewTaskButtonGroup } from "@/NewTaskButtonGroup.js";
import { WebRemoteControlDeviceHeader } from "@/web-remote-control/WebRemoteControlDeviceHeader.js";
import { NavPrimarySlot } from "@/extension-slots/index.js";

/** 顶部导航只展示 Shell 的选中状态，路由仍由 Shell 唯一持有。 */
// 展开偏好会更新侧栏父组件；导航按原 props 和稳定命令隔离，避免无关菜单跟随渲染。
export const ProjectSidebarNavigation = memo(function ProjectSidebarNavigation({
  props,
  onCreate,
}: {
  // 个人定制：移除「自动化」「插件市场」侧边栏入口，只保留新建任务与远控设备头；路由与页面实现保留。
  props: Pick<
    ProjectSidebarProps,
    | "isWebRemoteControl"
    | "webRemoteControlWorkspaceSwitcher"
    | "navPrimarySlot"
    | "workspacePath"
    | "workspaceIdentity"
    | "workspaceRemoteSessionId"
  >;
  onCreate(): void;
}) {
  const deviceNavigation = props.webRemoteControlWorkspaceSwitcher?.deviceNavigation;
  return (
    <div
      data-testid="sidebar-primary-navigation"
      className={`flex flex-col gap-1 px-2 py-3 ${props.isWebRemoteControl && !deviceNavigation ? "max-md:pt-11" : ""}`}
    >
      {/* Relay V2 远控：当前电脑是项目与任务的上一级，放在导航首行；手机端占用原顶部留白。 */}
      {deviceNavigation ? <WebRemoteControlDeviceHeader navigation={deviceNavigation} /> : null}
      <NewTaskButtonGroup onCreateTask={onCreate} />
      {/* 扩展导航条目（nav.primary）：手机远控与「插件市场」一同隐藏；逻辑都在 extension-slots。 */}
      {!props.isWebRemoteControl && props.navPrimarySlot ? (
        <NavPrimarySlot
          workspacePath={props.workspacePath}
          {...(props.workspaceIdentity ? { workspaceIdentity: props.workspaceIdentity } : {})}
          {...(props.workspaceRemoteSessionId
            ? { workspaceRemoteSessionId: props.workspaceRemoteSessionId }
            : {})}
          {...props.navPrimarySlot}
        />
      ) : null}
    </div>
  );
});
