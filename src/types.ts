import * as vscode from 'vscode';

export type PreviewBackground = 'transparent' | 'white' | 'dark';

export interface SvgPreviewConfig {
  previewSize: number;
  background: PreviewBackground;
  showBorder: boolean;
  autoRefresh: boolean;
  maxPreviewWidth: number;
  viewBoxBorderColor: string;
  clickZoomLevels: number[];
  fallbackFillColor: string;
  fallbackStrokeColor: string;
}

export interface SvgDimensions {
  width?: number;
  height?: number;
  viewBox?: string;
}

export interface SvgPreview {
  id: string;
  uri: vscode.Uri;
  index: number;
  range: vscode.Range;
  startOffset: number;
  endOffset: number;
  raw: string;
  sanitized: string;
  dimensions: SvgDimensions;
}

export interface CachedDocument {
  version: number;
  previews: SvgPreview[];
}

export interface SvgReference {
  uri: string;
  index: number;
}
