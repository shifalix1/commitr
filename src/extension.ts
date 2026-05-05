import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

// Config 

interface CommitrConfig {
  ollamaUrl: string;
  model: string;
  generateBody: boolean;
  scopeMappings: Record<string, string>;
  commitStyle: "conventional" | "freeform";
  source?: "vscode" | ".commitrrc"; // for status bar tooltip
}

interface CommitRc {
  model?: string;
  generateBody?: boolean;
  scopeMappings?: Record<string, string>;
  commitStyle?: "conventional" | "freeform";
}

function loadCommitRc(repoPath: string): CommitRc | null {
  const rcPath = path.join(repoPath, ".commitrrc");
  try {
    if (!fs.existsSync(rcPath)) {
      return null;
    }
    const raw = fs.readFileSync(rcPath, "utf8");
    const parsed = JSON.parse(raw) as CommitRc;
    return parsed;
  } catch {
    // malformed .commitrrc — warn and fall back to VS Code settings
    vscode.window.showWarningMessage(
      "Commitr: .commitrrc found but could not be parsed. Falling back to VS Code settings."
    );
    return null;
  }
}

function getConfig(repoPath: string): CommitrConfig {
  const vsCfg = vscode.workspace.getConfiguration("commitr");
  const rc = loadCommitRc(repoPath);

  if (rc) {
    // .commitrrc exists — merge: rc values override VS Code settings
    // ollamaUrl is always from VS Code settings (personal, not committed to repo)
    return {
      ollamaUrl: vsCfg.get<string>("ollamaUrl", "http://localhost:11434"),
      model: rc.model ?? vsCfg.get<string>("model", "qwen2.5:3b"),
      generateBody: rc.generateBody ?? vsCfg.get<boolean>("generateBody", true),
      scopeMappings: rc.scopeMappings ?? vsCfg.get<Record<string, string>>("scopeMappings", {}),
      commitStyle: rc.commitStyle ?? vsCfg.get<"conventional" | "freeform">("commitStyle", "conventional"),
      source: ".commitrrc",
    };
  }

  return {
    ollamaUrl: vsCfg.get<string>("ollamaUrl", "http://localhost:11434"),
    model: vsCfg.get<string>("model", "qwen2.5:3b"),
    generateBody: vsCfg.get<boolean>("generateBody", true),
    scopeMappings: vsCfg.get<Record<string, string>>("scopeMappings", {}),
    commitStyle: vsCfg.get<"conventional" | "freeform">("commitStyle", "conventional"),
    source: "vscode",
  };
}

// Prompt 

function buildPrompt(diff: string, cfg: CommitrConfig): string {
  const customMappingLines = Object.entries(cfg.scopeMappings)
    .map(([prefix, scope]) => `- ${prefix} → (${scope})`)
    .join("\n");

  if (cfg.commitStyle === "freeform") {
    return `Write a short, clear git commit message (one line, under 72 chars) describing what changed and why. No preamble. No explanation. Just the message.\n\n${diff}`;
  }

  const bodyInstruction = cfg.generateBody
    ? `BODY (optional — only for diffs spanning 3+ files or significant logic changes):
- Add a blank line after subject, then 1-2 sentences explaining WHY
- No emdashes
- Max 72 chars per line
- If diff is small or self-explanatory, omit body entirely`
    : `Do NOT add a body. Subject line only.`;

  return `You are a git commit message generator. Output ONLY the commit message — no preamble, no explanation, no markdown.

FORMAT: type(scope): subject
${cfg.generateBody ? "\nOptionally followed by a blank line and a short body." : ""}

TYPES — pick one:
  feat      new feature or capability
  fix       bug fixed
  refactor  restructured without behavior change
  chore     config, deps, build, tooling
  docs      documentation only
  style     formatting / whitespace only
  test      tests added or changed
  perf      performance improvement

SCOPE — infer from changed file paths:
  - Single dominant directory → use its name  (src/auth/login.ts → auth)
  - client/components/ or src/components/    → ui
  - client/pages/ or src/pages/             → pages
  - Root-level config files                 → omit scope
  - Multiple unrelated directories          → omit scope
${customMappingLines ? `\nCUSTOM MAPPINGS (highest priority, override above):\n${customMappingLines}` : ""}

SUBJECT RULES:
  - Under 72 characters, lowercase, no trailing period
  - Say WHAT changed and WHY — never "update file" or "fix bug"
  ✗ feat(auth): update auth.py
  ✓ feat(auth): add token expiry check on protected routes
  ✗ fix: fixed the bug
  ✓ fix(api): return 404 instead of 500 for missing resource

${bodyInstruction}

EXAMPLES:
diff — new retry wrapper in src/api/client.ts:
feat(api): add exponential backoff retry for failed requests

diff — null check in client/components/UserCard.jsx:
fix(ui): guard against null user prop in UserCard render

diff — README updated with docker setup:
docs: add docker compose setup to readme

diff — large change across server/auth/, server/session/, client/pages/Login.jsx:
feat: add session-based auth with login page and server validation

Session tokens are now stored server-side. Login page replaced
placeholder with real form wired to /api/auth/login.

NOW generate the commit message for this diff:

${diff}`;
}

// Git 

type DiffError = "not_a_repo" | "git_not_found" | "exec_failed";

interface DiffResult {
  diff: string;
  fileCount: number;
  error?: DiffError;
}

async function getStagedDiff(repoPath: string): Promise<DiffResult> {
  try {
    const { stdout } = await execAsync("git diff --cached --no-color", {
      cwd: repoPath,
      timeout: 10_000,
      maxBuffer: 1024 * 1024 * 5,
    });

    const raw = stdout.trim();
    if (!raw) {
      return { diff: "", fileCount: 0 };
    }

    const fileCount = (raw.match(/^diff --git /gm) ?? []).length;

    const MAX_CHARS = 12_000;
    let truncated = raw;
    if (raw.length > MAX_CHARS) {
      const cutoff = raw.lastIndexOf("\n", MAX_CHARS);
      truncated =
        raw.substring(0, cutoff > 0 ? cutoff : MAX_CHARS) +
        "\n\n...(diff truncated — showing first ~12 000 chars)";
    }

    return { diff: truncated, fileCount };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not a git repository")) {
      return { diff: "", fileCount: 0, error: "not_a_repo" };
    }
    if (
      msg.includes("git: command not found") ||
      msg.includes("'git' is not recognized")
    ) {
      return { diff: "", fileCount: 0, error: "git_not_found" };
    }
    return { diff: "", fileCount: 0, error: "exec_failed" };
  }
}

// Custom errors 

class ModelNotFoundError extends Error {
  constructor(public model: string) {
    super(`Model "${model}" is not pulled.`);
    this.name = "ModelNotFoundError";
  }
}

// Ollama 

async function checkOllamaHealth(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOllama(
  prompt: string,
  cfg: CommitrConfig,
  cancelToken: vscode.CancellationToken
): Promise<string> {
  const controller = new AbortController();
  const disposeCancel = cancelToken.onCancellationRequested(() =>
    controller.abort()
  );

  try {
    const res = await fetch(`${cfg.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_predict: 150,
          stop: ["\n\n\n"],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 404 && body.toLowerCase().includes("model")) {
        throw new ModelNotFoundError(cfg.model);
      }
      throw new Error(`Ollama returned ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as { response: string };
    return data.response ?? "";
  } finally {
    disposeCancel.dispose();
  }
}

// Output parsing & validation 

function parseOutput(raw: string): { subject: string; body: string } {
  const lines = raw.trim().split("\n");
  let subject = lines[0].trim();
  subject = subject.replace(/^["'`]|["'`]$/g, "").trim();

  const blankIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "");
  const body =
    blankIdx !== -1
      ? lines.slice(blankIdx + 1).join("\n").trim()
      : "";

  return { subject, body };
}

function isValidConventionalCommit(subject: string): boolean {
  return /^[a-z]+(\([a-z0-9/_-]+\))?!?: .{1,72}$/.test(subject);
}

// Terminal write 

function writeToTerminal(message: string): void {
  const terminal =
    vscode.window.activeTerminal ??
    vscode.window.createTerminal({ name: "Commitr" });
  terminal.show(true); // true = don't steal focus
  // Escape double quotes in message to avoid shell injection
  const escaped = message.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  terminal.sendText(`git commit -m "${escaped}"`);
}

// Status bar

let statusBarItem: vscode.StatusBarItem | undefined;

function getStatusBar(): vscode.StatusBarItem {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    statusBarItem.command = "commitr.generateMessage";
  }
  return statusBarItem;
}

function setStatusBar(state: "idle" | "generating" | "error", source?: string) {
  const bar = getStatusBar();
  const sourceLabel = source === ".commitrrc" ? " [.commitrrc]" : "";

  switch (state) {
    case "idle":
      bar.text = "$(git-commit) Commitr";
      bar.tooltip = `Commitr: Generate commit message${sourceLabel}`;
      bar.backgroundColor = undefined;
      break;
    case "generating":
      bar.text = "$(sync~spin) Commitr";
      bar.tooltip = `Commitr: Generating…${sourceLabel}`;
      bar.backgroundColor = undefined;
      break;
    case "error":
      bar.text = "$(git-commit) Commitr";
      bar.tooltip = `Commitr: Error — click to retry${sourceLabel}`;
      bar.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      break;
  }
  bar.show();
}

// Main command 

async function runCommitr() {
  // Workspace check
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    vscode.window.showErrorMessage("Commitr: No workspace folder open.");
    return;
  }
  const repoPath = workspaceFolders[0].uri.fsPath;

  // Load config — .commitrrc takes priority over VS Code settings
  const cfg = getConfig(repoPath);

  // Ollama health check
  const ollamaRunning = await checkOllamaHealth(cfg.ollamaUrl);
  if (!ollamaRunning) {
    setStatusBar("error", cfg.source);
    const action = await vscode.window.showErrorMessage(
      `Commitr: Ollama is not running at ${cfg.ollamaUrl}.`,
      "Copy Fix",
      "Open Settings"
    );
    if (action === "Copy Fix") {
      await vscode.env.clipboard.writeText("ollama serve");
      vscode.window.showInformationMessage(
        'Commitr: Copied "ollama serve" to clipboard.'
      );
    } else if (action === "Open Settings") {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "commitr.ollamaUrl"
      );
    }
    return;
  }

  // Staged diff
  const { diff, fileCount, error } = await getStagedDiff(repoPath);

  if (error === "not_a_repo") {
    vscode.window.showErrorMessage("Commitr: This folder is not a git repository.");
    return;
  }
  if (error === "git_not_found") {
    vscode.window.showErrorMessage("Commitr: git is not installed or not on PATH.");
    return;
  }
  if (error === "exec_failed") {
    vscode.window.showErrorMessage("Commitr: Failed to read staged diff. Check the terminal for details.");
    return;
  }
  if (!diff) {
    vscode.window.showWarningMessage("Commitr: No staged changes. Run git add first.");
    return;
  }

  // Generate
  setStatusBar("generating", cfg.source);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Commitr: Generating with ${cfg.model}${cfg.source === ".commitrrc" ? " [.commitrrc]" : ""}…`,
      cancellable: true,
    },
    async (_progress, cancelToken) => {
      try {
        const prompt = buildPrompt(diff, cfg);
        const raw = await callOllama(prompt, cfg, cancelToken);

        if (cancelToken.isCancellationRequested) {
          setStatusBar("idle", cfg.source);
          return;
        }

        const { subject, body } = parseOutput(raw);

        // Validate conventional format — warn but don't block
        if (
          cfg.commitStyle === "conventional" &&
          !isValidConventionalCommit(subject)
        ) {
          const action = await vscode.window.showWarningMessage(
            `Commitr: Output may not follow Conventional Commits.\n"${subject}"`,
            "Use Anyway",
            "Discard"
          );
          if (action !== "Use Anyway") {
            setStatusBar("idle", cfg.source);
            return;
          }
        }

        // Include body only if generateBody on, body exists, diff spans 3+ files
        const finalMessage =
          cfg.generateBody && body && fileCount >= 3
            ? `${subject}\n\n${body}`
            : subject;

        // Write to terminal as git commit command
        writeToTerminal(finalMessage);
        setStatusBar("idle", cfg.source);
        vscode.window.showInformationMessage(`Commitr ✓  ${subject}`);

      } catch (err: unknown) {
        setStatusBar("error", cfg.source);

        if (err instanceof Error && err.name === "AbortError") {
          setStatusBar("idle", cfg.source);
          return;
        }

        if (err instanceof ModelNotFoundError) {
          const action = await vscode.window.showErrorMessage(
            `Commitr: Model "${err.model}" is not pulled.`,
            "Copy Pull Command",
            "Open Settings"
          );
          if (action === "Copy Pull Command") {
            await vscode.env.clipboard.writeText(`ollama pull ${err.model}`);
            vscode.window.showInformationMessage(
              `Commitr: Copied "ollama pull ${err.model}" to clipboard.`
            );
          } else if (action === "Open Settings") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "commitr.model"
            );
          }
          return;
        }

        const errMsg = err instanceof Error ? err.message : "Unknown error";
        vscode.window.showErrorMessage(`Commitr: Generation failed — ${errMsg}`);
      }
    }
  );
}

// Lifecycle 

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "commitr.generateMessage",
    runCommitr
  );

  const bar = getStatusBar();
  setStatusBar("idle");

  context.subscriptions.push(disposable, bar);
}

export function deactivate() {
  statusBarItem?.dispose();
}