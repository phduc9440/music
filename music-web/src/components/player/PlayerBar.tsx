import { IconClose, IconNextMeasure, IconPauseBig, IconPlayBig, IconPrevMeasure, IconStopSmall } from './PlayerIcons';
import { LoopControl } from './LoopControl';
import { MixerPopover } from './MixerPopover';
import { TempoControl } from './TempoControl';
import { TransportProgress } from './TransportProgress';
import { useEnginePosition } from './usePlayer';
import type { PlayerApi } from './usePlayer';
import './player.css';

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
}

export function PlayerBar({ player, onClose, extra, canDragLoop }: Props) {
  if (!player.engine || !player.timeline) {
    return (
      <div className="pl-bar pl-bar--notice" role="region" aria-label="Trình phát">
        <span className="pl-notice">
          {player.supported ? 'Đang chuẩn bị trình phát…' : 'Trình duyệt này không hỗ trợ phát nhạc (Web Audio).'}
        </span>
        {onClose && (
          <button type="button" className="pl-btn pl-btn--ghost" onClick={onClose} aria-label="Đóng trình phát">
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
  // Thời gian hiển thị là giây thật: ở 50% bài dài gấp đôi
  const speed = player.tempoPercent / 100;

  let notice: React.ReactNode = null;
  if (player.empty) notice = <span className="pl-notice">Bản nhạc trống, chưa có nốt để phát.</span>;
  else if (loading) notice = <span className="pl-notice">Đang tải âm piano… {percent}%</span>;
  else if (player.sampler.state === 'error' || player.sampler.state === 'unsupported')
    notice = (
      <span className="pl-notice pl-notice--warn">
        Đang dùng âm thanh thay thế
        <button type="button" className="pl-link" onClick={player.retrySamples}>
          Tải lại
        </button>
      </span>
    );

  return (
    <div className="pl-bar" role="region" aria-label="Trình phát">
      <div className="pl-transport">
        <button
          type="button"
          className="pl-btn"
          onClick={() => player.step(-1)}
          disabled={!player.canPlay}
          aria-label="Ô trước"
          title="Ô trước (←)"
        >
          <IconPrevMeasure />
        </button>
        <button
          type="button"
          className={`pl-btn pl-btn--play${loading ? ' pl-btn--loading' : ''}`}
          onClick={player.toggle}
          disabled={!player.canPlay}
          aria-label={playing ? 'Tạm dừng' : 'Phát'}
          title={playing ? 'Tạm dừng (Space)' : 'Phát (Space)'}
        >
          {playing ? <IconPauseBig /> : <IconPlayBig />}
        </button>
        <button
          type="button"
          className="pl-btn"
          onClick={() => player.step(1)}
          disabled={!player.canPlay}
          aria-label="Ô sau"
          title="Ô sau (→)"
        >
          <IconNextMeasure />
        </button>
        <button
          type="button"
          className="pl-btn pl-btn--stop"
          onClick={player.stop}
          disabled={player.status === 'stopped' && position === 0}
          aria-label="Dừng"
          title="Dừng"
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
            Ô {Math.min(current, timeline.measures.length)} / {timeline.measures.length} · {fmt(position / speed)} /{' '}
            {fmt(timeline.total / speed)}
          </span>
          {notice}
        </div>
      </div>
      <div className="pl-side">
        <TempoControl
          percent={player.tempoPercent}
          baseBpm={timeline.baseBpm}
          onChange={player.setTempoPercent}
          disabled={!player.canPlay}
        />
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
        />
        <MixerPopover
          tracks={timeline.tracks}
          mixer={player.mixer}
          onChange={player.setTrackMix}
          onReset={player.resetMixer}
          disabled={!player.canPlay}
        />
        {extra}
        {onClose && (
          <button type="button" className="pl-btn pl-btn--ghost" onClick={onClose} aria-label="Đóng trình phát">
            <IconClose />
          </button>
        )}
      </div>
    </div>
  );
}
