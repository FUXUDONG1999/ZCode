import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

it("个人定制后账户菜单不再渲染邀请好友入口", async () => {
  const source = await readFile("packages/ui/src/WorkspaceSidebarFooter.tsx", "utf8");
  expect(source).not.toContain('data-testid="rewards-menu-item"');
  expect(source).not.toContain('"rewards.menuTitle"');
  expect(source).not.toContain('data-testid="rewards-reward-badge"');
});
