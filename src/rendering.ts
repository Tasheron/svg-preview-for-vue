import * as vscode from 'vscode';
import { PreviewBackground, SvgPreview } from './types';

export function svgDataUri(svg: string): vscode.Uri {
  return vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`);
}

export function previewImageUri(preview: SvgPreview, options: { size: number; maxWidth: number; background: PreviewBackground; border: boolean }): vscode.Uri {
  return svgDataUri(wrapSvg(preview, options));
}

export function wrapSvg(
  preview: SvgPreview,
  options: { size: number; maxWidth: number; background: PreviewBackground; border: boolean }
): string {
  const dimensions = getPreviewDimensions(preview, options.size, options.maxWidth);
  const background = backgroundColor(options.background);
  const border = options.border ? `<rect x="0.5" y="0.5" width="${dimensions.width - 1}" height="${dimensions.height - 1}" rx="8" fill="none" stroke="rgba(127,127,127,.35)"/>` : '';
  const encoded = Buffer.from(preview.sanitized, 'utf8').toString('base64');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}">
  <rect width="100%" height="100%" rx="8" fill="${background}"/>
  ${border}
  <image href="data:image/svg+xml;base64,${encoded}" x="8" y="8" width="${dimensions.width - 16}" height="${dimensions.height - 16}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

export function getPreviewDimensions(preview: SvgPreview, targetHeight: number, maxWidth: number): { width: number; height: number } {
  const width = preview.dimensions.width;
  const height = preview.dimensions.height;
  const aspectRatio = width && height ? width / height : 1;
  const frameHeight = Math.max(24, Math.round(targetHeight));
  const contentHeight = Math.max(8, frameHeight - 16);
  const contentWidth = Math.max(8, Math.round(contentHeight * aspectRatio));
  const frameWidth = Math.min(maxWidth, Math.max(frameHeight, contentWidth + 16));

  return {
    width: frameWidth,
    height: frameHeight
  };
}

export function backgroundColor(background: PreviewBackground): string {
  if (background === 'white') {
    return '#ffffff';
  }

  if (background === 'dark') {
    return '#111827';
  }

  return 'transparent';
}

export function formatDimensions(preview: SvgPreview): string {
  const { width, height, viewBox } = preview.dimensions;
  const size = width && height ? `${trimNumber(width)} x ${trimNumber(height)}` : 'size unknown';
  return viewBox ? `${size}, viewBox ${viewBox}` : size;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '');
}
