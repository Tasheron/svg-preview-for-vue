import * as vscode from 'vscode';
import { getConfig } from './config';
import { SvgPreviewCache } from './cache';
import { isSupportedDocument } from './parser';
import { formatDimensions, previewImageUri } from './rendering';

export class SvgHoverProvider implements vscode.HoverProvider {
  constructor(private readonly cache: SvgPreviewCache) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    if (!isSupportedDocument(document)) {
      return undefined;
    }

    const preview = this.cache
      .getForDocument(document)
      .find((candidate) => candidate.range.contains(position) && document.getText(new vscode.Range(candidate.range.start, candidate.range.start.translate(0, 4))).toLowerCase().startsWith('<svg'));

    if (!preview) {
      return undefined;
    }

    const config = getConfig();
    const image = previewImageUri(preview, {
      size: Math.max(180, config.previewSize * 2),
      maxWidth: Math.max(360, config.maxPreviewWidth),
      background: config.background,
      border: config.showBorder
    });
    const reference = encodeURIComponent(JSON.stringify([{ uri: preview.uri.toString(), index: preview.index }]));
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.isTrusted = {
      enabledCommands: ['svgPreview.copySvg', 'svgPreview.openPreview']
    };
    markdown.supportHtml = true;
    markdown.appendMarkdown(`![SVG preview](${image.toString()})\n\n`);
    markdown.appendMarkdown(`**${formatDimensions(preview)}**\n\n`);
    if (preview.dimensions.viewBox) {
      markdown.appendMarkdown(`viewBox: \`${preview.dimensions.viewBox}\`\n\n`);
    }
    markdown.appendMarkdown(`[Copy SVG](command:svgPreview.copySvg?${reference}) | [Open Preview](command:svgPreview.openPreview?${reference})`);

    return new vscode.Hover(markdown, preview.range);
  }
}
