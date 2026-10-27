import { describe, expect, it } from "vitest";
import {
  RENDERER_ONLY_EXCLUDED_PACKAGES,
  createRendererOnlyPackageExclusionPatterns,
  findRendererOnlyExclusionRuntimeConflicts,
} from "../scripts/renderer-only-package-exclusions.mjs";

describe("renderer-only package exclusions", () => {
  it("排除名单生成一一对应的 files 负向模式", () => {
    const patterns = createRendererOnlyPackageExclusionPatterns();
    expect(patterns).toHaveLength(RENDERER_ONLY_EXCLUDED_PACKAGES.length);
    for (const [index, packageName] of RENDERER_ONLY_EXCLUDED_PACKAGES.entries()) {
      expect(patterns[index]).toBe(`!node_modules/${packageName}/**`);
    }
  });

  it("运行时必需闭包命中排除名单时必须能被检出", () => {
    expect(
      findRendererOnlyExclusionRuntimeConflicts(["echarts", "zod"], ["react", "zod", "ms"]),
    ).toEqual(["zod"]);
  });

  it("闭包与排除名单无交集时返回空数组", () => {
    expect(
      findRendererOnlyExclusionRuntimeConflicts(RENDERER_ONLY_EXCLUDED_PACKAGES, [
        "undici",
        "ms",
      ]),
    ).toEqual([]);
  });
});
