// 依据 docs/superpowers/specs/2026-11-12-project-folder-branch-layer-design.md：
// 本地项目展开后每个 root 一行，显示各自分支、可切换；非 git 文件夹只显名字。
import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareV4ConversationE2E } from "#e2e/helpers/v4-conversation";
import { DEFAULT_WORKSPACE } from "#e2e/helpers/desktop-app";
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

  it("展开本地项目后文件夹行显示各自分支并可切换", async function () {
    this.timeout(240_000);
    const baseDirectory = join(DEFAULT_WORKSPACE, ".zcode-e2e", "project-folder-branches");
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
    await projectRow.$('[data-testid="virtual-project-toggle"]').click();
    const folderRows = projectRow.$$('[data-testid="project-folder-row"]');
    await browser.waitUntil(async () => (await folderRows.length) === 3);
    expect(await folderRows[0]!.getAttribute("data-primary")).toBe("true");
    expect(await folderRows[0]!.getAttribute("data-folder-path")).toBe(repositoryAlpha);

    const alphaBranchTrigger = folderRows[0]!.$('[data-testid="project-folder-branch"] button');
    expect(await alphaBranchTrigger.getText()).toContain("main");
    const betaBranchTrigger = folderRows[1]!.$('[data-testid="project-folder-branch"] button');
    expect(await betaBranchTrigger.getText()).toContain("feature-x");
    expect(
      await folderRows[2]!.$('[data-testid="project-folder-branch"]').isExisting(),
    ).toBe(false);

    await browser.saveScreenshot(
      join(process.env.ZCODE_E2E_ARTIFACT_DIR!, "project-folder-branches.png"),
    );

    await alphaBranchTrigger.click();
    await $('[data-slot="command-item"]').waitForDisplayed();
    const branches = await $$('[data-slot="command-item"]');
    for (const branchItem of branches) {
      if ((await branchItem.getText()).includes("develop")) {
        await branchItem.click();
        break;
      }
    }
    await browser.waitUntil(async () =>
      (await alphaBranchTrigger.getText()).includes("develop"),
    );
    const headContent = await readFile(join(repositoryAlpha, ".git", "HEAD"), "utf8");
    expect(headContent).toContain("refs/heads/develop");
  });
});
