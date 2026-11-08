import { useEffect, useRef, useState } from 'react';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

interface Props {
  /** Nội dung MusicXML cần vẽ. */
  xml: string;
  /** Ô nhịp đầu cần vẽ (bắt đầu từ 1); bỏ trống thì vẽ từ đầu bản nhạc. */
  firstMeasure?: number | null;
  /** Ô nhịp cuối cần vẽ; bỏ trống thì vẽ đến hết bản nhạc. */
  lastMeasure?: number | null;
}

type ViewState = 'loading' | 'ready' | 'error';

/** Thời gian chờ sau lần đổi kích thước cuối cùng trước khi vẽ lại (ms). */
const RESIZE_DEBOUNCE_MS = 250;

/**
 * Vẽ bản nhạc từ MusicXML bằng OpenSheetMusicDisplay (SVG).
 * Thư viện được nạp theo yêu cầu (lazy) để không làm nặng các trang khác; tự vẽ lại khi đổi độ rộng khung.
 */
export default function MusicXmlViewer({ xml, firstMeasure, lastMeasure }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
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
        if (firstMeasure != null) instance.setOptions({ drawFromMeasureNumber: firstMeasure });
        if (lastMeasure != null) instance.setOptions({ drawUpToMeasureNumber: lastMeasure });
        await instance.load(xml);
        if (cancelled) return;
        instance.zoom = 0.8;
        instance.render();
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

  return (
    <div className="sr-score">
      {state === 'loading' && <p className="sr-empty">Đang vẽ bản nhạc...</p>}
      {state === 'error' && <div className="sc-error">Không vẽ được bản nhạc từ MusicXML</div>}
      <div ref={hostRef} className="sr-score__host" hidden={state !== 'ready'} />
    </div>
  );
}
