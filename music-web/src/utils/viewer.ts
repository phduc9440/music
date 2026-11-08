/** Giới hạn và cấu hình của trình xem bản nhạc (/scores/:id/edit, chế độ chỉ xem). */

/** Mức thu phóng nhỏ nhất / lớn nhất / mỗi bước (%), theo đặc tả 1.17: 50–200%. */
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 10;
export const ZOOM_DEFAULT = 100;

/** Quá ngưỡng này thì cảnh báo hiệu năng và gợi ý chế độ cuộn ngang (đặc tả 1.17). */
export const MAX_XML_BYTES = 5 * 1024 * 1024;
export const MAX_MEASURES = 500;

/** Điểm gãy responsive (px): dưới 768 là Mobile, 768–1279 là iPad, từ 1280 là Desktop. */
export const MOBILE_MAX = 767;
export const TABLET_MAX = 1279;

/** Chế độ xem: "page" vẽ theo từng trang giấy A4, "scroll" vẽ một hàng khuông dài cuộn ngang. */
export type ViewMode = 'page' | 'scroll';

export interface ViewerPrefs {
  zoom: number;
  mode: ViewMode;
}

const PREFS_KEY = 'score-viewer-prefs';

/** Kẹp mức thu phóng vào [ZOOM_MIN, ZOOM_MAX] và làm tròn về bội của 5. */
export const clampZoom = (value: number): number => {
  if (!Number.isFinite(value)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value / 5) * 5));
};

/** Đọc lựa chọn thu phóng và chế độ xem đã lưu; lỗi hoặc dữ liệu lạ thì trả mặc định. */
export const loadViewerPrefs = (): ViewerPrefs => {
  const fallback: ViewerPrefs = { zoom: ZOOM_DEFAULT, mode: 'page' };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<ViewerPrefs>;
    return {
      zoom: typeof data.zoom === 'number' ? clampZoom(data.zoom) : fallback.zoom,
      mode: data.mode === 'scroll' ? 'scroll' : 'page',
    };
  } catch {
    return fallback;
  }
};

/** Lưu lựa chọn của người dùng; bỏ qua nếu trình duyệt chặn localStorage. */
export const saveViewerPrefs = (prefs: ViewerPrefs): void => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // không lưu được thì thôi, lần sau dùng giá trị mặc định
  }
};

/** Thông tin đọc nhanh từ MusicXML để quyết định cảnh báo, không thay cho số liệu của BE. */
export interface MusicXmlInfo {
  /** false nếu XML không phân tích được hoặc không phải score-partwise. */
  valid: boolean;
  bytes: number;
  measureCount: number;
  /** Số khuông của phần nhạc đầu tiên (giá trị <staves>, mặc định 1). */
  staves: number;
}

/** Đọc số ô nhịp và số khuông từ MusicXML bằng DOMParser. */
export const inspectMusicXml = (xml: string): MusicXmlInfo => {
  const bytes = new Blob([xml]).size;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0 || doc.documentElement.nodeName !== 'score-partwise') {
    return { valid: false, bytes, measureCount: 0, staves: 0 };
  }
  const part = doc.getElementsByTagName('part')[0];
  const measureCount = part ? part.getElementsByTagName('measure').length : 0;
  const staves = Number(doc.getElementsByTagName('staves')[0]?.textContent) || 1;
  return { valid: measureCount > 0, bytes, measureCount, staves };
};

/** Cảnh báo hiệu năng nếu MusicXML quá lớn; chuỗi rỗng nếu ổn. */
export const performanceWarning = (info: MusicXmlInfo): string => {
  if (info.bytes > MAX_XML_BYTES || info.measureCount > MAX_MEASURES) {
    return 'Bản nhạc khá lớn nên có thể vẽ chậm. Hãy thử chế độ "Cuộn ngang" hoặc thu nhỏ để xem nhanh hơn.';
  }
  return '';
};
