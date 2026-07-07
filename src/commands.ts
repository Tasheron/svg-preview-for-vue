import * as vscode from 'vscode';
import { SvgPreviewCache } from './cache';
import { InlinePreviewController, SvgCodeLensProvider } from './inlinePreview';
import { SvgPreviewPanel } from './previewPanel';
import { SvgExplorerProvider } from './treeProvider';
import { SvgReference } from './types';

export function registerCommands(
  context: vscode.ExtensionContext,
  cache: SvgPreviewCache,
  inlinePreview: InlinePreviewController,
  codeLensProvider: SvgCodeLensProvider,
  explorerProvider: SvgExplorerProvider,
  panel: SvgPreviewPanel
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('svgPreview.openPreview', async (reference?: SvgReference) => {
      const preview = await cache.resolve(reference);
      if (!preview) {
        void vscode.window.showInformationMessage('No inline SVG found in the active editor.');
        return;
      }

      panel.show(preview);
    }),
    vscode.commands.registerCommand('svgPreview.refresh', async () => {
      cache.invalidate();
      inlinePreview.refreshVisibleEditors();
      codeLensProvider.refresh();
      await explorerProvider.refresh();
      vscode.window.setStatusBarMessage('SVG previews refreshed', 2500);
    }),
    vscode.commands.registerCommand('svgPreview.exportPng', async (reference?: SvgReference) => {
      const preview = await cache.resolve(reference);
      if (!preview) {
        void vscode.window.showInformationMessage('No inline SVG found to export.');
        return;
      }

      await panel.exportPng(preview);
    }),
    vscode.commands.registerCommand('svgPreview.copySvg', async (reference?: SvgReference | string) => {
      const preview = await cache.resolve(reference);
      if (!preview) {
        void vscode.window.showInformationMessage('No inline SVG found to copy.');
        return;
      }

      await vscode.env.clipboard.writeText(preview.raw);
      vscode.window.setStatusBarMessage('SVG copied to clipboard', 2500);
    }),
    vscode.commands.registerCommand('svgPreview.revealSvg', async (reference?: SvgReference) => {
      const preview = await cache.resolve(reference);
      if (!preview) {
        return;
      }

      const document = await vscode.workspace.openTextDocument(preview.uri);
      const editor = await vscode.window.showTextDocument(document, { preview: false });
      editor.selection = new vscode.Selection(preview.range.start, preview.range.start);
      editor.revealRange(preview.range, vscode.TextEditorRevealType.InCenter);
    })
  );
}
