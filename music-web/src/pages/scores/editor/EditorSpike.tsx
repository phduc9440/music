import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ScoreDocument } from '../../../components/editor/core/ScoreDocument';
import { applySelection, bindNoteIds, noteIdsFromEvent } from '../../../components/editor/core/osmdBridge';
import type { BindReport } from '../../../components/editor/core/osmdBridge';
import { fetchMusicXml } from '../../../services';
import '../../../components/editor/editor.css';

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
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
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
      <h1 style={{ fontSize: '1.1rem' }}>OSMD ↔ MusicXML note id matching test</h1>
      {error && <p role="alert">{error}</p>}
      {report && (
        <p>
          Bound {report.bound}/{report.domNotes} notes; {report.problems.length} groups do not match.
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
          <summary>Details of the groups that do not match</summary>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{report.problems.slice(0, 50).join('\n')}</pre>
        </details>
      )}
      <div ref={hostRef} onClick={onClick} style={{ background: 'var(--ui-paper)' }} />
    </div>
  );
}
