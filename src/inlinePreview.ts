import * as vscode from 'vscode';
import { getConfig } from './config';
import { SvgPreviewCache } from './cache';
import { isSupportedDocument } from './parser';
import { formatDimensions, previewImageUri } from './rendering';
import { SvgPreview } from './types';

export class InlinePreviewController implements vscode.Disposable {
  private readonly previewDecorationTypes = new Map<string, vscode.TextEditorDecorationType>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly cache: SvgPreviewCache) {
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshVisibleEditors()),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!getConfig().autoRefresh || !isSupportedDocument(event.document)) {
          return;
        }

        this.cache.invalidate(event.document.uri);
        this.refreshEditorForDocument(event.document);
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('svgPreview')) {
          this.refreshVisibleEditors();
        }
      })
    );

    this.refreshVisibleEditors();
  }

  refreshVisibleEditors(): void {
    this.clearPreviewDecorations();

    for (const editor of vscode.window.visibleTextEditors) {
      this.refreshEditor(editor);
    }
  }

  dispose(): void {
    this.clearPreviewDecorations();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private refreshEditorForDocument(_document: vscode.TextDocument): void {
    this.refreshVisibleEditors();
  }

  private refreshEditor(editor: vscode.TextEditor): void {
    if (!isSupportedDocument(editor.document)) {
      return;
    }

    const config = getConfig();
    for (const preview of this.cache.getForDocument(editor.document)) {
      const decorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: previewImageUri(preview, {
          size: Math.min(config.previewSize, 56),
          maxWidth: Math.min(config.maxPreviewWidth, 180),
          background: config.background,
          border: config.showBorder
        }),
        gutterIconSize: 'contain',
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
      });

      this.previewDecorationTypes.set(preview.id, decorationType);
      editor.setDecorations(decorationType, [this.toGutterDecoration(editor.document, preview)]);
    }
  }

  private toGutterDecoration(document: vscode.TextDocument, preview: SvgPreview): vscode.DecorationOptions {
    const line = document.lineAt(preview.range.start.line);
    const start = line.range.start;
    const end = start.translate(0, Math.max(1, Math.min(line.text.length, 1)));
    const markdown = new vscode.MarkdownString(`SVG preview: ${formatDimensions(preview)}`);
    markdown.isTrusted = true;

    return {
      range: new vscode.Range(start, end),
      hoverMessage: markdown
    };
  }

  private clearPreviewDecorations(): void {
    for (const decorationType of this.previewDecorationTypes.values()) {
      decorationType.dispose();
    }

    this.previewDecorationTypes.clear();
  }
}

export class SvgCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changeEmitter.event;

  constructor(private readonly cache: SvgPreviewCache) {}

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!isSupportedDocument(document)) {
      return [];
    }

    return this.cache.getForDocument(document).flatMap((preview) => {
      const range = new vscode.Range(preview.range.start, preview.range.start);
      const reference = { uri: preview.uri.toString(), index: preview.index };

      return [
        new vscode.CodeLens(range, {
          title: 'Open SVG Preview',
          command: 'svgPreview.openPreview',
          arguments: [reference]
        }),
        new vscode.CodeLens(range, {
          title: 'Copy SVG',
          command: 'svgPreview.copySvg',
          arguments: [reference]
        }),
        new vscode.CodeLens(range, {
          title: 'Export PNG',
          command: 'svgPreview.exportPng',
          arguments: [reference]
        })
      ];
    });
  }

  refresh(): void {
    this.changeEmitter.fire();
  }
}
