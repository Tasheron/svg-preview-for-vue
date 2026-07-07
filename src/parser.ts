import * as vscode from 'vscode';
import render from 'dom-serializer';
import { parseDocument } from 'htmlparser2';
import { ChildNode, Element, isTag } from 'domhandler';
import { getConfig } from './config';
import { SvgDimensions, SvgPreview, SvgPreviewConfig } from './types';

const supportedLanguageIds = new Set(['vue', 'html', 'typescriptreact', 'javascriptreact']);
const supportedExtensions = new Set(['.vue', '.html', '.tsx', '.jsx']);
const dangerousElementNames = new Set(['script']);

export function isSupportedDocument(document: vscode.TextDocument): boolean {
  if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
    return false;
  }

  if (supportedLanguageIds.has(document.languageId)) {
    return true;
  }

  const path = document.uri.path.toLowerCase();
  return [...supportedExtensions].some((extension) => path.endsWith(extension));
}

export function parseSvgPreviews(document: vscode.TextDocument): SvgPreview[] {
  if (!isSupportedDocument(document)) {
    return [];
  }

  return parseSvgText(document.getText(), document.uri, (offset) => document.positionAt(offset));
}

export function parseSvgText(
  text: string,
  uri: vscode.Uri,
  positionAt: (offset: number) => vscode.Position
): SvgPreview[] {
  const dom = parseDocument(text, {
    lowerCaseAttributeNames: false,
    recognizeSelfClosing: true,
    withEndIndices: true,
    withStartIndices: true
  });

  const elements: Element[] = [];
  collectSvgElements(dom.children, elements);

  return elements
    .filter((element) => typeof element.startIndex === 'number' && typeof element.endIndex === 'number')
    .map((element, index) => {
      const startOffset = element.startIndex ?? 0;
      const endOffset = (element.endIndex ?? startOffset) + 1;
      const raw = text.slice(startOffset, endOffset);
      const sanitized = sanitizeSvgElement(element);
      const range = new vscode.Range(positionAt(startOffset), positionAt(endOffset));

      return {
        id: `${uri.toString()}#${index}:${startOffset}-${endOffset}`,
        uri,
        index,
        range,
        startOffset,
        endOffset,
        raw,
        sanitized,
        dimensions: getDimensions(element)
      };
    });
}

function collectSvgElements(nodes: ChildNode[], results: Element[]): void {
  for (const node of nodes) {
    if (!isTag(node)) {
      continue;
    }

    if (node.name.toLowerCase() === 'svg') {
      results.push(node);
    }

    collectSvgElements(node.children, results);
  }
}

function sanitizeSvgElement(element: Element): string {
  const config = getConfig();
  const cloned = cloneSafeElement(element, config);
  const dimensions = getDimensions(element);
  cloned.attribs = {
    xmlns: 'http://www.w3.org/2000/svg',
    ...cloned.attribs
  };

  if (!cloned.attribs.width && dimensions.width) {
    cloned.attribs.width = trimSvgNumber(dimensions.width);
  }

  if (!cloned.attribs.height && dimensions.height) {
    cloned.attribs.height = trimSvgNumber(dimensions.height);
  }

  return render(cloned, {
    decodeEntities: true,
    encodeEntities: 'utf8',
    selfClosingTags: true,
    xmlMode: 'foreign'
  }).trim();
}

function cloneSafeElement(element: Element, config: SvgPreviewConfig): Element {
  const cloned = new Element(element.name, sanitizeAttributes(element.attribs ?? {}, config), []);
  cloned.children = element.children.flatMap((child) => cloneSafeNode(child, config));
  return cloned;
}

function cloneSafeNode(node: ChildNode, config: SvgPreviewConfig): ChildNode[] {
  if (isTag(node)) {
    if (dangerousElementNames.has(node.name.toLowerCase())) {
      return [];
    }

    return [cloneSafeElement(node, config)];
  }

  return [node];
}

function sanitizeAttributes(attributes: Record<string, string>, config: SvgPreviewConfig): Record<string, string> {
  const sanitized: Record<string, string> = {};
  const classPresentation = presentationFromClassList(attributes.class, config);

  for (const [name, value] of Object.entries(attributes)) {
    if (shouldDropAttribute(name)) {
      continue;
    }

    sanitized[name] = value;
  }

  for (const [name, value] of Object.entries(classPresentation)) {
    if (!sanitized[name]) {
      sanitized[name] = value;
    }
  }

  if (!sanitized.stroke && hasStrokePresentation(sanitized)) {
    sanitized.stroke = config.fallbackStrokeColor;
  }

  return sanitized;
}

function shouldDropAttribute(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized.startsWith('v-') ||
    normalized.startsWith(':') ||
    normalized.startsWith('@') ||
    normalized.startsWith('#') ||
    normalized.startsWith('on') ||
    normalized.includes('.')
  );
}

function hasStrokePresentation(attributes: Record<string, string>): boolean {
  return Object.keys(attributes).some((name) => {
    const normalized = name.toLowerCase();
    return (
      normalized === 'stroke-width' ||
      normalized === 'stroke-linecap' ||
      normalized === 'stroke-linejoin' ||
      normalized === 'stroke-dasharray' ||
      normalized === 'stroke-dashoffset' ||
      normalized === 'stroke-miterlimit' ||
      normalized === 'stroke-opacity'
    );
  });
}

function getDimensions(element: Element): SvgDimensions {
  const width = parseSvgLength(element.attribs?.width);
  const height = parseSvgLength(element.attribs?.height);
  const viewBox = element.attribs?.viewBox ?? element.attribs?.viewbox;
  const viewBoxDimensions = parseViewBox(viewBox);

  return {
    width: width ?? viewBoxDimensions?.width,
    height: height ?? viewBoxDimensions?.height,
    viewBox
  };
}

function parseSvgLength(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseViewBox(value: string | undefined): { width: number; height: number } | undefined {
  if (!value) {
    return undefined;
  }

  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }

  return {
    width: parts[2],
    height: parts[3]
  };
}

function presentationFromClassList(value: string | undefined, config: SvgPreviewConfig): Record<string, string> {
  if (!value) {
    return {};
  }

  const presentation: Record<string, string> = {};

  for (const className of value.split(/\s+/)) {
    const fill = parsePaintClass(className, 'fill', config);
    if (fill) {
      presentation.fill = fill;
      continue;
    }

    const stroke = parsePaintClass(className, 'stroke', config);
    if (stroke) {
      presentation.stroke = stroke;
    }
  }

  return presentation;
}

function parsePaintClass(className: string, prefix: 'fill' | 'stroke', config: SvgPreviewConfig): string | undefined {
  const exact = `${prefix}-`;
  if (!className.startsWith(exact)) {
    return undefined;
  }

  const value = className.slice(exact.length);
  if (value === 'none' || value === 'transparent' || value === 'currentColor') {
    return value;
  }

  if (value === 'current') {
    return 'currentColor';
  }

  if (prefix === 'fill' && value === 'black') {
    return config.fallbackFillColor;
  }

  if (prefix === 'stroke' && value === 'white') {
    return config.fallbackStrokeColor;
  }

  if (value === 'black' || value === 'white') {
    return value;
  }

  const arbitrary = value.match(/^\[(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\([^)]+\)|hsla?\([^)]+\))\]$/);
  return arbitrary ? arbitrary[1] : undefined;
}

function trimSvgNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(3).replace(/\.?0+$/, '');
}
