import { useRef, useState } from 'react';
import {
  IconClose,
  IconMore,
  IconNextMeasure,
  IconPauseBig,
  IconPlayBig,
  IconPrevMeasure,
  IconStopSmall,
} from './controls/PlayerIcons';
import { ChordControl } from './controls/ChordControl';
import { LoopControl } from './controls/LoopControl';
import { mixOf } from './state/mixer';
import { MixerPopover } from './controls/MixerPopover';
import { PlayerSheet } from './PlayerSheet';
import type { SheetTab } from './PlayerSheet';
import { DEFAULT_TEMPO_PERCENT } from './state/settings';
import { TempoControl } from './controls/TempoControl';
import { TransposeControl } from './controls/TransposeControl';
import { CHORD_TRACK_ID } from './engine/timeline';
import { TransportProgress } from './controls/TransportProgress';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useEnginePosition } from './hooks/usePlayer';
import type { PlayerApi } from './hooks/usePlayer';
import { t } from '../../i18n/core';
import './player.css';

/** Dưới mức này các tùy chọn dồn vào nút "⋯" và bottom sheet (khớp @media trong player.css). */
const MOBILE_QUERY = '(max-width: 767px)';

type ControlId = 'tempo' | 'loop' | 'transpose' | 'mixer' | 'chords';

const fmt = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Props {
  player: PlayerApi;
  /** Có thì hiện nút đóng (trong Editor). */
  onClose?: () => void;
  /** Nội dung chèn thêm bên phải (ví dụ menu nhạc cụ). */
  extra?: React.ReactNode;
  /** Bản nhạc ở trang này chọn được đoạn A-B bằng Shift + kéo (trang phát): hiện mẹo trong khung Lặp. */
  canDragLoop?: boolean;
  /** Bản nhạc ở trang này được vẽ lại theo giọng mới khi chuyển giọng (trang phát); không thì chỉ đổi âm thanh (Editor). */
  transposeRedraws?: boolean;
  /** Có thì cho phép ghi giọng đang nghe thành nội dung bản nhạc (chỉ người được sửa). Trả về true nếu thành công. */
  onApplyTranspose?: (semitones: number) => Promise<boolean> | boolean;
  /** Giải thích hậu quả của việc áp dụng (ví dụ "sẽ lưu thành phiên bản mới") để người dùng xác nhận. */
  applyTransposeHint?: string;
}

export function PlayerBar({
  player,
  onClose,
  extra,
  canDragLoop,
  transposeRedraws,
  onApplyTranspose,
  applyTransposeHint,
}: Props) {
  if (!player.engine || !player.timeline) {
    return (
      <div className="pl-bar pl-bar--notice" role="region" aria-label={t('player.bar.region')}>
        <span className="pl-notice">{player.supported ? t('player.bar.preparing') : t('player.bar.unsupported')}</span>
        {onClose && (
          <button type="button" className="pl-btn pl-btn--ghost" onClick={onClose} aria-label={t('player.bar.close')}>
            <IconClose />
          </button>
        )}
      </div>
    );
  }
  return (
    <BarBody
      player={player}
      onClose={onClose}
      extra={extra}
      canDragLoop={canDragLoop}
      transposeRedraws={transposeRedraws}
      onApplyTranspose={onApplyTranspose}
      applyTransposeHint={applyTransposeHint}
      engine={player.engine}
      timeline={player.timeline}
    />
  );
}

function BarBody({
  player,
  onClose,
  extra,
  canDragLoop,
  transposeRedraws,
  onApplyTranspose,
  applyTransposeHint,
  engine,
  timeline,
}: Props & { engine: NonNullable<PlayerApi['engine']>; timeline: NonNullable<PlayerApi['timeline']> }) {
  const position = useEnginePosition(engine);
  const playing = player.status === 'playing';
  const loading = player.sampler.state === 'loading';
  const order = timeline.measures.findIndex((m) => position < m.end);
  const current = (order < 0 ? timeline.measures.length : order + 1) || 1;
  // Ô đang phát theo chỉ số trong bản nhạc (khác thứ tự lượt phát khi có dấu lặp lại)
  const currentMeasure = timeline.measures[Math.max(0, order < 0 ? timeline.measures.length - 1 : order)]?.index ?? 0;
  const percent = Math.round(player.sampler.progress * 100);
  /** Đệm hợp âm đang bật (track Hợp âm không bị tắt tiếng); mặc định bật. */
  const chordsOn = !mixOf(player.mixer, CHORD_TRACK_ID).mute;
  // Thời gian hiển thị là giây thật: ở 50% bài dài gấp đôi
  const speed = player.tempoPercent / 100;

  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<ControlId>('tempo');
  const moreRef = useRef<HTMLButtonElement>(null);
  // Phóng to cửa sổ (xoay máy, iPad) thì sheet không còn chỗ đứng: đóng luôn để khi thu nhỏ lại không tự bật lên
  if (!isMobile && sheetOpen) setSheetOpen(false);

  const hasChords = timeline.tracks.some((t) => t.id === CHORD_TRACK_ID);
  const hasMixer = timeline.tracks.length >= 2;
  const tabs: SheetTab[] = [
    { id: 'tempo', label: t('player.tabs.tempo') },
    { id: 'loop', label: t('player.tabs.loop') },
    { id: 'transpose', label: t('player.tabs.transpose') },
    ...(hasMixer ? [{ id: 'mixer', label: 'Mixer' }] : []),
    ...(hasChords ? [{ id: 'chords', label: t('player.tabs.chords') }] : []),
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'tempo';
  /** Có cài đặt khác mặc định (tempo, lặp, chuyển giọng, mixer, hợp âm) thì nút "⋯" có chấm báo. */
  const customized =
    player.tempoPercent !== DEFAULT_TEMPO_PERCENT ||
    player.loop.enabled ||
    player.transpose !== 0 ||
    Object.keys(player.mixer).length > 0 ||
    (hasChords && !player.chordCarry);

  /** Một điều khiển: ở desktop là nút + hộp nổi, trong sheet (inline) chỉ là phần nội dung. */
  const control = (id: ControlId, inline: boolean): React.ReactNode => {
    switch (id) {
      case 'chords':
        return (
          <ChordControl
            on={chordsOn}
            carry={player.chordCarry}
            onToggle={() => player.setTrackMix(CHORD_TRACK_ID, { mute: chordsOn })}
            onCarryChange={player.setChordCarry}
            disabled={!player.canPlay}
            inline={inline}
          />
        );
      case 'tempo':
        return (
          <TempoControl
            percent={player.tempoPercent}
            baseBpm={timeline.baseBpm}
            onChange={player.setTempoPercent}
            disabled={!player.canPlay}
            inline={inline}
          />
        );
      case 'loop':
        return (
          <LoopControl
            loop={player.loop}
            measureCount={timeline.measureCount}
            currentMeasure={currentMeasure}
            unreachable={player.loop.a !== null && player.loop.b !== null && player.loopSegments.length === 0}
            onMark={player.markLoop}
            onChange={player.setLoop}
            onClear={player.clearLoop}
            showDragHint={canDragLoop}
            disabled={!player.canPlay}
            inline={inline}
          />
        );
      case 'transpose':
        return (
          <TransposeControl
            semitones={player.transpose}
            startKey={player.startKey}
            outOfRange={player.outOfRange}
            redraws={transposeRedraws === true}
            onChange={player.setTranspose}
            onApply={onApplyTranspose}
            applyHint={applyTransposeHint}
            disabled={!player.canPlay}
            inline={inline}
          />
        );
      case 'mixer':
        return (
          <MixerPopover
            tracks={timeline.tracks}
            mixer={player.mixer}
            onChange={player.setTrackMix}
            onReset={player.resetMixer}
            disabled={!player.canPlay}
            inline={inline}
          />
        );
    }
  };

  let notice: React.ReactNode = null;
  if (player.empty) notice = <span className="pl-notice">{t('player.bar.empty')}</span>;
  else if (loading) notice = <span className="pl-notice">{t('player.bar.loadingPiano', { percent })}</span>;
  else if (player.sampler.state === 'error' || player.sampler.state === 'unsupported')
    notice = (
      <span className="pl-notice pl-notice--warn">
        {t('player.bar.fallbackSound')}
        <button type="button" className="pl-link" onClick={player.retrySamples}>
          {t('player.bar.reload')}
        </button>
      </span>
    );

  return (
    <div className="pl-bar" role="region" aria-label={t('player.bar.region')}>
      <div className="pl-transport">
        <button
          type="button"
          className="pl-btn"
          onClick={() => player.step(-1)}
          disabled={!player.canPlay}
          aria-label={t('player.bar.prev')}
          title={t('player.bar.prevTitle')}
        >
          <IconPrevMeasure />
        </button>
        <button
          type="button"
          className={`pl-btn pl-btn--play${loading ? ' pl-btn--loading' : ''}`}
          onClick={player.toggle}
          disabled={!player.canPlay}
          aria-label={playing ? t('player.bar.pause') : t('player.bar.play')}
          title={playing ? t('player.bar.pauseTitle') : t('player.bar.playTitle')}
        >
          {playing ? <IconPauseBig /> : <IconPlayBig />}
        </button>
        <button
          type="button"
          className="pl-btn"
          onClick={() => player.step(1)}
          disabled={!player.canPlay}
          aria-label={t('player.bar.next')}
          title={t('player.bar.nextTitle')}
        >
          <IconNextMeasure />
        </button>
        <button
          type="button"
          className="pl-btn pl-btn--stop"
          onClick={player.stop}
          disabled={player.status === 'stopped' && position === 0}
          aria-label={t('player.bar.stop')}
          title={t('player.bar.stop')}
        >
          <IconStopSmall />
        </button>
      </div>
      <div className="pl-middle">
        <TransportProgress
          timeline={timeline}
          position={position}
          disabled={!player.canPlay}
          onSeek={(s) => engine.seek(s)}
          loopSegments={player.loopSegments}
          loopOn={player.loop.enabled}
        />
        <div className="pl-meta">
          <span className="pl-time" aria-live="off">
            {t('player.bar.measureOf', {
              current: Math.min(current, timeline.measures.length),
              total: timeline.measures.length,
            })}{' '}
            · {fmt(position / speed)} / {fmt(timeline.total / speed)}
          </span>
          {notice}
        </div>
      </div>
      <div className="pl-side">
        {isMobile ? (
          <button
            ref={moreRef}
            type="button"
            className={`pl-btn pl-btn--more${sheetOpen ? ' pl-btn--open' : ''}`}
            onClick={() => setSheetOpen((v) => !v)}
            disabled={!player.canPlay}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            aria-label={customized ? t('player.bar.optionsCustom') : t('player.bar.options')}
            title={t('player.bar.options')}
          >
            <IconMore />
            {customized && <span className="pl-btn__dot" aria-hidden="true" />}
          </button>
        ) : (
          <>
            {hasChords && control('chords', false)}
            {control('tempo', false)}
            {control('loop', false)}
            {control('transpose', false)}
            {control('mixer', false)}
          </>
        )}
        {extra}
        {onClose && (
          <button type="button" className="pl-btn pl-btn--ghost" onClick={onClose} aria-label={t('player.bar.close')}>
            <IconClose />
          </button>
        )}
      </div>
      {isMobile && sheetOpen && (
        <PlayerSheet
          tabs={tabs}
          active={activeTab}
          onSelect={(id) => setTab(id as ControlId)}
          onClose={() => setSheetOpen(false)}
          returnFocusRef={moreRef}
        >
          {control(activeTab as ControlId, true)}
        </PlayerSheet>
      )}
    </div>
  );
}
