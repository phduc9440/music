/**
 * Dàn trang bản nhạc bằng OpenSheetMusicDisplay (cùng thư viện với trình xem) theo tùy chọn xuất PDF: khổ giấy, hướng,
 * cỡ khuông (mm), lề, tiêu đề, đánh số ô nhịp, hợp âm. Kết quả là chuỗi SVG của từng trang, có kích thước thật theo mm,
 * dùng cho xuất SVG / PDF ngay trên trình duyệt và cho ảnh xem trước.
 */
import { ScoreDocument } from '../../editor/core/ScoreDocument';
import { normalizeNoteSizes } from '../../editor/core/osmdBridge';
import { applyHeaderStyle, readHeader } from '../../editor/structure/header';
import type { PdfOptions } from '../../../types/export';

/** Khổ giấy dọc (mm). */
const PAPER_MM = { A4: [210, 297], LETTER: [215.9, 279.4] } as const;

/** OSMD: 1 đơn vị = khoảng cách giữa hai dòng kẻ khuông, vẽ thành 10 px khi zoom 1. */
const PX_PER_UNIT = 10;

export interface PageGeometry {
  widthMm: number;
  heightMm: number;
  /** Bề ngang khung vẽ (px) để một đơn vị OSMD đúng bằng `staffSpaceMm`. */
  hostWidthPx: number;
  /** Lề bốn phía theo đơn vị OSMD. */
  marginUnits: number;
  /** Chuỗi khổ giấy của OSMD, ví dụ "A4 P". */
  pageFormat: string;
}

/** Khổ trang và tỉ lệ vẽ ứng với tùy chọn xuất (thuần tính toán, có test). */
export function pageGeometry(options: PdfOptions): PageGeometry {
  const [short, long] = PAPER_MM[options.pageSize];
  const portrait = options.orientation === 'PORTRAIT';
  const widthMm = portrait ? short : long;
  const heightMm = portrait ? long : short;
  return {
    widthMm,
    heightMm,
    hostWidthPx: Math.round((widthMm / options.staffSpaceMm) * PX_PER_UNIT),
    marginUnits: options.marginMm / options.staffSpaceMm,
    pageFormat: `${options.pageSize === 'A4' ? 'A4' : 'Letter'} ${portrait ? 'P' : 'L'}`,
  };
}

export interface RenderedPages {
  /** SVG đầy đủ (có xmlns, width/height theo mm) của từng trang. */
  svgs: string[];
  widthMm: number;
  heightMm: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Bật ngắt hàng / ngắt trang theo file khi file có ghi (như trình xem). */
const fromXmlBreaks = (xml: string): boolean => /<print\b[^>]*\bnew-(?:system|page)="yes"/.test(xml);

/**
 * Dàn trang và vẽ mọi trang. `fallback`: tên bài / tác giả của bản nhạc, dùng khi file không ghi. Khung vẽ được gắn tạm
 * ngoài màn hình (OSMD cần đo chữ trong trang) rồi gỡ ngay.
 */
export async function renderScorePages(
  xml: string,
  options: PdfOptions,
  fallback: { title?: string | null; composer?: string | null } = {},
): Promise<RenderedPages> {
  const geometry = pageGeometry(options);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${geometry.hostWidthPx}px;visibility:hidden`;
  document.body.appendChild(host);
  try {
    const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: false,
      backend: 'svg',
      drawTitle: options.showTitle,
      drawSubtitle: options.showTitle,
      drawComposer: options.showTitle,
      drawLyricist: options.showTitle,
      drawCredits: options.showTitle,
      drawPartNames: false,
      drawMeasureNumbers: options.measureNumbers !== 'NONE',
      drawMeasureNumbersOnlyAtSystemStart: options.measureNumbers === 'SYSTEM',
      measureNumberInterval: 1,
      newSystemFromXML: fromXmlBreaks(xml),
      newPageFromXML: fromXmlBreaks(xml),
      pageFormat: geometry.pageFormat,
      pageBackgroundColor: 'white',
      defaultColorMusic: 'black',
    });
    const rules = osmd.EngravingRules as unknown as Record<string, number | boolean>;
    rules.RenderMultipleRestMeasures = false;
    rules.RenderChordSymbols = options.showChords;
    await osmd.load(xml);
    normalizeNoteSizes(osmd);
    if (options.showTitle) {
      const header = readHeader(ScoreDocument.parse(xml));
      applyHeaderStyle(osmd, header, {
        title: header.title || fallback.title?.trim() || '',
        composer: header.composer || fallback.composer?.trim() || '',
      });
    }
    // Lề đặt sau cùng vì setOptions / load có thể đặt lại các quy tắc trang
    rules.PageLeftMargin = geometry.marginUnits;
    rules.PageRightMargin = geometry.marginUnits;
    rules.PageTopMargin = geometry.marginUnits;
    rules.PageTopMarginNarrow = geometry.marginUnits;
    rules.PageBottomMargin = geometry.marginUnits;
    osmd.zoom = 1;
    osmd.render();
    const svgs = [...host.querySelectorAll('svg')].map((svg) => pageSvg(svg, geometry));
    if (svgs.length === 0) throw new Error('no pages');
    return { svgs, widthMm: geometry.widthMm, heightMm: geometry.heightMm };
  } finally {
    host.remove();
  }
}

/** Một trang SVG độc lập: kích thước thật theo mm, viewBox theo px OSMD đã vẽ, nền trắng. */
function pageSvg(svg: SVGSVGElement, geometry: PageGeometry): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const width = Number.parseFloat(svg.getAttribute('width') ?? '') || geometry.hostWidthPx;
  const height = width * (geometry.heightMm / geometry.widthMm);
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('viewBox', `0 0 ${width} ${round(height)}`);
  clone.setAttribute('width', `${geometry.widthMm}mm`);
  clone.setAttribute('height', `${geometry.heightMm}mm`);
  clone.removeAttribute('style');
  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('width', '100%');
  background.setAttribute('height', '100%');
  background.setAttribute('fill', 'white');
  clone.insertBefore(background, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

const round = (n: number): number => Math.round(n * 100) / 100;

// ------------------------------------------------------------------------------------------------ ảnh trang

/** Nạp một trang SVG thành ảnh (để vẽ lên canvas). */
function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('svg image'));
    image.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

/** Vẽ một trang SVG ra ảnh xám 8 bit `width`×`height` px (nền trắng). */
export async function rasterizeGray(svg: string, width: number, height: number): Promise<Uint8Array<ArrayBuffer>> {
  const image = await loadSvgImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114 + 500) / 1000;
  }
  return gray;
}
