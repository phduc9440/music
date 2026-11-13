import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import ScoreCanvas from '../../../components/scores/viewer/ScoreCanvas';
import SetList from '../../../components/player/perform/SetList';
import type { ItemLoadState } from '../../../components/player/perform/SetList';
import { usePageTurner } from '../../../components/player/perform/usePageTurner';
import { fetchMusicXml, showApi } from '../../../services';
import type { ShowDetail, ShowItem } from '../../../types';
import { t } from '../../../i18n/core';
import { useTheme } from '../../../theme/useTheme';
import {
  PERFORM_INTERLUDE_MS,
  PERFORM_LOAD_CONCURRENCY,
  PERFORM_TRANSPOSE_MAX,
  PERFORM_TRANSPOSE_MIN,
  clampTranspose,
  loadPerformSettings,
  requestWakeLock,
  savePerformSettings,
} from '../../../utils/perform';
import type { PerformSettings } from '../../../utils/perform';
import { getErrorMessage } from '../../../utils/score';
import { ZOOM_STEP, clampZoom } from '../../../utils/viewer';
import '../../../components/scores/scores.css';
import '../editor/ScoreViewer.css';
import './ShowPerform.css';

type Panel = 'list' | 'settings' | null;

/** Trang /teams/:teamId/shows/:showId/perform: các bài của buổi diễn theo thứ tự, lật trang bằng bàn đạp hoặc chạm. */
export default function ShowPerform() {
  const { teamId = '', showId = '' } = useParams();
  const navigate = useNavigate();
  const { resolved } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pendingLastPage = useRef(false);

  const [detail, setDetail] = useState<ShowDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [xmls, setXmls] = useState<Record<string, string>>({});
  const [states, setStates] = useState<Record<string, ItemLoadState>>({});
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [upNext, setUpNext] = useState<number | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [settingsMap, setSettingsMap] = useState<Record<string, PerformSettings>>({});
  const [invert, setInvert] = useState(resolved === 'dark');

  const showPath = `/teams/${teamId}/shows/${showId}`;
  const items = useMemo<ShowItem[]>(
    () => (detail ? [...detail.items].sort((a, b) => a.position - b.position) : []),
    [detail],
  );

  useEffect(() => {
    let cancelled = false;
    showApi
      .get(showId)
      .then((res) => {
        if (!cancelled) setDetail(res.data.result);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(getErrorMessage(err, t('player.perform.loadFailed')));
      });
    return () => {
      cancelled = true;
    };
  }, [showId]);

  const wrongTeam = detail !== null && detail.show.teamId !== teamId;

  // Tải MusicXML từng bài, tối đa PERFORM_LOAD_CONCURRENCY yêu cầu cùng lúc; bài lỗi bị đánh dấu để bỏ qua khi lật
  useEffect(() => {
    if (items.length === 0 || wrongTeam) return;
    let cancelled = false;
    const queue = [...items];
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const id = item.id;
        try {
          const xml = await fetchMusicXml(item.scoreId);
          if (cancelled) return;
          setXmls((prev) => ({ ...prev, [id]: xml }));
          setStates((prev) => ({ ...prev, [id]: 'ok' }));
        } catch {
          if (cancelled) return;
          setStates((prev) => ({ ...prev, [id]: 'error' }));
        }
      }
    };
    const workers = Math.min(PERFORM_LOAD_CONCURRENCY, items.length);
    void Promise.all(Array.from({ length: workers }, worker));
    return () => {
      cancelled = true;
    };
  }, [items, wrongTeam]);

  // Giữ màn hình sáng suốt buổi diễn (trình duyệt tự nhả khi tab bị ẩn nên xin lại khi quay về)
  useEffect(() => {
    if (!started) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      const granted = await requestWakeLock();
      if (cancelled) void granted?.release();
      else lock = granted;
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
      if (document.fullscreenElement) void document.exitFullscreen();
    };
  }, [started]);

  const settled = items.filter((item) => states[item.id] !== undefined).length;
  const failed = items.filter((item) => states[item.id] === 'error').length;
  const firstPlayable = items.findIndex((item) => states[item.id] === 'ok');
  const item = items[index];

  const playableFrom = (from: number, step: 1 | -1): number => {
    for (let i = from + step; i >= 0 && i < items.length; i += step) {
      if (states[items[i].id] === 'ok') return i;
    }
    return -1;
  };

  const settingsOf = (target: ShowItem): PerformSettings =>
    settingsMap[target.id] ?? loadPerformSettings(showId, target.id);

  const updateSettings = (patch: Partial<PerformSettings>) => {
    if (!item) return;
    const merged = { ...settingsOf(item), ...patch };
    const next = { transpose: clampTranspose(merged.transpose), zoom: clampZoom(merged.zoom) };
    setSettingsMap((prev) => ({ ...prev, [item.id]: next }));
    savePerformSettings(showId, item.id, next);
  };

  const goTo = useCallback((target: number) => {
    setIndex(target);
    setUpNext(null);
    setPanel(null);
    setPage(1);
    setPageCount(1);
  }, []);

  useEffect(() => {
    if (upNext === null) return;
    const timer = setTimeout(() => goTo(upNext), PERFORM_INTERLUDE_MS);
    return () => clearTimeout(timer);
  }, [upNext, goTo]);

  const scrollToPage = (target: number) => {
    const scroller = stageRef.current?.querySelector<HTMLElement>('.sv-canvas');
    const sheet = scroller?.querySelectorAll<SVGElement>('.sv-canvas__host svg')[target - 1];
    if (!scroller || !sheet) return;
    scroller.scrollTop += sheet.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  };

  const next = () => {
    if (upNext !== null) {
      goTo(upNext);
    } else if (page < pageCount) {
      scrollToPage(page + 1);
    } else {
      const target = playableFrom(index, 1);
      if (target >= 0) setUpNext(target);
      else toast.info(t('player.perform.end'));
    }
  };

  const prev = () => {
    if (upNext !== null) {
      setUpNext(null);
    } else if (page > 1) {
      scrollToPage(page - 1);
    } else {
      const target = playableFrom(index, -1);
      if (target < 0) return;
      pendingLastPage.current = true;
      goTo(target);
    }
  };

  const handleRendered = (pages: number) => {
    setPageCount(pages);
    if (!pendingLastPage.current) return;
    pendingLastPage.current = false;
    scrollToPage(pages);
  };

  const start = async () => {
    goTo(Math.max(firstPlayable, 0));
    setStarted(true);
    if (document.fullscreenEnabled) await rootRef.current?.requestFullscreen().catch(() => undefined);
  };

  const { onStageClick } = usePageTurner({
    enabled: started && panel === null,
    onNext: next,
    onPrev: prev,
    onList: () => setPanel('list'),
    onExit: () => (panel ? setPanel(null) : navigate(showPath)),
  });

  const renderBody = () => {
    if (loadError) return <Notice message={loadError} action={t('player.perform.backToTeams')} to="/teams" />;
    if (wrongTeam)
      return <Notice message={t('player.perform.wrongTeam')} action={t('player.perform.backToTeams')} to="/teams" />;
    if (!detail) return <p className="pf-center">{t('common.loading')}</p>;
    if (items.length === 0) {
      return <Notice message={t('player.perform.empty')} action={t('player.perform.backToShow')} to={showPath} />;
    }
    if (!started) {
      const ready = settled === items.length;
      return (
        <div className="pf-center pf-intro">
          <h1>{detail.show.name}</h1>
          <p>
            {ready
              ? t('player.perform.ready', { count: items.length - failed })
              : t('player.perform.loading', { done: settled, total: items.length })}
          </p>
          {failed > 0 && <p className="pf-warn">{t('player.perform.skipped', { count: failed })}</p>}
          {ready && firstPlayable < 0 && <p className="pf-warn">{t('player.perform.noneOpenable')}</p>}
          <button
            type="button"
            className="pf-btn pf-btn--primary"
            disabled={!ready || firstPlayable < 0}
            onClick={() => void start()}
          >
            {t('player.perform.start')}
          </button>
          <p className="pf-hint">{t('player.perform.hint')}</p>
          <button type="button" className="pf-btn" onClick={() => navigate(showPath)}>
            {t('player.perform.backToShow')}
          </button>
        </div>
      );
    }
    const current = settingsOf(item);
    const upcoming = upNext !== null ? items[upNext] : null;
    return (
      <>
        <header className="pf-bar">
          <div className="pf-bar__title">
            <strong>{item.scoreTitle}</strong>
            <span>{t('player.perform.songOf', { n: index + 1, total: items.length })}</span>
            {item.notes && <span className="pf-bar__notes">{item.notes}</span>}
          </div>
          <span className="pf-bar__page">{t('player.perform.page', { page, total: pageCount })}</span>
          <button type="button" className="pf-btn" onClick={() => setPanel('list')}>
            {t('player.perform.setList')}
          </button>
          <button type="button" className="pf-btn" onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>
            {t('player.perform.settings')}
          </button>
          <button type="button" className="pf-btn" onClick={() => navigate(showPath)}>
            {t('player.perform.exit')}
          </button>
        </header>
        {panel === 'settings' && (
          <div className="pf-settings" role="dialog" aria-label={t('player.perform.settings')}>
            <Stepper
              label={t('player.perform.transpose')}
              value={current.transpose > 0 ? `+${current.transpose}` : String(current.transpose)}
              canDown={current.transpose > PERFORM_TRANSPOSE_MIN}
              canUp={current.transpose < PERFORM_TRANSPOSE_MAX}
              onDown={() => updateSettings({ transpose: current.transpose - 1 })}
              onUp={() => updateSettings({ transpose: current.transpose + 1 })}
            />
            <Stepper
              label={t('player.perform.zoom')}
              value={`${current.zoom}%`}
              canDown
              canUp
              onDown={() => updateSettings({ zoom: current.zoom - ZOOM_STEP })}
              onUp={() => updateSettings({ zoom: current.zoom + ZOOM_STEP })}
            />
            <label className="pf-settings__row">
              <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
              {t('player.perform.invert')}
            </label>
          </div>
        )}
        <div ref={stageRef} className="pf-stage" onClick={onStageClick}>
          {states[item.id] === 'ok' ? (
            <ScoreCanvas
              key={item.id}
              xml={xmls[item.id]}
              zoom={current.zoom}
              mode="page"
              inverted={invert}
              transpose={current.transpose}
              onZoomChange={(zoom) => updateSettings({ zoom })}
              onRendered={handleRendered}
              onProgress={setPage}
              onError={() => setStates((prev) => ({ ...prev, [item.id]: 'error' }))}
            />
          ) : (
            <div className="pf-center">{t('player.perform.unavailable')}</div>
          )}
          {upcoming && (
            <div className="pf-interlude" role="status">
              <p>{t('player.perform.nextUp', { title: upcoming.scoreTitle })}</p>
              <span>{t('player.perform.tapToContinue')}</span>
            </div>
          )}
        </div>
        {panel === 'list' && (
          <SetList items={items} states={states} currentIndex={index} onPick={goTo} onClose={() => setPanel(null)} />
        )}
      </>
    );
  };

  return (
    <div ref={rootRef} className="pf">
      {renderBody()}
    </div>
  );
}

function Notice({ message, action, to }: { message: string; action: string; to: string }) {
  const navigate = useNavigate();
  return (
    <div className="pf-center">
      <p>{message}</p>
      <button type="button" className="pf-btn pf-btn--primary" onClick={() => navigate(to)}>
        {action}
      </button>
    </div>
  );
}

interface StepperProps {
  label: string;
  value: string;
  canDown: boolean;
  canUp: boolean;
  onDown: () => void;
  onUp: () => void;
}

function Stepper({ label, value, canDown, canUp, onDown, onUp }: StepperProps) {
  return (
    <div className="pf-settings__row">
      <span>{label}</span>
      <button type="button" className="pf-btn" disabled={!canDown} onClick={onDown} aria-label={`${label} −`}>
        −
      </button>
      <output>{value}</output>
      <button type="button" className="pf-btn" disabled={!canUp} onClick={onUp} aria-label={`${label} +`}>
        +
      </button>
    </div>
  );
}
