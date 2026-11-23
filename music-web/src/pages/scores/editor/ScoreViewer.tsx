import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigate } from '../../../routes/useTransitionNavigate';
import DownloadMenu from '../../../components/scores/viewer/DownloadMenu';
import { syncTitle } from '../../../components/editor/structure/header';
import { ScoreDocument } from '../../../components/editor/core/ScoreDocument';
import { fetchMusicXmlWithVersion, scoreApi } from '../../../services';
import type { ScoreDetail as ScoreDetailData } from '../../../types';
import { t } from '../../../i18n/core';
import { isValidScoreId } from '../../../utils/omr';
import { getHttpStatus, useScoreBase } from '../../../utils/score';
import { inspectMusicXml } from '../../../utils/viewer';
import type { MusicXmlInfo } from '../../../utils/viewer';
import ScoreWorkspace from './workspace/ScoreWorkspace';
import '../../../components/scores/scores.css';
import './ScoreViewer.css';

type Phase = 'loading' | 'ready' | 'notFound' | 'notReady' | 'parseError' | 'error';

/**
 * Trang /scores/:id/edit: tải thông tin bản nhạc và MusicXML hiện hành, hiện các màn hình trạng thái
 * (đang tải, không thấy, chưa số hóa xong, lỗi) hoặc trình chỉnh sửa {@link ScoreWorkspace}.
 */
export default function ScoreViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const base = useScoreBase();

  const [phaseRaw, setPhase] = useState<Phase>('loading');
  const phase: Phase = isValidScoreId(id) ? phaseRaw : 'notFound';
  const [score, setScore] = useState<ScoreDetailData | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [xmlVersion, setXmlVersion] = useState<number | null>(null);
  const [info, setInfo] = useState<MusicXmlInfo | null>(null);
  const [doc, setDoc] = useState<ScoreDocument | null>(null);

  // Tải thông tin bản nhạc rồi MusicXML hiện hành
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
          const fetched = await fetchMusicXmlWithVersion(id);
          text = fetched.xml;
          setXmlVersion(fetched.version);
        } catch (err) {
          if (cancelled) return;
          // 409 = MUSICXML_NOT_READY (2012): chưa số hóa xong
          setPhase(getHttpStatus(err) === 409 ? 'notReady' : 'error');
          return;
        }
        if (cancelled) return;
        const parsed = inspectMusicXml(text);
        setInfo(parsed);
        setXml(text);
        if (!parsed.valid) {
          setPhase('parseError');
          return;
        }
        try {
          const opened = ScoreDocument.parse(text);
          // Tiêu đề trên bản nhạc theo tên bài hát trong ứng dụng (trừ khi đã tự sửa tiêu đề trong trình sửa)
          if (syncTitle(opened, detail.data.result.title)) setXml(opened.serialize());
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

  const goBack = () => navigate(id ? `${base}/${id}` : base);

  if (phase === 'ready' && score && xml && info && doc) {
    return <ScoreWorkspace key={score.id} score={score} xml={xml} info={info} doc={doc} xmlVersion={xmlVersion} />;
  }

  // ---- Các màn hình không xem được ----
  let title = t('editor.view.state.loading');
  let text = '';
  let action: { label: string; run: () => void } | null = null;
  if (phase === 'notFound') {
    title = t('editor.view.state.notFound.title');
    text = t('editor.view.state.notFound.text');
    action = { label: t('editor.view.state.notFound.action'), run: () => navigate(base) };
  } else if (phase === 'notReady') {
    title = t('editor.view.state.notReady.title');
    text = t('editor.view.state.notReady.text');
    action = { label: t('editor.view.state.notReady.action'), run: () => navigate(`${base}/${id}/processing`) };
  } else if (phase === 'parseError' || (phase === 'ready' && !doc)) {
    title = t('editor.view.state.parseError.title');
    text = t('editor.view.state.parseError.text');
    action = { label: t('editor.view.state.parseError.action'), run: goBack };
  } else if (phase === 'error') {
    title = t('editor.view.state.error.title');
    text = t('editor.view.state.error.text');
    action = { label: t('editor.view.state.error.action'), run: () => window.location.reload() };
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
            {action && (
              <button className="sc-btn sc-btn--primary" onClick={action.run}>
                {action.label}
              </button>
            )}
            {phase === 'parseError' && score && (
              <DownloadMenu
                scoreId={score.id}
                files={score.files}
                title={score.title}
                staffCount={score.staffCount}
                canDownload={score.canDownload}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
