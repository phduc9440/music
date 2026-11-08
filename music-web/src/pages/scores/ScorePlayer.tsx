import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DownloadMenu from '../../components/scores/DownloadMenu';
import InstrumentMenu from '../../components/scores/InstrumentMenu';
import ScoreCanvas from '../../components/scores/ScoreCanvas';
import ZoomControl from '../../components/scores/ZoomControl';
import { IconBack, IconPages, IconScroll } from '../../components/scores/ViewerIcons';
import { syncTitle } from '../../components/editor/header';
import { ScoreDocument } from '../../components/editor/ScoreDocument';
import { PlayerBar } from '../../components/player/PlayerBar';
import { usePlayer } from '../../components/player/usePlayer';
import { countView } from '../../services/playbackApi';
import { fetchMusicXmlWithVersion, scoreApi } from '../../services';
import type { ScoreDetail as ScoreDetailData } from '../../types';
import { isValidScoreId } from '../../utils/omr';
import { getHttpStatus } from '../../utils/score';
import { clampZoom, inspectMusicXml, loadViewerPrefs, saveViewerPrefs } from '../../utils/viewer';
import type { ViewMode } from '../../utils/viewer';
import '../../components/scores/scores.css';
import './ScoreViewer.css';
import './ScorePlayer.css';

type Phase = 'loading' | 'ready' | 'notFound' | 'notReady' | 'parseError' | 'error';

/** Trang /scores/:id/play: nghe bản nhạc, xem nốt chạy theo, bấm một ô nhịp để nhảy tới. Chỉ đọc, không sửa. */
export default function ScorePlayer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [phaseRaw, setPhase] = useState<Phase>('loading');
  const phase: Phase = isValidScoreId(id) ? phaseRaw : 'notFound';
  const [score, setScore] = useState<ScoreDetailData | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [doc, setDoc] = useState<ScoreDocument | null>(null);

  useEffect(() => {
    if (!isValidScoreId(id)) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await scoreApi.detail(id);
        if (cancelled) return;
        setScore(detail.data.result);
        let text: string;
        try {
          text = (await fetchMusicXmlWithVersion(id)).xml;
        } catch (err) {
          if (!cancelled) setPhase(getHttpStatus(err) === 409 ? 'notReady' : 'error');
          return;
        }
        if (cancelled) return;
        if (!inspectMusicXml(text).valid) return setPhase('parseError');
        try {
          const opened = ScoreDocument.parse(text);
          const shown = syncTitle(opened, detail.data.result.title) ? opened.serialize() : text;
          setXml(shown);
          setDoc(opened);
          setPhase('ready');
        } catch {
          setPhase('parseError');
        }
      } catch (err) {
        if (cancelled) return;
        const status = getHttpStatus(err);
        setPhase(status === 404 || status === 403 ? 'notFound' : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (phase === 'ready' && score && xml && doc)
    return <PlayerWorkspace key={score.id} score={score} xml={xml} doc={doc} />;

  let title = 'Đang tải bản nhạc...';
  let text = '';
  let action: { label: string; to: string } | null = null;
  if (phase === 'notFound') {
    title = 'Không tìm thấy bản nhạc';
    text = 'Bản nhạc không tồn tại hoặc bạn không có quyền xem.';
    action = { label: 'Về thư viện', to: '/scores' };
  } else if (phase === 'notReady') {
    title = 'Bản nhạc chưa số hóa xong';
    text = 'Bản nhạc chưa có MusicXML để phát. Hãy đợi nhận diện xong hoặc xem trang tiến độ.';
    action = { label: 'Về trang tiến độ', to: `/scores/${id}/processing` };
  } else if (phase === 'parseError') {
    title = 'Không đọc được bản nhạc';
    text = 'File MusicXML bị lỗi nên không phát được.';
    action = { label: 'Về trang chi tiết', to: `/scores/${id}` };
  } else if (phase === 'error') {
    title = 'Không tải được bản nhạc';
    text = 'Vui lòng thử lại sau.';
  }
  return (
    <div className="sc-page sv-root sv-root--center">
      {phase === 'loading' ? (
        <div className="sv-state" aria-busy="true">
          <span className="sv-spinner" aria-hidden="true" />
          <p>{title}</p>
        </div>
      ) : (
        <div className="sv-state" role="alert">
          <h2>{title}</h2>
          <p>{text}</p>
          <div className="sv-state__actions">
            {action ? (
              <button className="sc-btn sc-btn--primary" onClick={() => navigate(action.to)}>
                {action.label}
              </button>
            ) : (
              <button className="sc-btn sc-btn--primary" onClick={() => window.location.reload()}>
                Tải lại
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerWorkspace({ score, xml, doc }: { score: ScoreDetailData; xml: string; doc: ScoreDocument }) {
  const [prefs, setPrefs] = useState(loadViewerPrefs);
  const [failed, setFailed] = useState(false);
  const { zoom, mode } = prefs;
  const player = usePlayer(doc, {
    fallbackBpm: score.tempoBpm ?? 100,
    shortcuts: true,
    onFirstPlay: () => void countView(score.id),
  });

  const update = (patch: Partial<typeof prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveViewerPrefs(next);
      return next;
    });
  const setMode = (value: ViewMode) => update({ mode: value });

  if (failed) {
    return (
      <div className="sc-page sv-root sv-root--center">
        <div className="sv-state" role="alert">
          <h2>Không vẽ được bản nhạc</h2>
          <Link className="sc-btn sc-btn--primary" to={`/scores/${score.id}`}>
            Về trang chi tiết
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="sc-page sv-root spl-root">
      <header className="sv-toolbar">
        <div className="sv-toolbar__left">
          <Link
            className="sc-btn sv-icon"
            to={`/scores/${score.id}`}
            aria-label="Về trang chi tiết"
            title="Về trang chi tiết"
          >
            <IconBack />
          </Link>
          <div className="sv-title">
            <h1 title={score.title}>{score.title}</h1>
            <p>{score.composer || 'Chưa rõ tác giả'}</p>
          </div>
        </div>
        <div className="sv-toolbar__center">
          <div className="sv-segment" role="group" aria-label="Chế độ xem">
            <button aria-pressed={mode === 'page'} onClick={() => setMode('page')}>
              <IconPages /> Trang
            </button>
            <button aria-pressed={mode === 'scroll'} onClick={() => setMode('scroll')}>
              <IconScroll /> Cuộn ngang
            </button>
          </div>
          <ZoomControl zoom={zoom} onChange={(z) => update({ zoom: clampZoom(z) })} />
        </div>
        <div className="sv-toolbar__right">
          <InstrumentMenu parts={player.parts} onChange={player.setInstrument} />
          <DownloadMenu scoreId={score.id} files={score.files} />
          {score.canEdit && (
            <Link className="sc-btn" to={`/scores/${score.id}/edit`}>
              Mở trình chỉnh sửa
            </Link>
          )}
        </div>
      </header>
      <div className="sv-body">
        <div className="sv-stage">
          <ScoreCanvas
            xml={xml}
            doc={doc}
            zoom={zoom}
            mode={mode}
            onZoomChange={(z) => update({ zoom: clampZoom(z) })}
            onRendered={() => undefined}
            onProgress={() => undefined}
            onError={() => setFailed(true)}
            playing={player.activeIds}
            followMeasure={player.status === 'playing' ? player.followMeasure : null}
            onMeasureClick={(m) => player.seekToMeasure(m)}
          />
        </div>
      </div>
      <PlayerBar player={player} />
    </div>
  );
}
