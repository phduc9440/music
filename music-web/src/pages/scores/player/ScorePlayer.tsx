import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useParams } from 'react-router-dom';
import { Link } from '../../../routes/transition-nav';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import DownloadMenu from '../../../components/scores/viewer/DownloadMenu';
import Modal from '../../../components/scores/common/Modal';
import InstrumentMenu from '../../../components/scores/viewer/InstrumentMenu';
import ScoreCanvas from '../../../components/scores/viewer/ScoreCanvas';
import ZoomControl from '../../../components/scores/viewer/ZoomControl';
import { IconBack, IconInvert, IconPages, IconScroll } from '../../../components/scores/viewer/ViewerIcons';
import { editFailureMessage } from '../../../components/editor/core/commands';
import { syncTitle } from '../../../components/editor/structure/header';
import { ScoreDocument } from '../../../components/editor/core/ScoreDocument';
import { transposeDocument } from '../../../components/editor/notes/transpose';
import { PlayerBar } from '../../../components/player/PlayerBar';
import { usePlayer } from '../../../components/player/hooks/usePlayer';
import { countView } from '../../../services/practice/playbackApi';
import { fetchMusicXmlWithVersion, saveMusicXml, scoreApi } from '../../../services';
import type { ScoreDetail as ScoreDetailData } from '../../../types';
import { isValidScoreId } from '../../../utils/omr';
import { getConflictVersion, getHttpStatus, getSaveErrorMessage, useScoreBase } from '../../../utils/score';
import { clampZoom, inspectMusicXml, loadViewerPrefs, saveViewerPrefs } from '../../../utils/viewer';
import type { ViewMode } from '../../../utils/viewer';
import { t } from '../../../i18n/core';
import '../../../components/scores/scores.css';
import '../editor/ScoreViewer.css';
import './ScorePlayer.css';

type Phase = 'loading' | 'ready' | 'notFound' | 'notReady' | 'parseError' | 'error';

/** Trang /scores/:id/play: nghe bản nhạc, xem nốt chạy theo, bấm một ô nhịp để nhảy tới. Chỉ đọc, không sửa. */
export default function ScorePlayer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const base = useScoreBase();
  const [phaseRaw, setPhase] = useState<Phase>('loading');
  const phase: Phase = isValidScoreId(id) ? phaseRaw : 'notFound';
  const [score, setScore] = useState<ScoreDetailData | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [doc, setDoc] = useState<ScoreDocument | null>(null);
  /** Phiên bản MusicXML đang giữ (gửi qua If-Match khi lưu); tải lại sau mỗi lần lưu thành công. */
  const [version, setVersion] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    if (!isValidScoreId(id)) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await scoreApi.detail(id);
        if (cancelled) return;
        setScore(detail.data.result);
        let text: string;
        let fetchedVersion: number | null = null;
        try {
          const fetched = await fetchMusicXmlWithVersion(id);
          text = fetched.xml;
          fetchedVersion = fetched.version;
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
          setVersion(fetchedVersion ?? detail.data.result.currentVersion ?? 1);
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
  }, [id, reloadCount]);

  if (phase === 'ready' && score && xml && doc)
    return (
      <PlayerWorkspace
        key={score.id}
        score={score}
        xml={xml}
        doc={doc}
        version={version}
        onReload={() => setReloadCount((n) => n + 1)}
      />
    );

  let title = t('player.scorePlayer.loading');
  let text = '';
  let action: { label: string; to: string } | null = null;
  if (phase === 'notFound') {
    title = t('player.scorePlayer.notFound.title');
    text = t('player.scorePlayer.notFound.text');
    action = { label: t('player.scorePlayer.notFound.action'), to: base };
  } else if (phase === 'notReady') {
    title = t('player.scorePlayer.notReady.title');
    text = t('player.scorePlayer.notReady.text');
    action = { label: t('player.scorePlayer.notReady.action'), to: `${base}/${id}/processing` };
  } else if (phase === 'parseError') {
    title = t('player.scorePlayer.parseError.title');
    text = t('player.scorePlayer.parseError.text');
    action = { label: t('player.scorePlayer.toDetail'), to: `${base}/${id}` };
  } else if (phase === 'error') {
    title = t('player.scorePlayer.error.title');
    text = t('player.scorePlayer.error.text');
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
                {t('player.scorePlayer.reload')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerWorkspace({
  score,
  xml,
  doc,
  version,
  onReload,
}: {
  score: ScoreDetailData;
  xml: string;
  doc: ScoreDocument;
  version: number;
  onReload: () => void;
}) {
  const base = useScoreBase();
  const [prefs, setPrefs] = useState(loadViewerPrefs);
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState<{ latestVersion: number } | null>(null);
  const { zoom, mode, invert } = prefs;
  const player = usePlayer(doc, {
    scoreId: score.id,
    fallbackBpm: score.tempoBpm ?? 100,
    shortcuts: true,
    onFirstPlay: () => void countView(score.id),
  });

  const { a: loopA, b: loopB, enabled: loopOn } = player.loop;
  const loopRange = useMemo(
    () => (loopA !== null && loopB !== null ? { start: loopA, end: loopB, active: loopOn } : null),
    [loopA, loopB, loopOn],
  );

  /**
   * Ghi giọng đang nghe thành nội dung bản nhạc: chuyển giọng trên một bản sao rồi lưu thành phiên bản mới (If-Match).
   * Thành công thì đặt giọng nghe về 0 và tải lại bản nhạc; lệch phiên bản thì hiện hộp thoại xung đột.
   */
  const applyTranspose = async (semitones: number): Promise<boolean> => {
    let copy: ScoreDocument;
    try {
      copy = ScoreDocument.parse(xml);
    } catch {
      toast.error(t('player.scorePlayer.parseForTranspose'));
      return false;
    }
    const result = transposeDocument(copy, semitones);
    if (!result.ok) {
      toast.warn(editFailureMessage(result.reason));
      return false;
    }
    try {
      const saved = await saveMusicXml(score.id, copy.serialize(), version);
      toast.success(t('player.scorePlayer.transposeSaved', { version: saved.version }));
      player.setTranspose(0);
      onReload();
      return true;
    } catch (err) {
      const latest = getConflictVersion(err);
      if (latest !== undefined) setConflict({ latestVersion: latest });
      else toast.error(getSaveErrorMessage(err));
      return false;
    }
  };

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
          <h2>{t('player.scorePlayer.drawFailed')}</h2>
          <Link className="sc-btn sc-btn--primary" to={`${base}/${score.id}`}>
            {t('player.scorePlayer.toDetail')}
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
            to={`${base}/${score.id}`}
            aria-label={t('player.scorePlayer.toDetail')}
            title={t('player.scorePlayer.toDetail')}
          >
            <IconBack />
          </Link>
          <div className="sv-title">
            <h1 title={score.title}>{score.title}</h1>
            <p>{score.composer || t('player.scorePlayer.unknownComposer')}</p>
          </div>
        </div>
        <div className="sv-toolbar__center">
          <div className="sv-segment" role="group" aria-label={t('player.scorePlayer.viewMode')}>
            <button aria-pressed={mode === 'page'} onClick={() => setMode('page')}>
              <IconPages /> {t('player.scorePlayer.pages')}
            </button>
            <button aria-pressed={mode === 'scroll'} onClick={() => setMode('scroll')}>
              <IconScroll /> {t('player.scorePlayer.scroll')}
            </button>
          </div>
          <ZoomControl zoom={zoom} onChange={(z) => update({ zoom: clampZoom(z) })} />
          <div className="sv-segment sv-segment--icons" role="group" aria-label={t('player.scorePlayer.colors')}>
            <button
              aria-pressed={invert}
              aria-label={t('player.scorePlayer.invert')}
              title={t('player.scorePlayer.invertTitle')}
              onClick={() => update({ invert: !invert })}
            >
              <IconInvert />
            </button>
          </div>
        </div>
        <div className="sv-toolbar__right">
          <InstrumentMenu parts={player.parts} onChange={player.setInstrument} />
          <DownloadMenu
            scoreId={score.id}
            files={score.files}
            title={score.title}
            staffCount={score.staffCount}
            canDownload={score.canDownload}
            audioShortcut
          />
          {score.canEdit && (
            <Link className="sc-btn" to={`${base}/${score.id}/edit`}>
              {t('player.scorePlayer.openEditor')}
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
            inverted={invert}
            onZoomChange={(z) => update({ zoom: clampZoom(z) })}
            onRendered={() => undefined}
            onProgress={() => undefined}
            onError={() => setFailed(true)}
            playing={player.activeIds}
            mutedStaves={player.mutedStaves}
            loopRange={loopRange}
            transpose={player.transpose}
            onMeasureRange={(a, b) => player.setLoop({ a, b })}
            followMeasure={player.status === 'playing' ? player.followMeasure : null}
            onMeasureClick={(m, additive) => (additive ? player.pickLoopMeasure(m) : player.seekToMeasure(m))}
          />
        </div>
      </div>
      <PlayerBar
        player={player}
        canDragLoop
        transposeRedraws
        onApplyTranspose={score.canEdit ? applyTranspose : undefined}
        applyTransposeHint={t('player.scorePlayer.applyHint')}
      />
      {conflict && (
        <Modal title={t('player.scorePlayer.conflict.title')} onClose={() => setConflict(null)}>
          <p className="sv-modal-text">
            {conflict.latestVersion > 0
              ? t('player.scorePlayer.conflict.known', { latest: conflict.latestVersion, version })
              : t('player.scorePlayer.conflict.unknown')}
          </p>
          <div className="sc-modal__actions">
            <button
              className="sc-btn sc-btn--primary"
              onClick={() => {
                setConflict(null);
                onReload();
              }}
            >
              {t('player.scorePlayer.conflict.load')}
            </button>
            <button className="sc-btn" onClick={() => setConflict(null)}>
              {t('common.close')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
