import { useEffect, useRef, useState } from 'react';
import type { OpenSheetMusicDisplay, VexFlowGraphicalNote } from 'opensheetmusicdisplay';
import { t } from '../../../i18n/core';

interface Props {
  /** Nội dung MusicXML cần vẽ. */
  xml: string;
  /** Ô nhịp đầu cần vẽ (bắt đầu từ 1); bỏ trống thì vẽ từ đầu bản nhạc. */
  firstMeasure?: number | null;
  /** Ô nhịp cuối cần vẽ; bỏ trống thì vẽ đến hết bản nhạc. */
  lastMeasure?: number | null;
  /** Vị trí đang chơi: ô nhịp (từ 1) và độ lệch tính theo phách (nốt đen) từ đầu ô nhịp; null thì ẩn con trỏ. */
  playhead?: { measure: number; beatOffset: number } | null;
}

type ViewState = 'loading' | 'ready' | 'error';

/** Màu nốt đang chơi. */
const LIT_COLOR = '#e8590c';

/** Thời gian chờ sau lần đổi kích thước cuối cùng trước khi vẽ lại (ms). */
const RESIZE_DEBOUNCE_MS = 250;

/**
 * Vẽ bản nhạc từ MusicXML bằng OpenSheetMusicDisplay (SVG).
 * Thư viện được nạp theo yêu cầu (lazy) để không làm nặng các trang khác; tự vẽ lại khi đổi độ rộng khung.
 */
export default function MusicXmlViewer({ xml, firstMeasure, lastMeasure, playhead }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const litRef = useRef<SVGElement[]>([]);
  const [state, setState] = useState<ViewState>('loading');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let osmd: OpenSheetMusicDisplay | null = null;
    let observer: ResizeObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const { OpenSheetMusicDisplay: Osmd } = await import('opensheetmusicdisplay');
        if (cancelled) return;
        const instance = new Osmd(host, {
          autoResize: false, // tự xử lý bằng ResizeObserver để dọn được khi gỡ component
          backend: 'svg',
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawLyricist: false,
          drawPartNames: false,
        });
        osmd = instance;
        osmdRef.current = instance;
        if (firstMeasure != null) instance.setOptions({ drawFromMeasureNumber: firstMeasure });
        if (lastMeasure != null) instance.setOptions({ drawUpToMeasureNumber: lastMeasure });
        await instance.load(xml);
        if (cancelled) return;
        instance.zoom = 0.8;
        instance.render();
        const cursorOptions = instance.cursorsOptions?.[0];
        if (cursorOptions) {
          cursorOptions.color = '#ff7a00';
          cursorOptions.alpha = 0; // không vẽ thanh con trỏ: chỉ tô sáng chính các nốt đang chơi
        }
        setState('ready');

        let lastWidth = host.clientWidth;
        observer = new ResizeObserver(() => {
          if (host.clientWidth === lastWidth) return; // chỉ vẽ lại khi độ rộng đổi
          lastWidth = host.clientWidth;
          clearTimeout(timer);
          timer = setTimeout(() => !cancelled && instance.render(), RESIZE_DEBOUNCE_MS);
        });
        observer.observe(host);
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
      osmdRef.current = null;
      clearTimeout(timer);
      observer?.disconnect();
      try {
        osmd?.clear();
      } catch {
        // bỏ qua: khung vẽ đang được gỡ
      }
      host.replaceChildren();
    };
  }, [xml, firstMeasure, lastMeasure]);

  const playMeasure = playhead?.measure ?? null;
  const playOffset = playhead?.beatOffset ?? 0;

  const clearLit = () => {
    for (const el of litRef.current) {
      el.style.fill = '';
      el.style.stroke = '';
    }
    litRef.current = [];
  };

  // nốt sáng chạy theo nốt đang chơi: đưa con trỏ OSMD tới mục có mốc thời gian đầu tiên >= mốc đích
  useEffect(() => {
    const osmd = osmdRef.current;
    if (state !== 'ready' || !osmd) return;
    try {
      const cursor = osmd.cursor;
      if (playMeasure == null) {
        clearLit();
        cursor.hide();
        return;
      }
      const sourceMeasure = osmd.Sheet.SourceMeasures[playMeasure - 1];
      if (!sourceMeasure) return;
      const target = sourceMeasure.AbsoluteTimestamp.RealValue + playOffset / 4;
      const eps = 1e-6;
      cursor.show();
      if (cursor.Iterator.currentTimeStamp.RealValue > target + eps) cursor.reset();
      let guard = 0;
      while (!cursor.Iterator.EndReached && cursor.Iterator.currentTimeStamp.RealValue < target - eps && guard++ < 20000) {
        cursor.next();
      }
      cursor.update();
      clearLit();
      for (const note of cursor.GNotesUnderCursor()) {
        // Backend mặc định của OSMD là VexFlow nên nốt thực chất là VexFlowGraphicalNote (có getSVGGElement)
        const group = (note as VexFlowGraphicalNote).getSVGGElement?.();
        if (!group) continue;
        for (const el of group.querySelectorAll<SVGElement>('path, rect, ellipse')) {
          el.style.fill = LIT_COLOR;
          el.style.stroke = LIT_COLOR;
          litRef.current.push(el);
        }
      }
    } catch {
      // bỏ qua: con trỏ chỉ là phần trang trí, không được làm hỏng bản nhạc
    }
  }, [state, playMeasure, playOffset]);

  return (
    <div className="sr-score">
      {state === 'loading' && <p className="sr-empty">{t('viewer.canvas.drawing')}</p>}
      {state === 'error' && <div className="sc-error">{t('viewer.canvas.drawFailed')}</div>}
      {/* Không dùng hidden: khung bị ẩn có độ rộng 0 nên OSMD sẽ xếp mỗi dòng một ô khi vẽ lần đầu */}
      <div
        ref={hostRef}
        className="sr-score__host"
        style={state === 'ready' ? undefined : { height: 0, overflow: 'hidden' }}
      />
    </div>
  );
}
