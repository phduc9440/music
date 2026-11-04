import { loadPdfJs } from './uploadInspect';

/**
 * Vẽ một trang của file PDF (dạng blob) ra ảnh PNG và trả về object URL.
 * Người gọi có trách nhiệm gọi URL.revokeObjectURL khi không dùng nữa.
 *
 * @param pdf nội dung file PDF
 * @param pageNumber số trang, bắt đầu từ 1 (vượt số trang thì lấy trang cuối)
 * @param targetWidth bề rộng ảnh đầu ra theo pixel
 */
export const renderPdfPageToUrl = async (pdf: Blob, pageNumber: number, targetWidth = 1050): Promise<string> => {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) }).promise;
  try {
    const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: targetWidth / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('CANVAS_EXPORT_FAILED');
    return URL.createObjectURL(blob);
  } finally {
    void doc.destroy();
  }
};
