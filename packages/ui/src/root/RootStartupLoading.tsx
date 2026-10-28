import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils.js";

interface RootStartupLoadingProps {
    label: string;
    children?: ReactNode;
    busy?: boolean;
}

export function RootStartupLoading({ label, children, busy = true }: RootStartupLoadingProps) {
    return (
        <div
            // Web 端全局 html/body/#root 为 Electron 透明背景让路，React 接管后会替换 HTML 启动壳。
            // 这里必须由阻塞态自身承接主题背景，否则远控链接会在 Root 恢复期间继续露出浏览器白底。
            className="flex h-full min-h-dvh flex-col items-center justify-center gap-6 bg-background text-foreground"
            role="status"
            aria-busy={busy}
            aria-label={label}
            data-testid="root-startup-loading"
        >
            <ZCodeStartupLogoBadge />
            {children}
        </div>
    );
}

/** 初始化与引导共用品牌图标，保持底色、描边、圆角和标志比例一致。 */
export function ZCodeStartupLogoBadge({
    animated = true,
    size = "default",
}: {
    animated?: boolean;
    size?: "default" | "titlebar";
}) {
    return (
        <div
            data-desktop-logo-badge={size === "titlebar" ? "true" : undefined}
            className={cn(
                // MyAgent 品牌徽章与应用图标同源：靛蓝-紫渐变底 + 白色粗体 A 字标。
                "relative flex items-center justify-center bg-[linear-gradient(180deg,#6365F1_0%,#8A5CF5_100%)] text-[#ffffff] before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-[rgba(255,255,255,0.1)] before:content-['']",
                size === "titlebar"
                    ? "size-5 rounded shadow-sm/20 before:border-white/20"
                    : "size-24 rounded-3xl shadow-xl/20",
            )}
        >
            {/* Button 会给 SVG 默认尺寸；紧凑 Logo 显式恢复自动高度，保持标志原始比例。 */}
            <ZCodeStartupLogo
                className={size === "titlebar" ? "size-auto w-3.25" : "h-auto w-14"}
                animated={animated}
            />
        </div>
    );
}

export function ZCodeStartupLogo({
    className,
    animated = true,
}: {
    className?: string;
    animated?: boolean;
}) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="118"
            height="100"
            fill="none"
            viewBox="0 0 256 218"
            className={cn("shrink-0 text-current", className)}
            aria-hidden="true"
            focusable="false"
        >
            {animated ? (
                <animate
                    attributeName="opacity"
                    begin="3s"
                    dur="1.8s"
                    repeatCount="indefinite"
                    values="1;0.4;1"
                />
            ) : null}
            {/* MyAgent 字标 A：左斜笔、右斜笔、横杠三段，供启动动画分段闪烁。 */}
            <path fill="currentColor" d="M100 0L0 218L56 218L128 49.2L128 0Z" />
            <path fill="currentColor" d="M128 0L156 0L256 218L200 218L128 49.2Z" />
            <path fill="currentColor" d="M91 136L165 136L179.6 170L76.4 170Z" />
        </svg>
    );
}
