interface HtmlPreviewContentProps {
    title: string;
    htmlContent: string;
    sourcePath?: string;
}

/**
 * HTML 文件预览：以沙箱 iframe 渲染文件内容。
 *
 * 之前 HTML 文件直开内置浏览器 file:// URL，但 Electron webview 受 webSecurity 限制，
 * 从应用页（http/app 源）加载本地 file:// 会报 "Not allowed to load local resource"，
 * 用户点击后一直是空屏。这里改为经 fileService 读取文本后用 `srcDoc` 渲染：
 * - 本地与远程 workspace 走同一条读取链路，远程 HTML 也能预览；
 * - `sandbox` 不含 `allow-same-origin`/`allow-top-navigation`，脚本运行在 opaque origin，
 *   无法访问应用页面、本地会话与文件系统，只保留脚本执行与表单交互。
 */
export function HtmlPreviewContent({ title, htmlContent, sourcePath }: HtmlPreviewContentProps) {
    return (
        <div className="h-full w-full overflow-hidden bg-background">
            <iframe
                title={sourcePath ?? title}
                sandbox="allow-scripts allow-forms"
                srcDoc={htmlContent}
                className="h-full w-full border-0 bg-white"
            />
        </div>
    );
}
