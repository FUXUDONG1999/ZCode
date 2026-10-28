import { SidebarNativeTooltip, ControlHintTooltip } from "@/ControlHintTooltip.js";
import type { UserInfo } from "@zcode/shared";
import { memo, useState, type ReactNode } from "react";
import {
    TID_LOGIN_MENU_ITEM,
    TID_LOGIN_TRIGGER,
    TID_LOGOUT_BUTTON,
    TID_TASK_SETTINGS_BUTTON,
} from "@zcode/shared/test-ids";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { toast } from "@/components/ui/toast.js";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Copy, Loader2, LogInIcon, LogOut, Settings, User } from "lucide-react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useZCodeStore } from "@/store/StoreProvider.js";
import {
    WorkspaceSidebarFooterPlanBadge,
    WorkspaceSidebarFooterUsageSummaryContent,
    useWorkspaceSidebarFooterUsageSummaryState,
} from "@/WorkspaceSidebarFooterUsageSummary.js";

function getSidebarProfileName(user?: UserInfo | null): string {
    const displayName = user?.displayName?.trim();
    if (displayName) {
        return displayName;
    }

    const username = user?.username?.trim();
    if (username) {
        return username;
    }

    return "MyAgent";
}

function getSidebarProfileBadge(
    user: UserInfo | null | undefined,
    formatMessage: ReturnType<typeof useZCodeIntl>["intl"]["formatMessage"],
): string {
    if (user) {
        return getSidebarProfileName(user);
    }

    return formatMessage({ id: "sidebar.profile.notLoggedIn" });
}

function getAvatarFallbackText(user: UserInfo | null | undefined): string {
    const source = user?.displayName?.trim() || user?.username?.trim() || "Z";
    return source[0]?.toUpperCase() ?? "Z";
}

export const WorkspaceSidebarFooter = memo(function WorkspaceSidebarFooterComponent({
    onSettingsButtonClick,
    onUsageClick,
    onUpgradeClick,
    onLogin,
    onLogout,
    settingsButtonMode = "settings",
    user,
    workspacePath,
    workspaceIdentity,
    banner,
    className,
}: {
    onSettingsButtonClick?: () => void;
    onUsageClick?: () => void;
    onUpgradeClick?: Parameters<
        typeof WorkspaceSidebarFooterUsageSummaryContent
    >[0]["onUpgradeClick"];
    onLogin?: () => void;
    onLogout?: () => void;
    settingsButtonMode?: "settings" | "back";
    user?: UserInfo | null;
    workspacePath?: string;
    workspaceIdentity?: string;
    workspaceRemoteSessionId?: string;
    activeTaskId?: string | null;
    banner?: ReactNode;
    className?: string;
}) {
    const { intl } = useZCodeIntl();
    const isRestoringOAuthSession = useZCodeStore((state) => state.isRestoringOAuthSession);
    const profileBadge = getSidebarProfileBadge(user, intl.formatMessage);
    const avatarFallbackText = getAvatarFallbackText(user);
    const avatarKey = user?.avatarUrl ?? user?.id ?? "guest";
    const showAuthRestoreLoading = !user && isRestoringOAuthSession;
    const usageSummaryState = useWorkspaceSidebarFooterUsageSummaryState({
        enabled: true,
        workspaceIdentity,
        workspacePath,
    });
    const copyUserId = async () => {
        if (!user?.id) return;
        try {
            await navigator.clipboard.writeText(user.id);
            toast(intl.formatMessage({ id: "sidebar.profile.userIdCopied" }));
        } catch {
            toast(intl.formatMessage({ id: "sidebar.profile.userIdCopyFailed" }));
        }
    };
    const profileContent = (
        <>
            <Avatar key={avatarKey} size="default">
                {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={profileBadge} /> : null}
                <AvatarFallback className="bg-background text-foreground">
                    {user ? (
                        avatarFallbackText
                    ) : showAuthRestoreLoading ? (
                        <>
                            {/* Bugfix: OAuth 启动恢复未落定前，footer 之前会直接显示未登录头像，
                  用户很容易把“还在校验”误判成“已经退出”。
                  这里用 loading 图标明确表达“状态确认中”，等恢复成功或失败后再展示最终状态。 */}
                            <Loader2 className="size-4 animate-spin" />
                            <span className="sr-only">
                                {intl.formatMessage({ id: "common.loading" })}
                            </span>
                        </>
                    ) : (
                        <User className="size-4" />
                    )}
                </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 overflow-hidden text-left">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate text-ui-base font-semibold text-foreground">
                        {profileBadge}
                    </span>
                </div>
            </div>
        </>
    );
    const settingsButtonLabel =
        settingsButtonMode === "back"
            ? intl.formatMessage({ id: "workspace.backToWorkspace" })
            : intl.formatMessage({ id: "settings.title" });
    const usageButtonClick = onUsageClick ?? onSettingsButtonClick;
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);

    return (
        // footer 被 Settings 复用，页面专属边距由调用方传入，避免修改共享默认样式。
        <footer className={cn("flex shrink-0 flex-col gap-2.5 px-4 pt-2 pb-4", className)}>
            {banner}
            <div className="flex min-w-0 gap-2">
                <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        {/* Bugfix: 头像和 Login 之前直接绑定到登录动作，导致用户无法从这里打开偏好设置。
              现在把这一块改成统一的设置菜单入口，登录/退出留在菜单项里，交互职责更清晰。 */}
                        <Button
                            type="button"
                            variant="ghost"
                            size={"lg"}
                            className="min-w-0 flex-1 justify-start gap-2 overflow-hidden rounded-tl-2xl rounded-bl-2xl border-0 pl-0"
                            data-testid={TID_LOGIN_TRIGGER}
                            aria-label={profileBadge}
                        >
                            {/* Bugfix: Button 默认 shrink-0 且带 whitespace-nowrap，超长用户名会把 footer 撑出 sidebar。
                这里让触发按钮和文本列都允许收缩，并只在用户名自身做单行截断。 */}
                            {profileContent}
                        </Button>
                    </DropdownMenuTrigger>
                    {/* Bugfix: 菜单内容保持挂载，避免每次点击头像菜单都重建 footer 内部状态。 */}
                    <DropdownMenuContent
                        align="start"
                        className="w-max min-w-50 max-w-[calc(100vw-2rem)]"
                        forceMount
                    >
                        {user ? (
                            <>
                                <div
                                    data-testid="profile-menu-header"
                                    className="flex max-w-80 items-center gap-2 px-2 py-1.5"
                                >
                                    <Avatar key={avatarKey} size="default">
                                        {user.avatarUrl ? (
                                            <AvatarImage src={user.avatarUrl} alt={profileBadge} />
                                        ) : null}
                                        <AvatarFallback className="bg-background text-foreground">
                                            {avatarFallbackText}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex min-w-0 flex-1 flex-col">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <span
                                                data-testid="profile-menu-name"
                                                className="truncate text-ui-base font-medium"
                                            >
                                                {profileBadge}
                                            </span>
                                            <span
                                                data-testid="profile-menu-plan"
                                                className="flex shrink-0 [&>span]:border-border/50 [&>span]:bg-transparent [&>span]:font-normal"
                                            >
                                                <WorkspaceSidebarFooterPlanBadge
                                                    state={usageSummaryState}
                                                />
                                            </span>
                                        </div>
                                        {user.id ? (
                                            <div className="flex min-w-0 items-center gap-1 text-ui-sm text-foreground-subtle">
                                                <span
                                                    data-testid="profile-menu-id"
                                                    className="min-w-0 truncate"
                                                >
                                                    {intl.formatMessage(
                                                        { id: "sidebar.profile.accountId" },
                                                        { id: user.id },
                                                    )}
                                                </span>
                                                <DropdownMenuItem
                                                    asChild
                                                    className="data-[highlighted]:bg-transparent data-[highlighted]:hover:bg-menu-hover data-[highlighted]:focus-visible:bg-menu-hover"
                                                    onSelect={(event) => {
                                                        event.preventDefault();
                                                        void copyUserId();
                                                    }}
                                                >
                                                    <SidebarNativeTooltip>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            data-testid="copy-user-id"
                                                            className="min-h-0 p-0 text-foreground-subtle"
                                                            aria-label={intl.formatMessage({
                                                                id: "sidebar.profile.copyUserId",
                                                            })}
                                                            title={intl.formatMessage({
                                                                id: "sidebar.profile.copyUserId",
                                                            })}
                                                        >
                                                            <Copy className="size-3" />
                                                        </Button>
                                                    </SidebarNativeTooltip>
                                                </DropdownMenuItem>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                                <DropdownMenuSeparator />
                            </>
                        ) : null}
                        {/* 个人定制：账户菜单移除「界面语言 / 界面主题 / 界面模式 / 界面缩放」子菜单；
                语言、主题与界面模式设置保留在设置页通用分区，桌面系统缩放快捷键不受影响。 */}
                        {/* Bugfix: 升级入口状态不再以菜单开关为生命周期边界。 */}
                        <WorkspaceSidebarFooterUsageSummaryContent
                            state={usageSummaryState}
                            onUsageClick={usageButtonClick}
                            onUpgradeClick={onUpgradeClick}
                        />
                        {/* 个人定制：账户菜单移除「邀请好友」入口；Rewards 能力与营销触达入口保留。 */}
                        {onLogin && !user ? (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onSelect={onLogin}
                                    data-testid={TID_LOGIN_MENU_ITEM}
                                >
                                    <LogInIcon className="size-4" />
                                    {intl.formatMessage({ id: "app.login" })}
                                </DropdownMenuItem>
                            </>
                        ) : null}
                        {onLogout ? <DropdownMenuSeparator /> : null}
                        {onLogout ? (
                            <DropdownMenuItem onSelect={onLogout} data-testid={TID_LOGOUT_BUTTON}>
                                <LogOut className="size-4" />
                                {intl.formatMessage({ id: "app.logout" })}
                            </DropdownMenuItem>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex shrink-0 items-center gap-1.5">
                    {/* 个人定制：移除「手机远程控制」侧边栏触发按钮；远控连接与 Web 端能力保留。 */}
                    <ControlHintTooltip title={settingsButtonLabel}>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            data-testid={TID_TASK_SETTINGS_BUTTON}
                            aria-label={settingsButtonLabel}
                            disabled={!onSettingsButtonClick}
                            onClick={onSettingsButtonClick}
                        >
                            <Settings className="size-4" />
                        </Button>
                    </ControlHintTooltip>
                </div>
            </div>
        </footer>
    );
});
