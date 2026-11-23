import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { usePlayer } from '../../../../components/player/hooks/usePlayer';
import type { ScoreDocument } from '../../../../components/editor/core/ScoreDocument';
import { countView } from '../../../../services/practice/playbackApi';
import type { ScoreDetail } from '../../../../types';

/**
 * Thanh Player của Editor: mở bằng nút Phát (đợi mẫu âm tải xong rồi mới phát từ vùng chọn), dừng khi bản nhạc bị sửa
 * lúc đang phát, vùng lặp A–B để tô trên bản nhạc.
 */
export function useEditorPlayer(
  doc: ScoreDocument,
  score: ScoreDetail,
  revision: number,
  selectionRef: MutableRefObject<ReadonlySet<string>>,
) {
  const [playerOpen, setPlayerOpen] = useState(false);
  const playAfterLoad = useRef(false);
  const player = usePlayer(doc, {
    scoreId: score.id,
    enabled: playerOpen,
    fallbackBpm: score.tempoBpm ?? 100,
    revision,
    onFirstPlay: () => void countView(score.id),
  });
  const { canPlay, playFrom, stop: stopPlayer, status: playerStatus } = player;
  const { a: loopA, b: loopB, enabled: loopOn } = player.loop;
  const loopRange = useMemo(
    () => (playerOpen && loopA !== null && loopB !== null ? { start: loopA, end: loopB, active: loopOn } : null),
    [playerOpen, loopA, loopB, loopOn],
  );

  // Mở thanh Player bằng nút Phát: đợi mẫu âm tải xong rồi mới phát
  useEffect(() => {
    if (playerOpen && playAfterLoad.current && canPlay) {
      playAfterLoad.current = false;
      playFrom(selectionRef.current);
    }
  }, [playerOpen, canPlay, playFrom, selectionRef]);

  // Sửa bản nhạc khi đang phát: dừng để không phát lệch nội dung mới
  const lastRevision = useRef(revision);
  useEffect(() => {
    if (lastRevision.current === revision) return;
    lastRevision.current = revision;
    if (playerStatus !== 'stopped') stopPlayer();
  }, [revision, playerStatus, stopPlayer]);

  const onPlayButton = () => {
    if (!playerOpen) {
      playAfterLoad.current = true;
      setPlayerOpen(true);
    } else player.playFrom(selectionRef.current);
  };
  const closePlayer = () => {
    playAfterLoad.current = false;
    stopPlayer();
    setPlayerOpen(false);
  };

  return { player, playerOpen, loopRange, onPlayButton, closePlayer };
}
