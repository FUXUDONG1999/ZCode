// 依据 docs/superpowers/specs/2026-11-12-project-folder-branch-layer-design.md：
// 本地项目展开后每个 root 一行，显示各自分支、可切换；非 git 文件夹只显名字。
import { execSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareV4ConversationE2E } from "#e2e/helpers/v4-conversation";
import { selectNativeProjectDirectories } from "#e2e/helpers/project-sidebar";

const GIT_IDENTITY_ARGS = [
  "-c",
  "user.email=e2e@zcode.local",
  "-c",
  "user.name=ZCode E2E",
  "-c",
  "commit.gpgsign=false",
];

function runGit(repositoryPath: string, ...args: string[]) {
  const command = ["git", "-C", repositoryPath, ...args]
    .map((argument) => JSON.stringify(argument))
    .join(" ");
  execSync(command, { stdio: "pipe" });
}

async function prepareGitRepository(repositoryPath: string, branchName: string) {
  await mkdir(repositoryPath, { recursive: true });
  runGit(repositoryPath, "init", "-b", branchName);
  await writeFile(join(repositoryPath, "readme.md"), `# ${branchName}\n`);
  runGit(repositoryPath, ...GIT_IDENTITY_ARGS, "add", ".");
  runGit(repositoryPath, ...GIT_IDENTITY_ARGS, "commit", "-m", "init");
}

async function openLocalProjectEditor() {
  await $('[data-testid="project-section"]').moveTo();
  await $('[data-testid="virtual-project-add"]').click();
  await $('[data-testid="virtual-project-name"]').waitForDisplayed();
}

async function chooseProjectRoot(path: string) {
  await selectNativeProjectDirectories([path]);
}

/** 折叠动画会移动下方行；点击行内触发器前等动画完成，避免点到移动中的目标。 */
async function waitForSidebarAnimations() {
  await browser.execute(async () => {
    await Promise.all(
      (document.querySelector("aside")?.getAnimations({ subtree: true }) ?? [])
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}

// 夹具放在系统临时目录：e2e home 位于 ZCode 仓库检出内，非 git 目录会被向上解析到
// 外层仓库分支，无法构造真实的"无 git 文件夹"场景。
const BASE_DIRECTORY = join(tmpdir(), "zcode-e2e-project-folder-branches");

describe("项目文件夹行分支", () => {
  before(async () => {
    await prepareV4ConversationE2E({ skipProvider: true });
    await browser.execute(() => {
      const actions = (window as Window & { __testActions?: { setLocale(locale: "zh-CN"): void } })
        .__testActions;
      if (!actions) throw new Error("missing E2E locale bridge");
      actions.setLocale("zh-CN");
    });
  });

  after(async () => {
    await rm(BASE_DIRECTORY, { recursive: true, force: true });
  });

  it("展开本地项目后文件夹行显示各自分支并可切换", async function () {
    this.timeout(240_000);
    await rm(BASE_DIRECTORY, { recursive: true, force: true });
    const baseDirectory = BASE_DIRECTORY;
    const repositoryAlpha = join(baseDirectory, "repo-alpha");
    const repositoryBeta = join(baseDirectory, "repo-beta");
    const plainFolder = join(baseDirectory, "plain-folder");
    await prepareGitRepository(repositoryAlpha, "main");
    runGit(repositoryAlpha, "branch", "develop");
    await prepareGitRepository(repositoryBeta, "feature-x");
    await mkdir(plainFolder, { recursive: true });

    await openLocalProjectEditor();
    await $('[data-testid="virtual-project-name"]').setValue("E2E_FOLDER_BRANCHES");
    for (const path of [repositoryAlpha, repositoryBeta, plainFolder]) {
      await chooseProjectRoot(path);
    }
    await $('[data-testid="virtual-project-save"]').click();
    await $('[data-testid="project-folder-trust-confirm"]').waitForDisplayed();
    await $('[data-testid="project-folder-trust-confirm"]').click();
    await $('[data-slot="dialog-overlay"]').waitForExist({ reverse: true });

    const projectRow = await $(`[data-project-name="E2E_FOLDER_BRANCHES"]`);
    await waitForSidebarAnimations();
    // 多 root 本地项目默认展开；只有确认收起态才点击，避免把已展开的项目收起。
    const projectToggle = () =>
      $('[data-project-name="E2E_FOLDER_BRANCHES"] [data-testid="virtual-project-toggle"]');
    if ((await projectToggle().getAttribute("aria-expanded")) !== "true") {
      await projectToggle().click();
    }
    await browser.waitUntil(async () => (await projectToggle().getAttribute("aria-expanded")) === "true");
    // 侧栏树会因实时数据 join 重渲染并替换节点；所有断言与交互都用即时查询，不缓存元素引用。
    await browser.waitUntil(
      async () =>
        (await $$('[data-project-name="E2E_FOLDER_BRANCHES"] [data-testid="project-folder-row"]')
          .length) === 3,
    );
    const folderRow = (folderPath: string) =>
      $(`[data-project-name="E2E_FOLDER_BRANCHES"] [data-testid="project-folder-row"][data-folder-path="${folderPath}"]`);
    const branchTrigger = (folderPath: string) =>
      folderRow(folderPath).$('[data-testid="project-folder-branch"] button');
    expect(await folderRow(repositoryAlpha).getAttribute("data-primary")).toBe("true");
    expect(await branchTrigger(repositoryAlpha).getText()).toContain("main");
    expect(await branchTrigger(repositoryBeta).getText()).toContain("feature-x");
    expect(await folderRow(plainFolder).$('[data-testid="project-folder-branch"]').isExisting()).toBe(
      false,
    );

    await browser.saveScreenshot(
      join(process.env.ZCODE_E2E_ARTIFACT_DIR!, "project-folder-branches.png"),
    );

    await waitForSidebarAnimations();
    await branchTrigger(repositoryAlpha).click();
    await $('[data-slot="command-item"]').waitForDisplayed();
    const branches = await $$('[data-slot="command-item"]');
    for (const branchItem of branches) {
      if ((await branchItem.getText()).includes("develop")) {
        await branchItem.click();
        break;
      }
    }
    await browser.waitUntil(async () =>
      (await branchTrigger(repositoryAlpha).getText()).includes("develop"),
    );
    const headContent = await readFile(join(repositoryAlpha, ".git", "HEAD"), "utf8");
    expect(headContent).toContain("refs/heads/develop");
  });
});
