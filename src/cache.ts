import * as vscode from 'vscode';
import { parseSvgPreviews, parseSvgText } from './parser';
import { CachedDocument, SvgPreview } from './types';

export class SvgPreviewCache {
  private readonly documents = new Map<string, CachedDocument>();

  getForDocument(document: vscode.TextDocument): SvgPreview[] {
    const key = document.uri.toString();
    const cached = this.documents.get(key);

    if (cached?.version === document.version) {
      return cached.previews;
    }

    const previews = parseSvgPreviews(document);
    this.documents.set(key, {
      version: document.version,
      previews
    });

    return previews;
  }

  async getForUri(uri: vscode.Uri): Promise<SvgPreview[]> {
    const openDocument = vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
    if (openDocument) {
      return this.getForDocument(openDocument);
    }

    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString('utf8');
    const previews = parseSvgText(text, uri, offsetToPositionFactory(text));
    this.documents.set(uri.toString(), {
      version: -1,
      previews
    });

    return previews;
  }

  async resolve(reference: { uri: string; index: number } | string | undefined): Promise<SvgPreview | undefined> {
    if (!reference) {
      return this.activePreview();
    }

    if (typeof reference === 'string') {
      return this.findByRaw(reference);
    }

    const uri = vscode.Uri.parse(reference.uri);
    return (await this.getForUri(uri))[reference.index];
  }

  invalidate(uri?: vscode.Uri): void {
    if (uri) {
      this.documents.delete(uri.toString());
      return;
    }

    this.documents.clear();
  }

  private activePreview(): SvgPreview | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }

    const previews = this.getForDocument(editor.document);
    const activeOffset = editor.document.offsetAt(editor.selection.active);
    return (
      previews.find((preview) => activeOffset >= preview.startOffset && activeOffset <= preview.endOffset) ??
      previews.find((preview) => preview.range.start.line >= editor.selection.active.line) ??
      previews[0]
    );
  }

  private findByRaw(raw: string): SvgPreview | undefined {
    for (const document of vscode.workspace.textDocuments) {
      const preview = this.getForDocument(document).find((candidate) => candidate.raw === raw || candidate.sanitized === raw);
      if (preview) {
        return preview;
      }
    }

    return undefined;
  }
}

function offsetToPositionFactory(text: string): (offset: number) => vscode.Position {
  const lineStarts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      lineStarts.push(index + 1);
    }
  }

  return (offset: number) => {
    let low = 0;
    let high = lineStarts.length - 1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const start = lineStarts[middle];

      if (start === offset) {
        return new vscode.Position(middle, 0);
      }

      if (start < offset) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    const line = Math.max(0, low - 1);
    return new vscode.Position(line, offset - lineStarts[line]);
  };
}
