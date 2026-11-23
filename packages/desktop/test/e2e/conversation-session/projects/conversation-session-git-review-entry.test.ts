import { waitForControlledReplay, releaseControlledReplay } from "#e2e/helpers/controlled-replay";
import { openStatusCapsule } from "#e2e/helpers/status-capsule";
import { execFile } from "node:child_process";
import { mkdir, open, rm, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  TID_GIT_ACTION_TRIGGER,
  TID_PREVIEW_PANE,
  TID_TASK_ITEM,
  testId,
} from "@zcode/shared/test-ids";
import type { ChainablePromiseElement } from "webdriverio";
import {
  DEFAULT_WORKSPACE,
  clearAppData,
  waitForTestIdByDom,
  waitForWorkspaceApp,
} from "#e2e/helpers/desktop-app";
import { PROVIDER_READINESS_HISTORY_SESSION_ID } from "#e2e/helpers/provider-readiness-history-fixture";
import { closeCloudContentDialogIfPresent } from "#e2e/helpers/occupation-onboarding";
import {
  prepareV4ConversationE2E,
  sendV4Prompt,
  waitForV4TimelineContaining,
  selectV4TaskById,
} from "#e2e/helpers/v4-conversation";

const CASE_TIMEOUT_MS = 120_000;
const FILE_NAME = "status-panel-review.txt";
const GIT_REVIEW_FIXTURE_REPOSITORY_PATH = `.zcode-e2e/conversation-session-git-review-entry/${FILE_NAME}`;
// 原文与 wdio.conf 的 seedE2EGitReviewEntryWorkspace 写入的内容保持一致。
const GIT_REVIEW_FIXTURE_LINE = "status panel Git review e2e fixture";
const GIT_REVIEW_CHANGED_LINE = "status panel Git review changed line";
// 个人定制：Git 胶囊常驻显示分支名，浮层直达 Git 图谱；图谱支持按作者和路径筛选（MYAGENT-FEATURES B7）。
const GIT_BINARY = process.env.ZCODE_GIT_BINARY?.trim() || "git";
const GRAPH_FILTER_ROOT = ".zcode-e2e/git-graph-filter";
const GRAPH_FILTER_AUTHORS = {
  mine: { name: "ZCode E2E Mine", email: "zcode-e2e-mine@example.com" },
  other: { name: "ZCode E2E Other", email: "zcode-e2e-other@example.com" },
} as const;
const GRAPH_EMPTY_FILTERED_LABELS = ["No matching commits", "没有匹配的提交"];
const GRAPH_DIALOG = '[role="dialog"]:has([data-testid="git-graph-filter-author"])';
const runGit = promisify(execFile);
// 夹具把文件放在用例目录下，行的 title 带目录前缀；按行内显示的文件名定位。
const CHANGED_FILE_ROW_SELECTOR =
  `//div[@data-status-capsule-content="git"]//*[@data-testid="status-git-files"]` +
  `//button[starts-with(normalize-space(.), "${FILE_NAME}")]`;

describe("SP13：status panel Git Changes 打开变更审阅", () => {
  after(async () => {
    await browser.electron.restoreAllMocks();
    await clearAppData();
  });

  it("Git 胶囊显示分支名：切换分支、打开 Git 图谱、从变更文件打开 Diff", async function () {
    this.timeout(CASE_TIMEOUT_MS);

    await waitForWorkspaceApp(DEFAULT_WORKSPACE, 45_000);
    await waitForTestIdByDom(testId(TID_TASK_ITEM, PROVIDER_READINESS_HISTORY_SESSION_ID), {
      timeout: 30_000,
      timeoutMsg: "SP13 预置的只读历史 session 没有出现在任务列表",
    });
    await selectV4TaskById(PROVIDER_READINESS_HISTORY_SESSION_ID);
    await waitForExpandedStatusPanel();

    // 连接就绪会兑现暂存的输入框聚焦；用户已打开的 Git 浮层不能因此被关闭。
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="v4-composer-input"]').getAttribute("contenteditable")) === "true",
    );
    await browser.executeAsync((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
    expect(await $('[data-status-capsule-content="git"]').isDisplayed()).toBe(true);

    // 分支入口复用真实服务；嵌套弹层关闭后仍能继续访问 Git 操作区。
    const branchTrigger = await $('[data-testid="status-git-current-branch"] button');
    await branchTrigger.waitForDisplayed();
    const branchTitle = await branchTrigger.getAttribute("title");
    expect(branchTitle).toBeTruthy();

    // 个人定制：Git 胶囊在仓库内常驻并贴状态栏左缘，主文案是当前分支名。
    const face = await readGitCapsuleFace();
    expect(face.text).toContain(branchTitle);
    expect(face.leftOffset).toBeLessThanOrEqual(1);
    // 个人定制：浮层自上而下是 分支 → 变更文件 → Git 图谱 → 提交/推送；「查看全部变更」已移除。
    await $(CHANGED_FILE_ROW_SELECTOR).waitForDisplayed();
    expect(await readGitPopoverLayout()).toEqual({ ordered: true, viewAll: false });
    await branchTrigger.click();
    await $("[cmdk-input]").waitForDisplayed();
    await browser.keys("Escape");
    await $("[cmdk-input]").waitForExist({ reverse: true });
    // 嵌套菜单关闭后焦点应返回分支按钮，不能迟到地跳回输入框并关闭下一次菜单。
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            document.activeElement ===
            document.querySelector('[data-testid="status-git-current-branch"] button'),
        ),
      { timeout: 5000 },
    );
    await openStatusCapsule("git");

    await $('[data-testid="status-git-current-branch"] button').click();
    await $("[cmdk-input]").waitForDisplayed();
    const createAction = await findButtonByLabels(
      $('[data-slot="popover-content"]:has([cmdk-input])'),
      ["Create and switch to new branch...", "创建并检出新分支..."],
    );
    if (!createAction) throw new Error("分支菜单缺少新建分支入口");
    await createAction.click();
    await $('[role="dialog"]').waitForDisplayed();
    await $('[data-status-capsule-content="git"]').waitForExist({ reverse: true });
    await $("#git-branch-switcher-create-input").setValue("e2e-git-action-host");
    // 中文实际文案为“创建并切换”；使用所属表单的 submit 语义，避免语言差异误报缺失。
    const createSubmit = $(
      '[role="dialog"] form:has(#git-branch-switcher-create-input) button[type="submit"]',
    );
    await createSubmit.waitForEnabled();
    await createSubmit.click();
    await $('[role="dialog"]').waitForExist({ reverse: true });
    await openStatusCapsule("git");
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="status-git-current-branch"] button').getAttribute("title")) ===
        "e2e-git-action-host",
      { timeout: 10000 },
    );
    await $('[data-testid="status-git-current-branch"] button').click();
    await $("[cmdk-input]").waitForDisplayed();
    const graphAction = await findButtonByLabels(
      $('[data-slot="popover-content"]:has([cmdk-input])'),
      ["Git graph", "Git Graph", "Git 图谱"],
    );
    if (!graphAction) throw new Error("分支菜单缺少 Git 图谱入口");
    await graphAction.click();
    await $('[role="dialog"]').waitForDisplayed();
    await $('[data-status-capsule-content="git"]').waitForExist({ reverse: true });
    await $("[cmdk-input]").waitForExist({ reverse: true });
    await browser.keys("Escape");
    await $('[role="dialog"]').waitForExist({ reverse: true });
    expect(await $('[data-status-capsule-content="git"]').isExisting()).toBe(false);

    // 个人定制：「查看全部变更」已移除（Git 审查面板被本分支的侧面板闸门挡住），
    // 浮层里的「Git 图谱」行直接打开同一个对话框。
    await openGraphFromCapsule();
    await closeGraphDialog();

    // 等价入口：点变更文件，Diff 在侧面板的代码查看器里打开。
    await openStatusCapsule("git");
    const changedFileRow = await $(CHANGED_FILE_ROW_SELECTOR);
    await changedFileRow.waitForClickable();
    await changedFileRow.click();
    await $('[data-status-capsule-content="git"]').waitForExist({ reverse: true });
    // 补丁走独立的差异渲染，没有 div[data-language]；按差异里的行文本判断。
    await browser.waitUntil(() => $(`[data-testid="${TID_PREVIEW_PANE}"]`).isDisplayed(), {
      timeout: 20_000,
      timeoutMsg: "点变更文件后代码查看器没有在侧面板展开",
    });
    await browser.waitUntil(
      async () => (await readDisplayedPreviewText()).includes(GIT_REVIEW_FIXTURE_LINE),
      {
        timeout: 20_000,
        timeoutMsg: "代码查看器里没有显示新增文件的 Diff",
      },
    );
    expect(
      await browser.execute(
        () => document.querySelectorAll('[data-side-pane-tab-id^="code-viewer:"]').length,
      ),
    ).toBe(1);

    // 个人定制补充：改动已有内容时，删除行和新增行要同时出现在同一个差异视图里。
    // 把文件加入暂存区再改写，工作区相对暂存区就是一次修改；列表里的行不用等 60 秒的自动刷新。
    const fixturePath = join(DEFAULT_WORKSPACE, GIT_REVIEW_FIXTURE_REPOSITORY_PATH);
    try {
      await runGit(GIT_BINARY, ["add", "-f", "--", GIT_REVIEW_FIXTURE_REPOSITORY_PATH], {
        cwd: DEFAULT_WORKSPACE,
      });
      await writeFile(fixturePath, `${GIT_REVIEW_CHANGED_LINE}\n`, "utf8");
      await openStatusCapsule("git");
      const modifiedFileRow = await $(CHANGED_FILE_ROW_SELECTOR);
      await modifiedFileRow.waitForClickable();
      await modifiedFileRow.click();
      await $('[data-status-capsule-content="git"]').waitForExist({ reverse: true });
      await browser.waitUntil(
        async () => {
          const text = await readDisplayedPreviewText();
          return text.includes(GIT_REVIEW_FIXTURE_LINE) && text.includes(GIT_REVIEW_CHANGED_LINE);
        },
        { timeout: 20_000, timeoutMsg: "修改文件的差异没有同时显示删除行和新增行" },
      );
    } finally {
      // 还原成未跟踪的原始夹具：后面的用例按「未跟踪文件 +4 −0」断言。
      // 只移出暂存区；不带 --cached 会连空目录一起删掉，文件就写不回去。
      await runGit(
        GIT_BINARY,
        ["rm", "--cached", "-f", "--ignore-unmatch", "--", GIT_REVIEW_FIXTURE_REPOSITORY_PATH],
        { cwd: DEFAULT_WORKSPACE },
      );
      await writeFile(fixturePath, `${GIT_REVIEW_FIXTURE_LINE}\n`, "utf8");
    }
  });

  it("整轮成功完成后不等 watcher 防抖就刷新 Git 文件", async function () {
    this.timeout(CASE_TIMEOUT_MS);
    await prepareV4ConversationE2E();
    await browser.execute(() =>
      document
        .querySelector('[data-testid="v4-composer-input"]')
        ?.setAttribute("data-git-scope-retained", "yes"),
    );
    await sendV4Prompt("E2E_GIT_TURN_REFRESH 等待受控完成");
    await waitForControlledReplay("git-turn-refresh");
    expect(
      await $('[data-testid="v4-composer-input"]').getAttribute("data-git-scope-retained"),
    ).toBe("yes");
    const name = "turn-completion-refresh.txt";
    try {
      await writeFile(join(DEFAULT_WORKSPACE, name), "completed turn refresh\n", "utf8");
      await releaseControlledReplay("git-turn-refresh");
      await waitForV4TimelineContaining("E2E_GIT_TURN_DONE", 15000);
      await openStatusCapsule("git");
      await browser.waitUntil(
        async () => (await $('[data-status-capsule-content="git"]').getText()).includes(name),
        {
          timeout: 15000,
          timeoutMsg: "整轮完成后 Git 列表未及时刷新",
        },
      );
    } finally {
      await rm(join(DEFAULT_WORKSPACE, name), { force: true });
    }
  });

  it("Git 自动刷新跳过超限行数统计且 Host 内存有界", async function () {
    this.timeout(CASE_TIMEOUT_MS);
    await waitForWorkspaceApp(DEFAULT_WORKSPACE, 45_000);
    await browser.execute(() =>
      document
        .querySelector("[data-v4-timeline-scroll]")
        ?.setAttribute("data-git-task-retained", "yes"),
    );
    await selectV4TaskById(PROVIDER_READINESS_HISTORY_SESSION_ID);
    expect(await $("[data-v4-timeline-scroll]").getAttribute("data-git-task-retained")).toBe("yes");
    await waitForExpandedStatusPanel();
    // 通过真实文件 watcher 刷新；无需打开 Git pane，也不创建会话或调用模型。
    const caseRoot = join(DEFAULT_WORKSPACE, ".zcode-e2e/conversation-session-git-review-entry");
    const largeText = "large-untracked.txt";
    await browser.electron.execute((electron) => {
      const state = globalThis as typeof globalThis & {
        gitMemoryProbe?: { baseline: number; peak: number; timer: ReturnType<typeof setInterval> };
      };
      const readHostKb = () =>
        electron.app
          .getAppMetrics()
          .filter((metric) => metric.name?.startsWith("zcode-host"))
          .reduce((total, metric) => total + metric.memory.workingSetSize, 0);
      const baseline = readHostKb();
      if (!baseline) throw new Error("没有找到待采样的真实 Host 进程");
      const probe = {
        baseline,
        peak: baseline,
        timer: setInterval(() => {
          probe.peak = Math.max(probe.peak, readHostKb());
        }, 25),
      };
      state.gitMemoryProbe = probe;
    });
    try {
      await writeFile(join(caseRoot, largeText), "line\n".repeat(300_000));
      for (let index = 0; index < 8; index++) {
        const file = await open(join(caseRoot, `large-${index}.bin`), "w");
        try {
          await file.truncate(32 * 1024 * 1024);
        } finally {
          await file.close();
        }
      }
      await writeFile(join(caseRoot, FILE_NAME), "one\ntwo\nthree\nfour\n");
      // Linux 只监听 Git 元数据；触发同一自动刷新入口，避免依赖递归文件监听。
      const changedAt = new Date();
      await utimes(join(DEFAULT_WORKSPACE, ".git", "HEAD"), changedAt, changedAt);
      await browser.waitUntil(
        async () => {
          const text = await $('[data-status-capsule="git"]').getText();
          return /\+4\s+[−-]0/u.test(text);
        },
        // 产品的 watcher 防抖为 60 秒；等到新快照后才判断内存。
        {
          timeout: 90_000,
          interval: 500,
          timeoutMsg: "自动刷新应更新小文件为 +4，大文本不应计入行数",
        },
      );
    } finally {
      const memory = await browser.electron.execute(() => {
        const state = globalThis as typeof globalThis & {
          gitMemoryProbe?: {
            baseline: number;
            peak: number;
            timer: ReturnType<typeof setInterval>;
          };
        };
        const probe = state.gitMemoryProbe;
        if (!probe) throw new Error("Host 内存探针不存在");
        clearInterval(probe.timer);
        delete state.gitMemoryProbe;
        return {
          baselineKb: probe.baseline,
          peakKb: probe.peak,
          deltaKb: probe.peak - probe.baseline,
        };
      });
      console.log("[git-untracked-memory]", JSON.stringify(memory));
      // 256 MiB 文件应在读取前跳过；为真实 Electron 噪声留出 96 MiB 余量。
      expect(memory.deltaKb).toBeLessThan(96 * 1024);
    }
  });

  it("Git 图谱按作者、只看我的和路径筛选，筛选时切到纯列表", async function () {
    this.timeout(CASE_TIMEOUT_MS);
    await waitForWorkspaceApp(DEFAULT_WORKSPACE, 45_000);
    await selectV4TaskById(PROVIDER_READINESS_HISTORY_SESSION_ID);
    // 排在行数统计用例之后：这里提交的夹具文件不能出现在该用例的未提交变更里。
    const subjects = await seedGraphFilterCommits();
    await openGraphFromCapsule();

    // 未筛选：分支图带泳道，三份夹具提交都在。
    await waitGraphSnapshot(
      "未筛选的图谱应带泳道并列出全部夹具提交",
      (graph) => graph.laneVisible && listsAllSubjects(graph, subjects),
    );
    const authorInput = await $('[data-testid="git-graph-filter-author"]');
    const pathInput = await $('[data-testid="git-graph-filter-path"]');
    const mineSwitch = await $('[data-testid="git-graph-filter-mine"]');
    // 开关要等仓库身份读回来才可用。
    await mineSwitch.waitForEnabled({ timeout: 20_000 });

    // 作者按字面匹配、不区分大小写：只剩另一位作者的提交，泳道列消失。
    await authorInput.setValue(GRAPH_FILTER_AUTHORS.other.name.toUpperCase());
    await waitGraphSnapshot(
      "作者筛选后应只列另一位作者的提交",
      (graph) =>
        !graph.laneVisible &&
        graph.rows.length > 0 &&
        graph.rows.every(
          (row) =>
            row.author === GRAPH_FILTER_AUTHORS.other.name &&
            row.subject.includes(subjects.otherAlpha),
        ),
    );

    // 只看我的：按仓库身份匹配，期间作者输入框禁用；关闭后恢复原来的作者筛选。
    await mineSwitch.click();
    await waitGraphSnapshot(
      "只看我的应只列仓库身份的提交",
      (graph) =>
        !graph.laneVisible &&
        graph.rows.some((row) => row.subject.includes(subjects.mineAlpha)) &&
        graph.rows.some((row) => row.subject.includes(subjects.mineBeta)) &&
        graph.rows.every((row) => row.author === GRAPH_FILTER_AUTHORS.mine.name),
    );
    expect(await authorInput.isEnabled()).toBe(false);
    await mineSwitch.click();
    await waitGraphSnapshot(
      "关闭只看我的后应恢复作者筛选",
      (graph) =>
        graph.rows.length > 0 &&
        graph.rows.every((row) => row.author === GRAPH_FILTER_AUTHORS.other.name),
    );
    expect(await authorInput.isEnabled()).toBe(true);

    // 清除：输入清空，恢复带泳道的分支图。
    await $('[data-testid="git-graph-filter-clear"]').click();
    await waitGraphSnapshot(
      "清除筛选后应恢复分支图",
      (graph) => graph.laneVisible && listsAllSubjects(graph, subjects),
    );
    expect(await authorInput.getValue()).toBe("");

    // 路径与只看我的叠加，回车立即生效：只剩 beta 目录下我的提交。
    await mineSwitch.click();
    await pathInput.setValue(`${GRAPH_FILTER_ROOT}/beta`);
    await browser.keys("Enter");
    await waitGraphSnapshot(
      "路径与只看我的叠加后应只剩 beta 目录下我的提交",
      (graph) =>
        !graph.laneVisible &&
        graph.rows.length > 0 &&
        graph.rows.every((row) => row.subject.includes(subjects.mineBeta)),
    );

    // 无匹配：空状态与「暂无提交」区分；清除后恢复分支图。
    await pathInput.setValue("no-such-directory");
    await browser.keys("Enter");
    await waitGraphSnapshot(
      "无匹配时应显示筛选空状态",
      (graph) =>
        graph.rows.length === 0 &&
        GRAPH_EMPTY_FILTERED_LABELS.some((label) => graph.emptyText.includes(label)),
    );
    await $('[data-testid="git-graph-filter-clear"]').click();
    await waitGraphSnapshot(
      "清除筛选后应恢复分支图",
      (graph) => graph.laneVisible && listsAllSubjects(graph, subjects),
    );

    // 筛选是弹窗的本地状态，关闭即丢弃。
    await authorInput.setValue(GRAPH_FILTER_AUTHORS.other.name);
    await waitGraphSnapshot(
      "作者筛选应生效",
      (graph) =>
        !graph.laneVisible &&
        graph.rows.every((row) => row.author === GRAPH_FILTER_AUTHORS.other.name),
    );
    await closeGraphDialog();
    await openGraphFromCapsule();
    await waitGraphSnapshot(
      "重新打开后筛选应清空",
      (graph) =>
        graph.laneVisible &&
        graph.authorValue === "" &&
        graph.pathValue === "" &&
        !graph.mineChecked &&
        listsAllSubjects(graph, subjects),
    );
  });
});

async function waitForExpandedStatusPanel() {
  // 后台下发的营销弹窗会盖住状态栏（2026-11-23 实测），而且可能晚于检查到达；点击被拦就关掉重开。
  await closeCloudContentDialogIfPresent();
  try {
    await openStatusCapsule("git");
  } catch {
    await closeCloudContentDialogIfPresent();
    await openStatusCapsule("git");
  }
}

interface GraphFilterSubjects {
  mineAlpha: string;
  otherAlpha: string;
  mineBeta: string;
}

async function seedGraphFilterCommits(): Promise<GraphFilterSubjects> {
  const marker = `E2E_GRAPH_FILTER_${Date.now()}`;
  const subjects = {
    mineAlpha: `test(e2e): graph filter ${marker}_MINE_ALPHA`,
    otherAlpha: `test(e2e): graph filter ${marker}_OTHER_ALPHA`,
    mineBeta: `test(e2e): graph filter ${marker}_MINE_BETA`,
  };
  // 只看我的按仓库身份匹配，所以把仓库身份配成本人。
  await runGit(GIT_BINARY, ["config", "user.name", GRAPH_FILTER_AUTHORS.mine.name], {
    cwd: DEFAULT_WORKSPACE,
  });
  await runGit(GIT_BINARY, ["config", "user.email", GRAPH_FILTER_AUTHORS.mine.email], {
    cwd: DEFAULT_WORKSPACE,
  });
  await commitGraphFixtureFile("alpha/mine.txt", subjects.mineAlpha, GRAPH_FILTER_AUTHORS.mine);
  await commitGraphFixtureFile("alpha/other.txt", subjects.otherAlpha, GRAPH_FILTER_AUTHORS.other);
  await commitGraphFixtureFile("beta/mine.txt", subjects.mineBeta, GRAPH_FILTER_AUTHORS.mine);
  return subjects;
}

async function commitGraphFixtureFile(
  relativePath: string,
  subject: string,
  author: { name: string; email: string },
) {
  const repositoryPath = `${GRAPH_FILTER_ROOT}/${relativePath}`;
  const absolutePath = join(DEFAULT_WORKSPACE, repositoryPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${subject}\n`, "utf8");
  // 夹具目录可能被其他用例写进 .gitignore，强制加入；只提交这一个文件，不带上别处暂存的内容。
  await runGit(GIT_BINARY, ["add", "-f", "--", repositoryPath], { cwd: DEFAULT_WORKSPACE });
  await runGit(
    GIT_BINARY,
    [
      "-c",
      `user.name=${author.name}`,
      "-c",
      `user.email=${author.email}`,
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      subject,
      "--",
      repositoryPath,
    ],
    { cwd: DEFAULT_WORKSPACE },
  );
}

function listsAllSubjects(graph: GraphSnapshot, subjects: GraphFilterSubjects) {
  return Object.values(subjects).every((subject) =>
    graph.rows.some((row) => row.subject.includes(subject)),
  );
}

interface GraphSnapshot {
  laneVisible: boolean;
  rows: { subject: string; author: string }[];
  emptyText: string;
  authorValue: string;
  pathValue: string;
  mineChecked: boolean;
}

function readGraphSnapshot(): Promise<GraphSnapshot | null> {
  return browser.execute((dialogSelector) => {
    const dialog = document.querySelector<HTMLElement>(dialogSelector);
    if (!dialog) return null;
    const inputValue = (testId: string) =>
      dialog.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)?.value ?? "";
    return {
      laneVisible: Boolean(dialog.querySelector('[data-testid="git-graph-lane"]')),
      rows: [...dialog.querySelectorAll<HTMLElement>('[data-testid="git-graph-row"]')].map(
        (row) => ({
          subject: row.children[0]?.textContent ?? "",
          author: row.children[2]?.textContent ?? "",
        }),
      ),
      emptyText: dialog.querySelector('[data-testid="git-graph-empty"]')?.textContent ?? "",
      authorValue: inputValue("git-graph-filter-author"),
      pathValue: inputValue("git-graph-filter-path"),
      mineChecked:
        dialog
          .querySelector('[data-testid="git-graph-filter-mine"]')
          ?.getAttribute("aria-checked") === "true",
    };
  }, GRAPH_DIALOG);
}

async function waitGraphSnapshot(timeoutMsg: string, predicate: (graph: GraphSnapshot) => boolean) {
  let latest: GraphSnapshot | null = null;
  try {
    await browser.waitUntil(
      async () => {
        latest = await readGraphSnapshot();
        return latest !== null && predicate(latest);
      },
      { timeout: 20_000, interval: 200 },
    );
  } catch (error) {
    throw new Error(`${timeoutMsg}; latest=${JSON.stringify(latest)}`, { cause: error });
  }
}

async function openGraphFromCapsule() {
  await openStatusCapsule("git");
  const graphRow = await $(
    '[data-status-capsule-content="git"] [data-testid="status-git-open-graph"]',
  );
  await graphRow.waitForClickable();
  await graphRow.click();
  await $(GRAPH_DIALOG).waitForDisplayed();
  // 打开图谱时浮层关闭，避免两层弹层叠加。
  await $('[data-status-capsule-content="git"]').waitForExist({ reverse: true });
}

async function closeGraphDialog() {
  await browser.keys("Escape");
  await $(GRAPH_DIALOG).waitForExist({ reverse: true });
}

/** 差异视图渲染在 Shadow DOM 里，按文本节点深度遍历才读得到；只读当前显示的预览面板。 */
function readDisplayedPreviewText() {
  return browser.execute((paneTestId) => {
    const pane = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-testid="${paneTestId}"]`),
    ).find((candidate) => candidate.getClientRects().length > 0);
    if (!pane) return "";
    const texts: string[] = [];
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        texts.push(node.textContent ?? "");
        return;
      }
      const shadowRoot = node instanceof Element ? node.shadowRoot : null;
      if (shadowRoot) walk(shadowRoot);
      node.childNodes.forEach(walk);
    };
    walk(pane);
    return texts.join("");
  }, TID_PREVIEW_PANE);
}

function readGitCapsuleFace() {
  return browser.execute(() => {
    const row = document.querySelector<HTMLElement>('[data-testid="composer-status-row"]')!;
    const capsule = row.querySelector<HTMLElement>('[data-status-capsule="git"]')!;
    return {
      text: capsule.textContent ?? "",
      leftOffset: capsule.getBoundingClientRect().left - row.getBoundingClientRect().left,
    };
  });
}

function readGitPopoverLayout() {
  return browser.execute((actionsTestId) => {
    const content = document.querySelector<HTMLElement>('[data-status-capsule-content="git"]')!;
    const top = (selector: string) => content.querySelector(selector)!.getBoundingClientRect().top;
    const branch = top('[data-testid="status-git-current-branch"]');
    const files = top('[data-testid="status-git-files"]');
    const graph = top('[data-testid="status-git-open-graph"]');
    const actions = top(`[data-testid="${actionsTestId}"]`);
    return {
      ordered: branch < files && files < graph && graph < actions,
      viewAll: Boolean(content.querySelector('[data-testid="status-git-view-all"]')),
    };
  }, TID_GIT_ACTION_TRIGGER);
}

async function findButtonByLabels(root: ChainablePromiseElement, labels: readonly string[]) {
  const buttons = await root.$$("button");
  for (const button of buttons) {
    if (!(await button.isDisplayed())) continue;
    const text = (await button.getText()).trim();
    const firstLine = text.split(/\r?\n/u, 1)[0] ?? "";
    const ariaLabel = (await button.getAttribute("aria-label"))?.trim() ?? "";
    if (labels.includes(ariaLabel || firstLine)) {
      return button;
    }
  }
  return null;
}
