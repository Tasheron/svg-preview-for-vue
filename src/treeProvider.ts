import * as vscode from 'vscode';
import { SvgPreviewCache } from './cache';
import { formatDimensions, previewImageUri } from './rendering';
import { SvgPreview } from './types';

const workspaceGlob = '**/*.{vue,html,tsx,jsx}';
const excludeGlob = '**/{node_modules,dist,out,.git,.vscode-test}/**';

export class SvgExplorerProvider implements vscode.TreeDataProvider<SvgTreeItem>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<SvgTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private items: SvgTreeItem[] = [];
  private scanHandle: NodeJS.Timeout | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly cache: SvgPreviewCache) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.cache.invalidate(event.document.uri);
        this.scheduleRefresh();
      }),
      vscode.workspace.onDidCreateFiles(() => this.scheduleRefresh()),
      vscode.workspace.onDidDeleteFiles(() => this.scheduleRefresh()),
      vscode.workspace.onDidRenameFiles(() => this.scheduleRefresh())
    );

    void this.refresh();
  }

  getTreeItem(element: SvgTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): SvgTreeItem[] {
    return this.items;
  }

  async refresh(): Promise<void> {
    const files = await vscode.workspace.findFiles(workspaceGlob, excludeGlob);
    const nextItems: SvgTreeItem[] = [];

    await Promise.all(
      files.map(async (uri) => {
        const previews = await this.cache.getForUri(uri);
        for (const preview of previews) {
          nextItems.push(new SvgTreeItem(preview));
        }
      })
    );

    this.items = nextItems.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    this.changeEmitter.fire();
  }

  dispose(): void {
    if (this.scanHandle) {
      clearTimeout(this.scanHandle);
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }

    this.changeEmitter.dispose();
  }

  private scheduleRefresh(): void {
    if (this.scanHandle) {
      clearTimeout(this.scanHandle);
    }

    this.scanHandle = setTimeout(() => {
      this.scanHandle = undefined;
      void this.refresh();
    }, 350);
  }
}

export class SvgTreeItem extends vscode.TreeItem {
  readonly sortKey: string;

  constructor(readonly preview: SvgPreview) {
    const relativePath = vscode.workspace.asRelativePath(preview.uri);
    const label = `${relativePath} #${preview.index + 1}`;
    super(label, vscode.TreeItemCollapsibleState.None);

    this.sortKey = `${relativePath}:${preview.index.toString().padStart(4, '0')}`;
    this.description = formatDimensions(preview);
    this.tooltip = `${relativePath}\n${formatDimensions(preview)}`;
    this.contextValue = 'svgPreviewItem';
    this.iconPath = previewImageUri(preview, {
      size: 48,
      maxWidth: 48,
      background: 'transparent',
      border: true
    });
    this.command = {
      title: 'Reveal SVG',
      command: 'svgPreview.revealSvg',
      arguments: [{ uri: preview.uri.toString(), index: preview.index }]
    };
  }
}
