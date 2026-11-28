/**
 * Xuất file ngay trên trình duyệt, dùng khi máy chủ chưa cài MuseScore (lỗi 2704): PDF và SVG dàn trang bằng
 * OpenSheetMusicDisplay, WAV tổng hợp bằng bộ máy phát của trình phát. Bản nhạc lấy theo bản đã lưu, như khi máy chủ xuất.
 */
import { fetchMusicXml } from '../../../services';
import type { PdfOptions } from '../../../types/export';
import { deflate, makeImagePdf, makeZip } from './fileWriters';
import { rasterizeGray, renderScorePages } from './scorePages';

export interface ScoreHeaderFallback {
  title?: string | null;
  composer?: string | null;
}

/** Độ phân giải ảnh trang trong PDF: đủ nét để in, mỗi trang A4 khoảng vài trăm KB. */
const PDF_DPI = 240;
const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

/** Dàn trang mặc định khi xuất SVG (máy chủ cũng dùng mặc định của MuseScore). */
export const DEFAULT_PAGE_OPTIONS: PdfOptions = {
  pageSize: 'A4',
  orientation: 'PORTRAIT',
  staffSpaceMm: 1.75,
  marginMm: 15,
  showTitle: true,
  measureNumbers: 'SYSTEM',
  showChords: true,
};

/** MusicXML đã lưu của bản nhạc (lấy mỗi lần dựng để luôn theo bản mới nhất). */
export const loadScoreXml = (scoreId: string): Promise<string> => fetchMusicXml(scoreId);

export const svgBlob = (svg: string): Blob => new Blob([svg], { type: 'image/svg+xml' });

/** Trang 1 theo tùy chọn đang chọn, dạng SVG (xem trước). */
export async function previewFirstPage(
  xml: string,
  options: PdfOptions,
  fallback: ScoreHeaderFallback,
): Promise<{ svg: string; pages: number }> {
  const { svgs } = await renderScorePages(xml, options, fallback);
  return { svg: svgs[0], pages: svgs.length };
}

export interface LocalPdf {
  blob: Blob;
  pages: number;
  /** SVG trang 1 để xem trước khi bấm. */
  firstPage: string;
}

/** PDF gồm mỗi trang một ảnh xám nét cao. `onProgress(done, total)` báo tiến độ theo trang. */
export async function makeLocalPdf(
  xml: string,
  options: PdfOptions,
  fallback: ScoreHeaderFallback,
  title: string,
  onProgress?: (done: number, total: number) => void,
): Promise<LocalPdf> {
  const rendered = await renderScorePages(xml, options, fallback);
  const width = Math.round((rendered.widthMm / MM_PER_INCH) * PDF_DPI);
  const height = Math.round((rendered.heightMm / MM_PER_INCH) * PDF_DPI);
  const pages = [];
  for (const [i, svg] of rendered.svgs.entries()) {
    onProgress?.(i, rendered.svgs.length);
    pages.push({
      widthPt: (rendered.widthMm / MM_PER_INCH) * PT_PER_INCH,
      heightPt: (rendered.heightMm / MM_PER_INCH) * PT_PER_INCH,
      imageWidth: width,
      imageHeight: height,
      deflated: await deflate(await rasterizeGray(svg, width, height)),
    });
  }
  onProgress?.(rendered.svgs.length, rendered.svgs.length);
  return {
    blob: new Blob([makeImagePdf(pages, title)], { type: 'application/pdf' }),
    pages: pages.length,
    firstPage: rendered.svgs[0],
  };
}

/** Mọi trang SVG theo dàn trang mặc định. */
export async function makeLocalSvgPages(xml: string, fallback: ScoreHeaderFallback): Promise<string[]> {
  return (await renderScorePages(xml, DEFAULT_PAGE_OPTIONS, fallback)).svgs;
}

/** Gói các trang SVG thành ZIP: "{tên}-trang-1.svg", ... */
export function zipSvgPages(svgs: readonly string[], baseName: string): Blob {
  const encoder = new TextEncoder();
  const entries = svgs.map((svg, i) => ({ name: `${baseName}-trang-${i + 1}.svg`, data: encoder.encode(svg) }));
  return new Blob([makeZip(entries)], { type: 'application/zip' });
}

/** Tên file an toàn từ tên bản nhạc. */
export const safeBaseName = (title: string): string => title.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'ban-nhac';
