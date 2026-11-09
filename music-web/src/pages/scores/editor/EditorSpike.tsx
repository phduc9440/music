import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ScoreDocument } from '../../components/editor/ScoreDocument';
import { applySelection, bindNoteIds, noteIdsFromEvent } from '../../components/editor/osmdBridge';
import type { BindReport } from '../../components/editor/osmdBridge';
import { fetchMusicXml } from '../../services';
import '../../components/editor/editor.css';

/**
 * Trang thử (chỉ có khi chạy `npm run dev`): kiểm tra id nốt phía OSMD khớp id phía DOM MusicXML.
 * Mở /dev/editor-spike/{scoreId}, bấm vào nốt (kể cả hợp âm) để xem id và cao độ đọc từ DOM.
 */
export default function EditorSpike() {
  const { id } = useParams<{ id: string }>();
  const hostRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<ScoreDocument | null>(null);
  const [report, setReport] = useState<BindReport | null>(null);
  const [clicked, setClicked] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const xml = await fetchMusicXml(id);
        const doc = ScoreDocument.parse(xml);
        docRef.current = doc;
        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
        const osmd = new OpenSheetMusicDisplay(host, { autoResize: false, backend: 'svg', drawPartNames: false });
        await osmd.load(doc.serialize());
        osmd.render();
        if (cancelled) return;
        setReport(bindNoteIds(osmd, doc, host));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Lỗi không xác định');
      }
    })();
    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [id]);

  const describe = (noteId: string): string => {
    const info = docRef.current?.getInfo(noteId);
    if (!info) return noteId;
    const pitch = info.element.getElementsByTagName('step')[0]?.textContent ?? 'rest';
    const octave = info.element.getElementsByTagName('octave')[0]?.textContent ?? '';
    return `${noteId} → ${pitch}${octave} (MIDI ${info.midi ?? '-'})`;
  };

  const onClick = (event: React.MouseEvent) => {
    const ids = noteIdsFromEvent(event.nativeEvent);
    setClicked(ids.map(describe));
    if (hostRef.current) applySelection(hostRef.current, new Set(ids));
  };

  return (
    <div className="sc-page" style={{ padding: '1rem' }}>
      <h1 style={{ fontSize: '1.1rem' }}>Thử ghép id nốt OSMD ↔ MusicXML</h1>
      {error && <p role="alert">{error}</p>}
      {report && (
        <p>
          Gắn được {report.bound}/{report.domNotes} nốt; {report.problems.length} nhóm không khớp.
        </p>
      )}
      {clicked.length > 0 && (
        <ul>
          {clicked.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      {report && report.problems.length > 0 && (
        <details>
          <summary>Chi tiết nhóm không khớp</summary>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{report.problems.slice(0, 50).join('\n')}</pre>
        </details>
      )}
      <div ref={hostRef} onClick={onClick} style={{ background: '#fff' }} />
    </div>
  );
}
