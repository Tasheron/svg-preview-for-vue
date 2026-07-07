import * as vscode from 'vscode';
import { PreviewBackground, SvgPreviewConfig } from './types';

const backgrounds = new Set<PreviewBackground>(['transparent', 'white', 'dark']);

export function getConfig(): SvgPreviewConfig {
  const config = vscode.workspace.getConfiguration('svgPreview');
  const background = config.get<string>('background', 'transparent');

  return {
    previewSize: clamp(config.get<number>('previewSize', 56), 24, 512),
    background: backgrounds.has(background as PreviewBackground) ? (background as PreviewBackground) : 'transparent',
    showBorder: config.get<boolean>('showBorder', true),
    autoRefresh: config.get<boolean>('autoRefresh', true),
    maxPreviewWidth: clamp(config.get<number>('maxPreviewWidth', 180), 80, 1200),
    viewBoxBorderColor: sanitizeCssColor(config.get<string>('viewBoxBorderColor', '#4da3ff')),
    clickZoomLevels: sanitizeZoomLevels(config.get<number[]>('clickZoomLevels', [200, 400, 600, 800, 1000])),
    fallbackFillColor: sanitizeCssColor(config.get<string>('fallbackFillColor', 'black'), 'black'),
    fallbackStrokeColor: sanitizeCssColor(config.get<string>('fallbackStrokeColor', 'white'), 'white')
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sanitizeCssColor(value: string, fallback = '#4da3ff'): string {
  const trimmed = value.trim();
  return /^[#a-zA-Z0-9(),.%\s-]+$/.test(trimmed) ? trimmed : fallback;
}

function sanitizeZoomLevels(value: number[]): number[] {
  const levels = [...new Set(value.map((level) => Math.round(level)).filter((level) => level > 100 && level <= 10000))].sort((a, b) => a - b);
  return levels.length > 0 ? levels : [200, 400, 600, 800, 1000];
}
