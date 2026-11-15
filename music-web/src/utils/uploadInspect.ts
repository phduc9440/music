import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { UPLOAD_MAX_IMAGE_PIXELS, UPLOAD_MAX_PDF_PAGES, UPLOAD_MIN_IMAGE_SIDE, getExtension, isPdf } from './score';
import { t } from '../i18n/core';

/**
 * Kiểm tra nội dung file ngay ở trình duyệt trước khi upload (doc mục 2.1), khớp với kiểm tra của server:
 *  - PDF: mở được, không mã hóa/mật khẩu, 1–20 trang (mã 2008, 2009). Đọc bằng pdf.js, kèm ảnh trang 1.
 *  - Ảnh: đọc được, cạnh ngắn >= 600px, tối đa 40 megapixel (mã 2010).
 */
export interface FileInspection {
  /** Ảnh xem trước (data URL): ảnh gốc hoặc trang 1 của PDF. */
  preview?: string;
  /** Số trang của PDF. */
  pageCount?: number;
  width?: number;
  height?: number;
  /** Lỗi nội dung; chuỗi rỗng nghĩa là hợp lệ. */
  error: string;
}

const PDF_THUMB_WIDTH = 240;

// pdf.js khá nặng nên chỉ tải khi người dùng chọn PDF
export const loadPdfJs = async () => {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return pdfjs;
};

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_UNREADABLE'));
    img.src = src;
  });

export const inspectPdf = async (file: File): Promise<FileInspection> => {
  const pdfjs = await loadPdfJs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (err) {
    const name = (err as { name?: string }).name;
    return {
      error: name === 'PasswordException' ? t('upload.inspect.pdfPassword') : t('upload.inspect.pdfUnreadable'),
    };
  }

  try {
    // PDF chỉ khóa quyền (owner password) vẫn mở được nhưng server từ chối, nên chặn luôn ở đây
    const { info } = await doc.getMetadata();
    if ((info as { EncryptFilterName?: string } | undefined)?.EncryptFilterName) {
      return { pageCount: doc.numPages, error: t('upload.inspect.pdfEncrypted') };
    }
    if (doc.numPages < 1 || doc.numPages > UPLOAD_MAX_PDF_PAGES) {
      return {
        pageCount: doc.numPages,
        error: t('upload.inspect.pdfPages', { pages: doc.numPages, max: UPLOAD_MAX_PDF_PAGES }),
      };
    }

    // Vẽ trang 1 ra canvas nhỏ làm ảnh xem trước; lỗi vẽ thì vẫn cho tải lên
    let preview: string | undefined;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PDF_THUMB_WIDTH / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        preview = canvas.toDataURL('image/png');
      }
    } catch {
      preview = undefined;
    }
    return { pageCount: doc.numPages, preview, error: '' };
  } finally {
    void doc.destroy();
  }
};

export const inspectImage = async (file: File): Promise<FileInspection> => {
  let preview: string;
  let img: HTMLImageElement;
  try {
    preview = await readAsDataUrl(file);
    img = await loadImage(preview);
  } catch {
    return { error: t('upload.inspect.imageUnreadable') };
  }
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const base = { preview, width, height };
  if (Math.min(width, height) < UPLOAD_MIN_IMAGE_SIDE) {
    return {
      ...base,
      error: t('upload.inspect.imageSmall', { side: Math.min(width, height), min: UPLOAD_MIN_IMAGE_SIDE }),
    };
  }
  if (width * height > UPLOAD_MAX_IMAGE_PIXELS) {
    const mp = ((width * height) / 1_000_000).toFixed(1);
    return { ...base, error: t('upload.inspect.imageLarge', { mp, max: UPLOAD_MAX_IMAGE_PIXELS / 1_000_000 }) };
  }
  return { ...base, error: '' };
};

export const inspectFile = (file: File): Promise<FileInspection> =>
  isPdf(file) ? inspectPdf(file) : inspectImage(file);

/**
 * Xoay ảnh theo chiều kim đồng hồ (90/180/270 độ) bằng canvas, trả về File mới cùng tên và định dạng.
 * Chỉ gọi lúc bấm "Bắt đầu số hóa" để mỗi ảnh chỉ nén lại một lần.
 */
export const rotateImageFile = async (file: File, degrees: number): Promise<File> => {
  const turns = (((degrees / 90) % 4) + 4) % 4;
  if (turns === 0) return file;

  const img = await loadImage(await readAsDataUrl(file));
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = turns % 2 === 1 ? h : w;
  canvas.height = turns % 2 === 1 ? w : h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(img, -w / 2, -h / 2);

  // Định dạng theo đuôi file vì server bắt đuôi và nội dung (magic bytes) phải khớp nhau
  const type = getExtension(file.name) === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.95));
  if (!blob) throw new Error('CANVAS_EXPORT_FAILED');
  return new File([blob], file.name, { type, lastModified: Date.now() });
};
