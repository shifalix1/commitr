import * as vscode from "vscode";

export class WalkthroughPanel {
  public static readonly viewType = "commitr.walkthrough";
  private static instance: WalkthroughPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => {
      WalkthroughPanel.instance = undefined;
    });

    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.command === "openTerminal") {
        vscode.commands.executeCommand("workbench.action.terminal.new");
      }
      if (msg.command === "openScm") {
        vscode.commands.executeCommand("workbench.view.scm");
      }
      if (msg.command === "openSettings") {
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "commitr",
        );
      }
    });
  }

  public static show(extensionUri: vscode.Uri) {
    if (WalkthroughPanel.instance) {
      WalkthroughPanel.instance.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      WalkthroughPanel.viewType,
      "Get started with Commitr",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    WalkthroughPanel.instance = new WalkthroughPanel(panel, extensionUri);
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Get started with Commitr</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --black: #0a0a0a;
    --blue: #b8d4e8;
    --blue-bright: #d4e8f5;
    --white: #f0f0f0;
    --muted: #555;
    --border: #1e1e1e;
    --step-bg: #111;
  }

  html, body {
    background: var(--black);
    color: var(--white);
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    min-height: 100vh;
  }

  .container {
    max-width: 680px;
    margin: 0 auto;
    padding: 56px 32px 80px;
  }

  /* Header */
  .header {
    margin-bottom: 56px;
    opacity: 0;
    animation: fadeUp 0.5s ease forwards;
  }

  .logo-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 16px;
  }

  .logo-heel {
    width: 36px;
    height: 36px;
    opacity: 0.9;
  }

  .brand {
    font-family: 'DM Mono', monospace;
    font-size: 22px;
    font-weight: 500;
    color: var(--blue);
    letter-spacing: -0.5px;
  }

  .header h1 {
    font-size: 28px;
    font-weight: 600;
    color: var(--white);
    line-height: 1.3;
    letter-spacing: -0.5px;
  }

  .header p {
    margin-top: 10px;
    color: var(--muted);
    font-size: 15px;
  }

  /* Steps */
  .steps {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .step {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    opacity: 0;
    animation: fadeUp 0.5s ease forwards;
  }

  .step:nth-child(1) { animation-delay: 0.1s; }
  .step:nth-child(2) { animation-delay: 0.2s; }
  .step:nth-child(3) { animation-delay: 0.3s; }

  .step.active {
    border-color: #2a2a2a;
    background: var(--step-bg);
  }

  .step-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px 24px;
    cursor: pointer;
    user-select: none;
  }

  .step-num {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid #2a2a2a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    flex-shrink: 0;
    transition: all 0.2s;
  }

  .step.active .step-num {
    border-color: var(--blue);
    color: var(--blue);
    background: rgba(184, 212, 232, 0.08);
  }

  .step.done .step-num {
    background: var(--blue);
    border-color: var(--blue);
    color: var(--black);
  }

  .step-num-check {
    display: none;
  }

  .step.done .step-num-check { display: block; }
  .step.done .step-num-digit { display: none; }

  .step-title {
    font-size: 15px;
    font-weight: 500;
    color: var(--muted);
    transition: color 0.2s;
  }

  .step.active .step-title,
  .step.done .step-title {
    color: var(--white);
  }

  .step-body {
    display: none;
    padding: 0 24px 28px 68px;
  }

  .step.active .step-body { display: block; }

  .step-body p {
    color: #aaa;
    font-size: 14px;
    margin-bottom: 20px;
    line-height: 1.7;
  }

  /* Code block */
  .code-block {
    background: #0d0d0d;
    border: 1px solid #1e1e1e;
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 20px;
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: var(--blue-bright);
    line-height: 1.8;
    position: relative;
  }

  .code-block .comment {
    color: #444;
  }

  /* Keyboard shortcut display */
  .kbd-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .kbd-label {
    font-size: 12px;
    color: var(--muted);
    margin-right: 4px;
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #141414;
    border: 1px solid #2e2e2e;
    border-bottom: 2px solid #2e2e2e;
    border-radius: 6px;
    padding: 4px 10px;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: var(--blue);
    box-shadow: 0 1px 0 #000;
    white-space: nowrap;
  }

  .kbd-plus {
    color: #333;
    font-size: 14px;
  }

  /* Click target callout */
  .callout {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    background: rgba(184, 212, 232, 0.04);
    border: 1px solid rgba(184, 212, 232, 0.1);
    border-radius: 8px;
    padding: 14px 16px;
    margin-bottom: 20px;
  }

  .callout-icon {
    font-size: 18px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .callout-text {
    font-size: 13px;
    color: #aaa;
    line-height: 1.6;
  }

  .callout-text strong {
    color: var(--blue);
    font-weight: 500;
  }

  /* Buttons */
  .btn-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 18px;
    border-radius: 7px;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.15s;
    text-decoration: none;
  }

  .btn-primary {
    background: var(--blue);
    color: var(--black);
  }

  .btn-primary:hover {
    background: var(--blue-bright);
  }

  .btn-ghost {
    background: transparent;
    color: #666;
    border: 1px solid #222;
  }

  .btn-ghost:hover {
    color: var(--white);
    border-color: #333;
  }

  /* Done state */
  .done-banner {
    display: none;
    margin-top: 40px;
    padding: 28px 32px;
    background: rgba(184, 212, 232, 0.04);
    border: 1px solid rgba(184, 212, 232, 0.12);
    border-radius: 12px;
    text-align: center;
    opacity: 0;
    animation: fadeUp 0.4s ease forwards;
  }

  .done-banner.visible { display: block; }

  .done-banner .heel-big {
    width: 48px;
    height: 48px;
    margin: 0 auto 16px;
    opacity: 0.7;
  }

  .done-banner h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--white);
    margin-bottom: 8px;
  }

  .done-banner p {
    color: var(--muted);
    font-size: 14px;
    margin-bottom: 24px;
  }

  /* Progress bar */
  .progress-bar {
    display: flex;
    gap: 6px;
    margin-bottom: 40px;
    opacity: 0;
    animation: fadeUp 0.5s ease 0.05s forwards;
  }

  .progress-dot {
    height: 3px;
    flex: 1;
    border-radius: 2px;
    background: #1e1e1e;
    transition: background 0.3s;
  }

  .progress-dot.active { background: var(--blue); }
  .progress-dot.done { background: rgba(184, 212, 232, 0.4); }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="logo-row">
      <!-- Inline heel SVG in brand colors -->
      <svg class="logo-heel" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="38,20 52,65 28,75 22,75 22,80 45,80 45,75 54,75 70,75 70,80 78,80 78,75 54,75 52,65 62,30" fill="#b8d4e8"/>
        <line x1="18" y1="80" x2="82" y2="80" stroke="#b8d4e8" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <span class="brand">commitr</span>
    </div>
    <h1>Two minutes to your first AI commit</h1>
    <p>Local. Private. No API keys. Just your code and a model that lives on your machine.</p>
  </div>

  <div class="progress-bar" id="progressBar">
    <div class="progress-dot active" id="dot0"></div>
    <div class="progress-dot" id="dot1"></div>
    <div class="progress-dot" id="dot2"></div>
  </div>

  <div class="steps" id="steps">

    <!-- Step 1 -->
    <div class="step active" id="step0">
      <div class="step-header" onclick="toggleStep(0)">
        <div class="step-num">
          <span class="step-num-digit">1</span>
          <span class="step-num-check">✓</span>
        </div>
        <div class="step-title">Install Ollama</div>
      </div>
      <div class="step-body">
        <p>Commitr uses Ollama to run AI locally. Your diffs never leave your machine — no cloud, no keys, no cost.</p>
        <div class="callout">
          <span class="callout-icon">↗</span>
          <div class="callout-text">
            Head to <strong>ollama.com</strong> and download it for your OS. Takes about a minute.
          </div>
        </div>
        <div class="btn-row">
          <a class="btn btn-primary" href="https://ollama.com" target="_blank">Download Ollama</a>
          <button class="btn btn-ghost" onclick="markDone(0)">Already installed</button>
        </div>
      </div>
    </div>

    <!-- Step 2 -->
    <div class="step" id="step1">
      <div class="step-header" onclick="toggleStep(1)">
        <div class="step-num">
          <span class="step-num-digit">2</span>
          <span class="step-num-check">✓</span>
        </div>
        <div class="step-title">Pull the model and start Ollama</div>
      </div>
      <div class="step-body">
        <p>Open your terminal and run these two commands. The model is about 2GB and only downloads once.</p>
        <div class="code-block">
          <span class="comment"># pull the model (one time only)</span><br/>
          ollama pull qwen2.5:3b<br/><br/>
          <span class="comment"># start ollama (run this each session)</span><br/>
          ollama serve
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" onclick="openTerminal()">Open Terminal</button>
          <button class="btn btn-ghost" onclick="markDone(1)">Done</button>
        </div>
      </div>
    </div>

    <!-- Step 3 -->
    <div class="step" id="step2">
      <div class="step-header" onclick="toggleStep(2)">
        <div class="step-num">
          <span class="step-num-digit">3</span>
          <span class="step-num-check">✓</span>
        </div>
        <div class="step-title">Make your first AI commit</div>
      </div>
      <div class="step-body">
        <p>Stage a file, then trigger Commitr. It reads your diff and runs the commit in your terminal automatically.</p>

        <div class="callout">
          <span class="callout-icon">🖱</span>
          <div class="callout-text">
            Click the <strong>$(git-commit) icon</strong> in the Source Control panel header (top of the left sidebar)
          </div>
        </div>

        <p style="margin-bottom: 12px; font-size: 13px; color: #555;">Or use the keyboard shortcut:</p>

        <div class="kbd-row">
          <span class="kbd-label">Windows / Linux</span>
          <kbd>Ctrl</kbd>
          <span class="kbd-plus">+</span>
          <kbd>Shift</kbd>
          <span class="kbd-plus">+</span>
          <kbd>Alt</kbd>
          <span class="kbd-plus">+</span>
          <kbd>C</kbd>
        </div>

        <div class="kbd-row">
          <span class="kbd-label">Mac</span>
          <kbd>⌘ Cmd</kbd>
          <span class="kbd-plus">+</span>
          <kbd>⇧ Shift</kbd>
          <span class="kbd-plus">+</span>
          <kbd>⌥ Alt</kbd>
          <span class="kbd-plus">+</span>
          <kbd>C</kbd>
        </div>

        <div class="btn-row" style="margin-top: 20px;">
          <button class="btn btn-primary" onclick="openScm()">Open Source Control</button>
          <button class="btn btn-ghost" onclick="markDone(2)">Done</button>
        </div>
      </div>
    </div>

  </div>

  <!-- Done banner -->
  <div class="done-banner" id="doneBanner">
    <svg class="heel-big" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="38,20 52,65 28,75 22,75 22,80 45,80 45,75 54,75 70,75 70,80 78,80 78,75 54,75 52,65 62,30" fill="#b8d4e8"/>
      <line x1="18" y1="80" x2="82" y2="80" stroke="#b8d4e8" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
    <h2>You're all set.</h2>
    <p>Stage anything, press the button, watch it commit. That's all there is to it.</p>
    <div class="btn-row" style="justify-content: center;">
      <button class="btn btn-primary" onclick="openScm()">Open Source Control</button>
      <button class="btn btn-ghost" onclick="openSettings()">Settings</button>
    </div>
  </div>

</div>

<script>
  const vscode = acquireVsCodeApi();
  let currentStep = 0;
  const totalSteps = 3;

  function updateProgress() {
    for (let i = 0; i < totalSteps; i++) {
      const dot = document.getElementById('dot' + i);
      const step = document.getElementById('step' + i);
      dot.className = 'progress-dot';
      if (step.classList.contains('done')) dot.classList.add('done');
      else if (i === currentStep) dot.classList.add('active');
    }
  }

  function toggleStep(index) {
    const step = document.getElementById('step' + index);
    if (step.classList.contains('done')) return;
    currentStep = index;
    document.querySelectorAll('.step').forEach((s, i) => {
      if (i !== index) s.classList.remove('active');
    });
    step.classList.toggle('active');
    updateProgress();
  }

  function markDone(index) {
    const step = document.getElementById('step' + index);
    step.classList.remove('active');
    step.classList.add('done');

    const allDone = Array.from({length: totalSteps}, (_, i) =>
      document.getElementById('step' + i).classList.contains('done')
    ).every(Boolean);

    if (allDone) {
      document.getElementById('doneBanner').classList.add('visible');
      updateProgress();
      return;
    }

    // Open next step
    const next = index + 1;
    if (next < totalSteps) {
      currentStep = next;
      document.getElementById('step' + next).classList.add('active');
    }
    updateProgress();
  }

  function openTerminal() {
    vscode.postMessage({ command: 'openTerminal' });
    markDone(1);
  }

  function openScm() {
    vscode.postMessage({ command: 'openScm' });
  }

  function openSettings() {
    vscode.postMessage({ command: 'openSettings' });
  }
</script>
</body>
</html>`;
  }
}
