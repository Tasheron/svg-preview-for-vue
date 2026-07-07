import * as vscode from 'vscode';
import { SvgPreviewCache } from './cache';
import { registerCommands } from './commands';
import { SvgHoverProvider } from './hoverProvider';
import { InlinePreviewController, SvgCodeLensProvider } from './inlinePreview';
import { SvgPreviewPanel } from './previewPanel';
import { SvgExplorerProvider } from './treeProvider';

const selectors: vscode.DocumentSelector = [
  { language: 'vue', scheme: 'file' },
  { language: 'html', scheme: 'file' },
  { language: 'typescriptreact', scheme: 'file' },
  { language: 'javascriptreact', scheme: 'file' },
  { pattern: '**/*.{vue,html,tsx,jsx}', scheme: 'file' }
];

export function activate(context: vscode.ExtensionContext): void {
  const cache = new SvgPreviewCache();
  const inlinePreview = new InlinePreviewController(cache);
  const codeLensProvider = new SvgCodeLensProvider(cache);
  const hoverProvider = new SvgHoverProvider(cache);
  const explorerProvider = new SvgExplorerProvider(cache);
  const panel = new SvgPreviewPanel(context.extensionUri);

  context.subscriptions.push(
    inlinePreview,
    explorerProvider,
    vscode.languages.registerCodeLensProvider(selectors, codeLensProvider),
    vscode.languages.registerHoverProvider(selectors, hoverProvider),
    vscode.window.registerTreeDataProvider('svgPreviewExplorer', explorerProvider)
  );

  registerCommands(context, cache, inlinePreview, codeLensProvider, explorerProvider, panel);
}

export function deactivate(): void {
  return;
}
