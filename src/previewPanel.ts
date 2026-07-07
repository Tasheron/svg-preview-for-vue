import * as vscode from 'vscode';
import { getConfig } from './config';
import { backgroundColor, formatDimensions } from './rendering';
import { SvgPreview } from './types';

export class SvgPreviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private activePreview: SvgPreview | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  show(preview: SvgPreview): void {
    this.activePreview = preview;

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel('svgPreview.panel', 'SVG Preview', vscode.ViewColumn.Beside, {
        enableScripts: true,
        localResourceRoots: [this.extensionUri],
        retainContextWhenHidden: true
      });

      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.activePreview = undefined;
      });

      this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
        void this.handleMessage(message);
      });
    }

    this.panel.title = `SVG Preview: ${vscode.workspace.asRelativePath(preview.uri)}`;
    this.panel.webview.html = this.getHtml(this.panel.webview, preview);
    this.panel.reveal(vscode.ViewColumn.Beside);
  }

  async exportPng(preview: SvgPreview): Promise<void> {
    this.show(preview);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await this.panel?.webview.postMessage({ type: 'exportPng' });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === 'copy' && this.activePreview) {
      await vscode.env.clipboard.writeText(this.activePreview.raw);
      vscode.window.setStatusBarMessage('SVG copied to clipboard', 2500);
      return;
    }

    if (message.type === 'pngData' && Array.isArray(message.bytes)) {
      const target = await vscode.window.showSaveDialog({
        defaultUri: defaultPngUri(this.activePreview),
        filters: {
          'PNG image': ['png']
        },
        saveLabel: 'Export PNG'
      });

      if (!target) {
        return;
      }

      await vscode.workspace.fs.writeFile(target, Uint8Array.from(message.bytes));
      vscode.window.setStatusBarMessage(`PNG exported to ${vscode.workspace.asRelativePath(target)}`, 3500);
      return;
    }

    if (message.type === 'error' && message.message) {
      void vscode.window.showErrorMessage(message.message);
    }
  }

  private getHtml(webview: vscode.Webview, preview: SvgPreview): string {
    const nonce = createNonce();
    const config = getConfig();
    const raw = JSON.stringify(preview.raw);
    const sanitized = JSON.stringify(preview.sanitized);
    const initialBackground = JSON.stringify(config.background);
    const viewBoxBorderColor = JSON.stringify(config.viewBoxBorderColor);
    const clickZoomLevels = JSON.stringify([1, ...config.clickZoomLevels.map((level) => level / 100)]);
    const dimensions = escapeHtml(formatDimensions(preview));
    const background = backgroundColor(config.background);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>SVG Preview</title>
  <style>
    :root {
      color-scheme: light dark;
      --panel-border: color-mix(in srgb, var(--vscode-foreground) 18%, transparent);
    }
    body {
      margin: 0;
      padding: 18px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 16px;
    }
    button, select {
      border: 1px solid var(--panel-border);
      border-radius: 6px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      padding: 6px 10px;
      font: inherit;
      cursor: pointer;
    }
    select {
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .meta {
      margin-left: auto;
      opacity: .8;
      font-size: 12px;
    }
    .hint {
      width: 100%;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .stage {
      min-height: 60vh;
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      display: grid;
      place-items: center;
      overflow: auto;
      cursor: zoom-in;
      user-select: none;
      background: ${background};
      background-image:
        linear-gradient(45deg, rgba(127,127,127,.16) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(127,127,127,.16) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(127,127,127,.16) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(127,127,127,.16) 75%);
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0;
    }
    .stage[data-background="white"], .stage[data-background="dark"] {
      background-image: none;
    }
    .artboard {
      padding: 24px;
      transform-origin: center;
      transition: transform .12s ease;
      will-change: transform;
    }
    .viewbox-frame {
      display: inline-block;
      outline: 1px dashed var(--viewbox-border-color, var(--vscode-focusBorder));
      outline-offset: 0;
      box-shadow: 0 0 0 1px rgba(127, 127, 127, .12);
    }
    .viewbox-frame svg {
      display: block;
      max-width: min(80vw, 1200px);
      max-height: 70vh;
      width: auto;
      height: auto;
    }
    @media (max-width: 640px) {
      body { padding: 12px; }
      .meta { width: 100%; margin-left: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar" role="toolbar" aria-label="SVG preview controls">
    <select id="background" aria-label="Preview background">
      <option value="white">White</option>
      <option value="dark">Dark</option>
      <option value="transparent">Transparent</option>
    </select>
    <button id="copy">Copy SVG</button>
    <button id="export">Export PNG</button>
    <span class="meta"><span id="zoomLabel">100%</span> · ${dimensions}</span>
    <span class="hint">Click the preview to zoom through the configured levels, then reset to 100%. Option-click or right-click zooms out. Pinch or scroll on the trackpad to zoom smoothly.</span>
  </div>
  <main id="stage" class="stage">
    <div id="artboard" class="artboard">
      <div id="viewboxFrame" class="viewbox-frame"></div>
    </div>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const rawSvg = ${raw};
    const sanitizedSvg = ${sanitized};
    const initialBackground = ${initialBackground};
    const viewBoxBorderColor = ${viewBoxBorderColor};
    const zoomSteps = ${clickZoomLevels};
    const stage = document.getElementById('stage');
    const artboard = document.getElementById('artboard');
    const viewboxFrame = document.getElementById('viewboxFrame');
    const background = document.getElementById('background');
    const zoomLabel = document.getElementById('zoomLabel');
    let zoom = 1;
    const maxZoom = zoomSteps[zoomSteps.length - 1] ?? 1;

    viewboxFrame.innerHTML = sanitizedSvg;
    if (CSS.supports('color', viewBoxBorderColor)) {
      viewboxFrame.style.setProperty('--viewbox-border-color', viewBoxBorderColor);
    }
    background.value = initialBackground;
    setBackground(initialBackground);
    setZoom(1);

    background.addEventListener('change', () => setBackground(background.value));
    document.getElementById('copy').addEventListener('click', () => {
      navigator.clipboard.writeText(rawSvg).catch(() => vscode.postMessage({ type: 'copy' }));
    });
    document.getElementById('export').addEventListener('click', exportPng);
    stage.addEventListener('click', (event) => {
      if (event.altKey) {
        stepZoom(-1);
        return;
      }

      stepZoom(1);
    });
    stage.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      stepZoom(-1);
    });
    stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      const intensity = event.ctrlKey || event.metaKey ? 0.004 : 0.0025;
      const nextZoom = zoom * Math.exp(-event.deltaY * intensity);
      setZoom(nextZoom);
    }, { passive: false });

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'exportPng') {
        exportPng();
      }
    });

    function setZoom(value) {
      zoom = Math.min(maxZoom, Math.max(1, value));
      artboard.style.transform = 'scale(' + zoom + ')';
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
      stage.style.cursor = zoom >= maxZoom ? 'zoom-out' : 'zoom-in';
    }

    function stepZoom(direction) {
      if (direction > 0) {
        if (zoom >= maxZoom) {
          setZoom(1);
          return;
        }

        setZoom(zoomSteps.find((step) => step > zoom + 0.001) ?? maxZoom);
        return;
      }

      setZoom([...zoomSteps].reverse().find((step) => step < zoom - 0.001) ?? 1);
    }

    function setBackground(value) {
      stage.dataset.background = value;
      stage.style.backgroundColor = value === 'white' ? '#ffffff' : value === 'dark' ? '#111827' : 'transparent';
    }

    async function exportPng() {
      try {
        const svgBlob = new Blob([sanitizedSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const image = new Image();
        image.decoding = 'async';
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, image.naturalWidth || image.width || 1024);
        canvas.height = Math.max(1, image.naturalHeight || image.height || 1024);
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Could not create PNG canvas.');
        }
        if (background.value === 'white' || background.value === 'dark') {
          context.fillStyle = background.value === 'white' ? '#ffffff' : '#111827';
          context.fillRect(0, 0, canvas.width, canvas.height);
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) {
          throw new Error('Could not encode PNG.');
        }
        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        vscode.postMessage({ type: 'pngData', bytes });
      } catch (error) {
        vscode.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    }
  </script>
</body>
</html>`;
  }
}

type WebviewMessage =
  | { type: 'copy' }
  | { type: 'exportPng' }
  | { type: 'pngData'; bytes: number[] }
  | { type: 'error'; message?: string };

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return nonce;
}

function defaultPngUri(preview: SvgPreview | undefined): vscode.Uri | undefined {
  if (!preview) {
    return undefined;
  }

  const parsed = vscode.Uri.parse(preview.uri.toString());
  const fileName = parsed.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'svg-preview';
  return parsed.with({ path: parsed.path.replace(/[^/]+$/, `${fileName}-${preview.index + 1}.png`) });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
