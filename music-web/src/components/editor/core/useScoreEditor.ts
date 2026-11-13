/**
 * Hook trung tâm của trình chỉnh sửa cao độ: giữ vùng chọn, lịch sử hoàn tác, trạng thái lưu, bản nháp và xung đột
 * phiên bản. DOM MusicXML nằm trong {@link ScoreDocument} (đối tượng ổn định, sửa tại chỗ) nên React chỉ giữ
 * `revision` tăng dần để biết khi nào phải vẽ lại, không tạo lại object mỗi lần.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { fetchMusicXmlWithVersion, saveMusicXml } from '../../../services';
import { versionApi } from '../../../services/score/versionApi';
import { getConflictVersion, getSaveErrorMessage } from '../../../utils/score';
import { reportPlanLimit } from '../../../utils/planLimit';
import { changePitch, editFailureMessage, removeNotes, setAlteration } from './commands';
import { transposeDocument } from '../notes/transpose';
import type { EditResult, SymbolOp } from './commands';
import {
  durationLabel,
  DURATION_QUARTERS,
  dotsLabel,
  enterNote,
  insertNote,
  isLetterKey,
  nextDots,
  setDuration,
} from '../notes/durations';
import { dotCount } from '../notes/durationCore';
import type { AccidentalChoice, DurationChoice, DurationType, InsertTarget } from '../notes/durations';
import {
  DRAFT_INTERVAL_MS,
  DRAFT_PREFIX,
  SUGGEST_DRAFT_PREFIX,
  clearDraft,
  loadDraft,
  purgeOtherDrafts,
  saveDraft,
} from './draft';
import type { Draft } from './draft';
import { describeSelection } from './describe';
import { History } from './history';
import { measureKey } from '../live/LiveSession';
import type { LiveCollab } from '../live/useLiveCollab';
import type { EditCommand } from './commands';
import { getVersionErrorMessage } from '../version/versionUtils';
import { checkMeasures, confirmMeasure } from '../structure/measureCheck';
import { setHeaderText } from '../structure/header';
import type { HeaderField, TextStyle } from '../structure/header';
import { canHoldChord, pasteChords, setChord, stepChordNote } from '../notation/harmony';
import { canHoldLyric, pasteLyrics, setLyric, stepLyricNote } from '../notation/lyrics';
import type { LyricEnd } from '../notation/lyrics';
import { applyMark as runMark } from '../notation/marks';
import type { MarkOp } from '../notation/marks';
import { deleteMeasures, insertMeasure } from '../structure/structure';
import { addChordNote, addHarmonyVoice, removeVoice, toggleCue } from '../notes/voices';
import type { VoiceOp } from '../notes/voices';
import { addBassStaff, addPart, changeNotation, readNotation, removeStaff } from '../structure/staves';
import type { NotationChange } from '../structure/staves';
import { setTempo } from '../structure/tempo';
import { makeTuplet, removeTuplet, tupletName } from '../notes/tuplets';
import type { TupletOp } from '../notes/tuplets';
import type { TempoInfo } from '../structure/tempo';
import { toggleSlur, toggleTie } from '../notes/ties';
import type { MeasureIssue } from '../structure/measureCheck';
import type { PitchOp } from '../notes/pitch';
import { selectionGroups } from '../audio/playback';
import { loadPreviewTonePref, playPreviewGroups, savePreviewTonePref } from '../audio/previewTone';
import type { ScoreDocument } from './ScoreDocument';
import { useDialog } from '../../ui/dialog-context';
import { t } from '../../../i18n/core';

/** Phím số chọn nhanh trường độ: 1 móc kép ... 5 tròn, 6 móc ba, 7 móc tứ. */
const DIGIT_DURATIONS: Record<string, DurationType> = {
  '1': '16th',
  '2': 'eighth',
  '3': 'quarter',
  '4': 'half',
  '5': 'whole',
  '6': '32nd',
  '7': '64th',
};

/** Hộp thoại hỏi khi rời trang còn thay đổi chưa lưu. */
const leaveDialogOptions = () => ({
  title: t('editor.leave.title'),
  message: t('editor.leave.message'),
  confirmLabel: t('editor.leave.confirm'),
  cancelLabel: t('editor.leave.stay'),
  tone: 'danger' as const,
});

/** Thời gian hiện thông báo ngắn trên thanh trạng thái (ms). */
const NOTICE_MS = 2500;

export interface UseScoreEditorOptions {
  scoreId: string;
  /** Tên bản nhạc, dùng đặt tên file khi tải bản của người dùng về máy. */
  title: string;
  doc: ScoreDocument;
  /** Phiên bản MusicXML web đang giữ (từ `currentVersion` của BE). */
  initialVersion: number;
  /** false: chỉ xem, mọi thao tác sửa bị tắt. */
  canEdit: boolean;
  /** Được ghi đè khi xung đột (chủ sở hữu hoặc ADMIN). */
  canForce: boolean;
  /** true khi có hộp thoại khác đang mở: tạm tắt phím tắt sửa. */
  blocked: boolean;
  /**
   * `direct` (mặc định): Lưu ghi thẳng lên bản nhạc. `suggest`: Lưu không gọi máy chủ mà đưa MusicXML đã sửa cho
   * `onSuggest` (mở hộp gửi đề xuất); nháp dùng tiền tố riêng.
   */
  mode?: 'direct' | 'suggest';
  /** Chế độ `suggest`: nhận MusicXML đã sửa khi người dùng bấm Gửi đề xuất / Ctrl+S. */
  onSuggest?: (xml: string) => void;
  /**
   * Đồng chỉnh sửa thời gian thực: khi `live.active`, mọi lệnh được gửi lên máy chủ theo từng ô, Lưu tạo phiên bản từ
   * trạng thái chung, và bản nháp trong trình duyệt bị tắt (máy chủ giữ bản nhạc).
   */
  live?: LiveCollab | null;
}

/** Thông báo ngắn; `key` đổi mỗi lần để giao diện chạy lại hiệu ứng rung. */
export interface Notice {
  text: string;
  key: number;
}

export interface ScoreEditor {
  selection: ReadonlySet<string>;
  /** Tăng sau mỗi thay đổi nội dung (sửa, hoàn tác, làm lại, khôi phục nháp) để vẽ lại bản nhạc. */
  revision: number;
  dirty: boolean;
  saving: boolean;
  version: number;
  canUndo: boolean;
  canRedo: boolean;
  /** Các ô nhịp sai độ dài. */
  issues: MeasureIssue[];
  /** Mô tả vùng chọn cho thanh trạng thái. */
  statusText: string;
  notice: Notice | null;
  previewTone: boolean;
  setPreviewTone: (enabled: boolean) => void;
  /** Khác null khi BE báo lỗi 2014: phiên bản mới nhất ở máy chủ (0 nếu không rõ). */
  conflict: { latestVersion: number } | null;
  /** Bản nháp chờ người dùng quyết định khôi phục hay bỏ. */
  draft: Draft | null;
  select: (ids: readonly string[], additive: boolean) => void;
  clearSelection: () => void;
  applyPitch: (op: PitchOp) => void;
  /** Chế độ nhập nốt: chọn dấu lặng rồi bấm phím A–G để biến nó thành nốt. */
  inputMode: boolean;
  setInputMode: (enabled: boolean) => void;
  /** Chế độ nhập lời: chọn nốt rồi gõ âm tiết, Space sang nốt kế. */
  lyricMode: boolean;
  setLyricMode: (enabled: boolean) => void;
  /** Chế độ nhập hợp âm: chọn nốt rồi gõ "Am7", "C/G"... */
  chordMode: boolean;
  setChordMode: (enabled: boolean) => void;
  /** Ghi hợp âm cho nốt đang chọn; `advance` = sang nốt kế sau khi ghi. */
  enterChord: (text: string, advance: boolean) => void;
  moveChord: (delta: 1 | -1) => void;
  /** Gán một dãy hợp âm lên các nốt liên tiếp từ nốt đang chọn. */
  pasteChordText: (text: string) => void;
  /** Áp ký hiệu sắc thái / lặp / chỉ dẫn lên vùng chọn. */
  applyMark: (op: MarkOp) => void;
  /** Thêm ô nhịp trống sau / trước ô đang chọn (không chọn gì: thêm vào cuối), hoặc xóa các ô đang chọn. */
  editMeasures: (op: 'insertAfter' | 'insertBefore' | 'delete') => void;
  /** Chuyển giọng cả bản nhạc `semitones` nửa cung thành một lệnh hoàn tác được; trả về true nếu thành công. */
  transposeScore: (semitones: number) => boolean;
  /** Thêm khuông Fa cho đàn, thêm khuông Sol/Fa riêng (phần nhạc mới), hoặc xóa khuông của nốt đang chọn. */
  editStaves: (op: 'addBass' | 'addG' | 'addF' | 'addTenor' | 'remove') => void;
  /** Đổi khóa nhạc, dấu hóa đầu khuông hoặc nhịp tại vùng chọn. */
  editNotation: (change: NotationChange) => void;
  /** Viết bè (sao nốt sang bè mới, nốt nhỏ), bật/tắt nốt nhỏ, hoặc xóa bè phụ. */
  editVoice: (op: VoiceOp) => void;
  /** Tạo chùm (chùm ba, chùm năm...) từ nốt đang chọn, hoặc gộp chùm đang chọn về một nốt. */
  editTuplet: (op: TupletOp) => void;
  /** Lời đang nhập (1–4). */
  lyricVerse: number;
  setLyricVerse: (verse: number) => void;
  /** Ghi âm tiết cho nốt đang chọn: 'word' hết chữ rồi sang nốt kế, 'hyphen' chữ còn tiếp rồi sang nốt kế, 'stay' ở lại. */
  enterLyric: (text: string, end: LyricEnd | 'stay') => void;
  /** Chuyển sang nốt kế (1) / liền trước (−1) có thể mang lời. */
  moveLyric: (delta: 1 | -1) => void;
  /** Gán cả đoạn lời lên các nốt liên tiếp từ nốt đang chọn. */
  pasteLyricsText: (text: string) => void;
  /** Sửa tiêu đề / tác giả (nội dung và kiểu chữ); true nếu đã áp dụng. */
  editHeader: (field: HeaderField, text: string, style: TextStyle) => boolean;
  /** Sửa chỉ số nhịp (tempo); true nếu đã áp dụng. */
  editTempo: (info: TempoInfo) => boolean;
  /** Trường độ dùng khi nhập nốt (cũng là trường độ vừa chọn trên bảng công cụ). */
  inputDuration: DurationChoice;
  /** true: đổi trường độ nhưng giữ ô nhịp đủ phách (lấp dấu lặng / ghi đè nốt sau); false: đổi thẳng. */
  /** Chọn trường độ: đang nhập nốt thì đặt trường độ nhập, không thì đổi trường độ vùng chọn. */
  chooseDuration: (type: DurationType) => void;
  /** Bật/tắt chấm dôi, cùng quy tắc với {@link chooseDuration}. */
  toggleDot: () => void;
  /** Nhập nốt tên `letter` (a–g) tại nốt đang chọn. */
  enterLetter: (letter: string) => void;
  /** Thêm nốt tại vị trí trên khuông (bấm khuông hoặc kéo-thả trường độ); true nếu thêm được. */
  /** Xác nhận ô nhịp thừa/thiếu phách là đúng (ô lấy đà...), bỏ viền đỏ. */
  confirmMeasureOk: (measureIndex: number) => void;
  insertNoteAt: (target: InsertTarget, choice: DurationChoice, accidental: AccidentalChoice) => boolean;
  /** Áp ký hiệu (thăng, giáng, bình, dấu lặng, xóa) lên vùng chọn. */
  applySymbol: (op: SymbolOp) => void;
  /** Kéo nốt: đổi `steps` bậc (dương = lên) cho vùng chọn, hoặc cho `ids` nếu chúng chưa được chọn. */
  dragPitch: (ids: readonly string[], steps: number) => void;
  /** Chọn riêng nốt thấp hơn (−1) / cao hơn (+1) trong hợp âm đang chọn. */
  selectInChord: (delta: 1 | -1) => void;
  undo: () => void;
  redo: () => void;
  save: (force?: boolean) => Promise<void>;
  /** Chế độ `suggest`: đề xuất đã gửi xong, coi như đã lưu và xóa nháp. */
  finishSuggestion: () => void;
  restoreDraft: () => void;
  discardDraft: () => void;
  /** Xung đột: bỏ thay đổi của tôi, tải lại bản mới nhất. */
  reloadLatest: () => void;
  /** Xung đột: lưu đè bằng `force=true`. */
  overwrite: () => Promise<void>;
  /** Khôi phục một phiên bản cũ thành phiên bản mới nhất và nạp lại tài liệu; true nếu thành công. */
  restoreVersion: (version: number) => Promise<boolean>;
  /** Xung đột: tải bản của tôi về máy dưới dạng .musicxml. */
  downloadMine: () => void;
  dismissConflict: () => void;
  /** Hỏi xác nhận nếu còn thay đổi chưa lưu; true nếu được phép rời trang. */
  /** Hỏi trước khi rời trình chỉnh sửa khi còn thay đổi chưa lưu (hộp thoại của web); true nếu được rời. */
  confirmLeave: () => Promise<boolean>;
}

export function useScoreEditor(options: UseScoreEditorOptions): ScoreEditor {
  const { confirm: confirmDialog } = useDialog();
  const { scoreId, title, doc, initialVersion, canEdit, canForce, blocked, mode = 'direct', onSuggest, live = null } = options;
  const liveActive = live?.active ?? false;
  const bind = live?.bind;
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  });
  const draftPrefix = mode === 'suggest' ? SUGGEST_DRAFT_PREFIX : DRAFT_PREFIX;
  const historyRef = useRef(new History());
  const savingRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const draftWarnedRef = useRef(false);

  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set());
  const [flags, setFlags] = useState({ dirty: false, canUndo: false, canRedo: false });
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(initialVersion);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [inputMode, setInputModeState] = useState(false);
  const [lyricMode, setLyricModeState] = useState(false);
  const [chordMode, setChordModeState] = useState(false);
  const [lyricVerse, setLyricVerse] = useState(1);
  const [inputDuration, setInputDuration] = useState<DurationChoice>({ type: 'quarter', dots: 0 });
  const [previewTone, setPreviewToneState] = useState(loadPreviewTonePref);
  const [conflict, setConflict] = useState<{ latestVersion: number } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => {
    if (!canEdit) return null;
    purgeOtherDrafts(scoreId, initialVersion, draftPrefix); // nháp của phiên bản cũ không còn khôi phục được
    const found = loadDraft(scoreId, initialVersion, draftPrefix);
    return found && found.xml !== doc.serialize() ? found : null;
  });

  const issues = useMemo(() => {
    void revision; // DOM sửa tại chỗ nên phải tính lại khi revision đổi
    return checkMeasures(doc);
  }, [doc, revision]);
  const statusText = useMemo(() => {
    void revision;
    return describeSelection(doc, selection);
  }, [doc, selection, revision]);

  const flash = useCallback((text: string) => {
    setNotice((prev) => ({ text, key: (prev?.key ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /** Đồng bộ cờ từ lịch sử và báo cho canvas vẽ lại. */
  const sync = useCallback(() => {
    const h = historyRef.current;
    setFlags({ dirty: h.dirty, canUndo: h.canUndo, canRedo: h.canRedo });
    setRevision((r) => r + 1);
  }, []);

  // Nhận thay đổi từ người khác: bỏ các bước hoàn tác đã bị họ đè lên, vẽ lại, cập nhật số phiên bản
  useEffect(() => {
    if (!bind) return;
    bind({
      onDocChanged: (touched) => {
        const history = historyRef.current;
        if (touched === 'all') history.clear();
        else {
          history.discard(
            (c) =>
              c.head !== undefined ||
              c.parts !== undefined ||
              c.snapshots.some((s) => touched.has(measureKey(s.partIndex, s.measureIndex))),
          );
        }
        sync();
        setSelection((prev) => new Set([...prev].filter((id) => doc.getInfo(id) !== undefined)));
      },
      onVersion: setVersion,
      onNotice: flash,
    });
    return () => bind(null);
  }, [bind, doc, sync, flash]);

  // Các ô của vùng chọn là các ô cần giữ khóa
  const liveSession = live?.session ?? null;
  useEffect(() => {
    if (!liveSession) return;
    const seen = new Set<string>();
    const refs: Array<{ partIndex: number; measureIndex: number }> = [];
    for (const id of selection) {
      const info = doc.getInfo(id);
      if (!info) continue;
      const key = measureKey(info.partIndex, info.measureIndex);
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ partIndex: info.partIndex, measureIndex: info.measureIndex });
    }
    liveSession.setFocus(refs);
  }, [liveSession, selection, doc, revision]);

  /** Lệnh chạm ô đang bị người khác khóa thì báo và không cho thực hiện. */
  const heldByOther = useCallback(
    (command: EditCommand | null): boolean => {
      const session = liveRef.current?.session;
      if (!command || !session) return false;
      const holder = session.heldByOther(command);
      if (holder === null) return false;
      flash(t('live.notice.heldBy', { name: holder }));
      return true;
    },
    [flash],
  );

  const setPreviewTone = useCallback((enabled: boolean) => {
    setPreviewToneState(enabled);
    savePreviewTonePref(enabled);
  }, []);

  const select = useCallback((ids: readonly string[], additive: boolean) => {
    setSelection((prev) => {
      if (!additive) return new Set(ids);
      const next = new Set(prev);
      const allIn = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allIn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  /** Chọn nốt kế tiếp / trước đó theo thứ tự thời gian (Tab / Shift+Tab). */
  const selectRelative = useCallback(
    (delta: 1 | -1) => {
      const heads = doc.notes
        .filter((n) => n.chordIndex === 0 && !n.isRest && !n.isGrace)
        .sort(
          (a, b) =>
            a.measureIndex - b.measureIndex || a.onsetKey - b.onsetKey || a.staff - b.staff || a.voice - b.voice,
        );
      if (heads.length === 0) return;
      const currentIds = new Set(selection);
      const current = heads.findIndex((n) => currentIds.has(n.id));
      const index =
        current < 0 ? (delta > 0 ? 0 : heads.length - 1) : Math.min(heads.length - 1, Math.max(0, current + delta));
      const head = heads[index];
      const ids = doc.notes
        .filter(
          (n) =>
            n.partIndex === head.partIndex &&
            n.measureIndex === head.measureIndex &&
            n.staff === head.staff &&
            n.voice === head.voice &&
            n.entryIndex === head.entryIndex,
        )
        .map((n) => n.id);
      setSelection(new Set(ids));
    },
    [doc, selection],
  );

  /**
   * Chạy một lệnh sửa: báo lỗi nếu thất bại; thành công thì ghi lịch sử, bỏ khỏi vùng chọn những nốt không còn tồn
   * tại (sau khi xóa) và phát âm xem trước cho cả vùng vừa sửa.
   */
  const commit = useCallback(
    (result: EditResult, preview: boolean) => {
      if (!result.ok) {
        const message = editFailureMessage(result.reason);
        flash(message);
        toast.warn(message, { toastId: `edit-${result.reason}` });
        return;
      }
      if (heldByOther(result.command)) {
        // Lệnh đã sửa DOM: trả các ô về như cũ rồi bỏ lệnh
        for (const s of result.command.snapshots) {
          doc.replaceMeasure(s.partIndex, s.measureIndex, s.before.cloneNode(true) as Element, false);
        }
        if (result.command.head) doc.restoreHead(result.command.head.before);
        if (result.command.parts) doc.restoreParts(result.command.parts.before);
        doc.reindex();
        sync();
        return;
      }
      historyRef.current.push(result.command);
      liveRef.current?.session?.enqueue(result.command, 'do');
      sync();
      const after = result.command.selectAfter;
      setSelection((prev) =>
        after ? new Set(after) : new Set([...prev].filter((id) => doc.getInfo(id) !== undefined)),
      );
      if (preview && previewTone) playPreviewGroups(selectionGroups(doc, result.command.changedIds));
    },
    [doc, flash, sync, previewTone, heldByOther],
  );

  /** Áp một thao tác cao độ lên `targets`. */
  const runPitch = useCallback(
    (targets: readonly string[], op: PitchOp, count: number) => {
      if (!canEdit || targets.length === 0) return;
      commit(changePitch(doc, targets, op, count), true);
    },
    [canEdit, doc, commit],
  );

  const chooseDuration = useCallback(
    (type: DurationType) => {
      const choice: DurationChoice = { type, dots: 0 };
      setInputDuration(choice);
      if (inputMode) {
        flash(t('editor.flash.inputDuration', { duration: durationLabel(type) }));
        return;
      }
      if (canEdit && selection.size > 0) commit(setDuration(doc, [...selection], choice), false);
    },
    [inputMode, canEdit, selection, doc, commit, flash],
  );

  const toggleDot = useCallback(() => {
    if (inputMode) {
      const next: DurationChoice = { ...inputDuration, dots: nextDots(inputDuration.dots) };
      setInputDuration(next);
      flash(t('editor.flash.inputDuration', { duration: `${durationLabel(next.type)}${dotsLabel(next.dots)}` }));
      return;
    }
    if (!canEdit || selection.size === 0) return;
    const first = [...selection].map((id) => doc.getInfo(id)).find((n) => n !== undefined);
    const typeText = first?.element.querySelector(':scope > type')?.textContent?.trim() ?? '';
    if (!first || !(typeText in DURATION_QUARTERS)) {
      flash(t('editor.flash.dotUnsupported'));
      return;
    }
    const dots = dotCount(first.element);
    commit(setDuration(doc, [...selection], { type: typeText as DurationType, dots: nextDots(dots) }), false);
  }, [inputMode, inputDuration, canEdit, selection, doc, commit, flash]);

  const enterLetter = useCallback(
    (letter: string) => {
      if (!canEdit || !inputMode || selection.size === 0) return;
      commit(enterNote(doc, [...selection][0], letter, inputDuration), true);
    },
    [canEdit, inputMode, selection, doc, inputDuration, commit],
  );

  const confirmMeasureOk = useCallback(
    (measureIndex: number) => {
      if (canEdit) commit(confirmMeasure(doc, measureIndex), false);
    },
    [canEdit, doc, commit],
  );

  /** Chọn chế độ Chọn (false) hoặc Nhập nốt (true); hai chế độ này tắt chế độ nhập lời. */
  const setInputMode = useCallback((enabled: boolean) => {
    setInputModeState(enabled);
    setLyricModeState(false);
    setChordModeState(false);
  }, []);

  const setLyricMode = useCallback(
    (enabled: boolean) => {
      setLyricModeState(enabled);
      if (!enabled) return;
      setInputModeState(false);
      setChordModeState(false);
      const current = [...selection][0];
      if (current && canHoldLyric(doc, current)) return;
      const first = doc.notes.find((n) => canHoldLyric(doc, n.id));
      if (first) setSelection(new Set([first.id]));
    },
    [selection, doc],
  );

  const setChordMode = useCallback(
    (enabled: boolean) => {
      setChordModeState(enabled);
      if (!enabled) return;
      setInputModeState(false);
      setLyricModeState(false);
      const current = [...selection][0];
      if (current && canHoldChord(doc, current)) return;
      const first = doc.notes.find((n) => canHoldChord(doc, n.id));
      if (first) setSelection(new Set([first.id]));
    },
    [selection, doc],
  );

  const enterChord = useCallback(
    (text: string, advance: boolean) => {
      const id = [...selection][0];
      if (!canEdit || !id) return;
      const result = setChord(doc, id, text);
      const next = advance ? stepChordNote(doc, id, 1) : null;
      if (!result.ok) {
        if (result.reason === 'unchanged') {
          if (next) setSelection(new Set([next]));
          return;
        }
        commit(result, false);
        return;
      }
      if (next) result.command.selectAfter = [next];
      commit(result, false);
    },
    [selection, canEdit, doc, commit],
  );

  const moveChord = useCallback(
    (delta: 1 | -1) => {
      const id = [...selection][0];
      const target = id ? stepChordNote(doc, id, delta) : null;
      if (target) setSelection(new Set([target]));
    },
    [selection, doc],
  );

  const pasteChordText = useCallback(
    (text: string) => {
      if (!canEdit) return;
      const current = [...selection][0];
      const start =
        current && canHoldChord(doc, current) ? current : doc.notes.find((n) => canHoldChord(doc, n.id))?.id;
      if (!start) return;
      const { result, placed, leftover } = pasteChords(doc, start, text);
      commit(result, false);
      if (!result.ok) return;
      toast.success(t('editor.toast.chordsPlaced', { count: placed }));
      if (leftover > 0) toast.warn(t('editor.toast.chordsLeft', { count: leftover }));
    },
    [canEdit, selection, doc, commit],
  );

  const applyMark = useCallback(
    (op: MarkOp) => {
      if (!canEdit || selection.size === 0) return;
      commit(runMark(doc, [...selection], op), false);
    },
    [canEdit, selection, doc, commit],
  );

  const transposeScore = useCallback(
    (semitones: number): boolean => {
      if (!canEdit) return false;
      const result = transposeDocument(doc, semitones);
      commit(result, false);
      return result.ok;
    },
    [canEdit, doc, commit],
  );

  const editMeasures = useCallback(
    (op: 'insertAfter' | 'insertBefore' | 'delete') => {
      if (!canEdit) return;
      const picked = [...selection].map((id) => doc.getInfo(id)).filter((n) => n !== undefined);
      const indexes = picked.map((n) => n.measureIndex);
      const first = indexes.length ? Math.min(...indexes) : doc.measureCount - 1;
      const last = indexes.length ? Math.max(...indexes) : doc.measureCount - 1;
      if (op === 'delete') {
        if (indexes.length === 0) {
          commit({ ok: false, reason: 'noMeasure' }, false);
          return;
        }
        commit(deleteMeasures(doc, first, last), false);
      } else if (op === 'insertAfter') commit(insertMeasure(doc, last, 'after'), false);
      else commit(insertMeasure(doc, first, 'before'), false);
    },
    [canEdit, selection, doc, commit],
  );

  const editStaves = useCallback(
    (op: 'addBass' | 'addG' | 'addF' | 'addTenor' | 'remove') => {
      if (!canEdit) return;
      const picked = [...selection][0] ? doc.getInfo([...selection][0]) : undefined;
      if (op === 'addBass') commit(addBassStaff(doc, picked?.partIndex ?? 0), false);
      else if (op === 'addG') commit(addPart(doc, 'G'), false);
      else if (op === 'addF') commit(addPart(doc, 'F'), false);
      else if (op === 'addTenor') commit(addPart(doc, 'G8b'), false);
      else if (!picked) commit({ ok: false, reason: 'noStaff' }, false);
      else commit(removeStaff(doc, picked.partIndex, picked.staff), false);
    },
    [canEdit, selection, doc, commit],
  );

  const editNotation = useCallback(
    (change: NotationChange) => {
      if (!canEdit) return;
      const info = readNotation(doc, [...selection]);
      if (!info) {
        commit({ ok: false, reason: 'noStaff' }, false);
        return;
      }
      commit(changeNotation(doc, info, change), false);
    },
    [canEdit, selection, doc, commit],
  );

  const editVoice = useCallback(
    (op: VoiceOp) => {
      if (!canEdit || selection.size === 0) return;
      const ids = [...selection];
      if (op === 'cue') commit(toggleCue(doc, ids), false);
      else if (op === 'remove') commit(removeVoice(doc, ids), false);
      else if (op === 'chordBelow') commit(addChordNote(doc, ids, -2), false);
      else if (op === 'chordAbove') commit(addChordNote(doc, ids, 2), false);
      else if (op === 'blank') commit(addHarmonyVoice(doc, ids, 0, true), false);
      else commit(addHarmonyVoice(doc, ids, op === 'addBelow' ? -2 : 2), false);
    },
    [canEdit, selection, doc, commit],
  );

  const enterLyric = useCallback(
    (text: string, end: LyricEnd | 'stay') => {
      const id = [...selection][0];
      if (!canEdit || !id) return;
      const result = setLyric(doc, id, text, end === 'stay' ? 'word' : end, lyricVerse);
      const next = end === 'stay' ? null : stepLyricNote(doc, id, 1);
      if (!result.ok) {
        // Không có gì để đổi: chỉ sang nốt kế
        if (result.reason === 'unchanged') {
          if (next) setSelection(new Set([next]));
          return;
        }
        commit(result, false);
        return;
      }
      if (next) result.command.selectAfter = [next];
      commit(result, false);
    },
    [selection, canEdit, doc, lyricVerse, commit],
  );

  const moveLyric = useCallback(
    (delta: 1 | -1) => {
      const id = [...selection][0];
      const target = id ? stepLyricNote(doc, id, delta) : null;
      if (target) setSelection(new Set([target]));
    },
    [selection, doc],
  );

  const pasteLyricsText = useCallback(
    (text: string) => {
      if (!canEdit) return;
      const current = [...selection][0];
      const start =
        current && canHoldLyric(doc, current) ? current : doc.notes.find((n) => canHoldLyric(doc, n.id))?.id;
      if (!start) return;
      const { result, report } = pasteLyrics(doc, start, text, lyricVerse);
      commit(result, false);
      if (!result.ok) return;
      toast.success(t('editor.toast.lyricsPlaced', { count: report.placed }));
      if (report.leftover > 0) toast.warn(t('editor.toast.lyricsLeft', { count: report.leftover }));
    },
    [canEdit, selection, doc, lyricVerse, commit],
  );

  const editHeader = useCallback(
    (field: HeaderField, text: string, style: TextStyle): boolean => {
      if (!canEdit) return false;
      const result = setHeaderText(doc, field, text, style);
      commit(result, false);
      return result.ok;
    },
    [canEdit, doc, commit],
  );

  const editTempo = useCallback(
    (info: TempoInfo): boolean => {
      if (!canEdit) return false;
      const result = setTempo(doc, info);
      commit(result, false);
      return result.ok;
    },
    [canEdit, doc, commit],
  );

  const editTuplet = useCallback(
    (op: TupletOp) => {
      if (!canEdit) return;
      const target = doc.notes.find((n) => selection.has(n.id));
      if (!target) {
        commit({ ok: false, reason: 'noMeasure' }, false);
        return;
      }
      const result =
        op.kind === 'make' ? makeTuplet(doc, target.id, op.actual, op.normal) : removeTuplet(doc, target.id);
      commit(result, false);
      if (!result.ok || op.kind !== 'make') return;
      // Chùm mới toàn dấu lặng: đặt trường độ nhập bằng hình nốt của chùm để gõ A–G là điền nốt vào chùm luôn
      const first = doc.getInfo(result.command.selectAfter?.[0] ?? '');
      const type = first?.element.querySelector(':scope > type')?.textContent?.trim() ?? '';
      if (first && type in DURATION_QUARTERS) {
        setInputDuration({ type: type as DurationType, dots: dotCount(first.element) });
        flash(t('editor.flash.tupletInput', { name: tupletName(op), duration: durationLabel(type as DurationType) }));
      }
    },
    [canEdit, selection, doc, commit, flash],
  );

  const insertNoteAt = useCallback(
    (target: InsertTarget, choice: DurationChoice, accidental: AccidentalChoice): boolean => {
      if (!canEdit) return false;
      const result = insertNote(doc, target, choice, accidental);
      commit(result, true);
      if (result.ok) setInputDuration(choice);
      return result.ok;
    },
    [canEdit, doc, commit],
  );

  const applySymbol = useCallback(
    (op: SymbolOp) => {
      if (!canEdit || selection.size === 0) return;
      const ids = [...selection];
      if (op === 'tie') commit(toggleTie(doc, ids), false);
      else if (op === 'slur') commit(toggleSlur(doc, ids), false);
      else if (op === 'rest' || op === 'delete') commit(removeNotes(doc, ids, op), false);
      else commit(setAlteration(doc, ids, op), true);
    },
    [canEdit, selection, doc, commit],
  );

  const applyPitch = useCallback((op: PitchOp) => runPitch([...selection], op, 1), [runPitch, selection]);

  const dragPitch = useCallback(
    (ids: readonly string[], steps: number) => {
      if (!canEdit || steps === 0) return;
      const inSelection = ids.some((id) => selection.has(id));
      if (!inSelection) setSelection(new Set(ids));
      runPitch(inSelection ? [...selection] : ids, steps > 0 ? 'stepUp' : 'stepDown', Math.abs(steps));
    },
    [canEdit, selection, runPitch],
  );

  const selectInChord = useCallback(
    (delta: 1 | -1) => {
      const first = [...selection].map((id) => doc.getInfo(id)).find((n) => n !== undefined);
      if (!first) return;
      const members = doc.notes
        .filter(
          (n) =>
            n.partIndex === first.partIndex &&
            n.measureIndex === first.measureIndex &&
            n.staff === first.staff &&
            n.voice === first.voice &&
            n.entryIndex === first.entryIndex &&
            !n.isRest,
        )
        .sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0));
      if (members.length < 2) return;
      const wholeChord = selection.size > 1;
      const current = members.findIndex((n) => selection.has(n.id));
      const index = wholeChord
        ? delta > 0
          ? members.length - 1
          : 0
        : Math.min(members.length - 1, Math.max(0, current + delta));
      setSelection(new Set([members[index].id]));
    },
    [doc, selection],
  );

  const undo = useCallback(() => {
    if (!canEdit || !historyRef.current.canUndo || heldByOther(historyRef.current.nextUndo)) return;
    const label = historyRef.current.undoLabel;
    const command = historyRef.current.undo(doc);
    if (command) liveRef.current?.session?.enqueue(command, 'undo');
    sync();
    setSelection((prev) => new Set([...prev].filter((id) => doc.getInfo(id) !== undefined)));
    flash(t('editor.flash.undone', { label }));
  }, [canEdit, doc, sync, flash, heldByOther]);

  const redo = useCallback(() => {
    if (!canEdit || !historyRef.current.canRedo || heldByOther(historyRef.current.nextRedo)) return;
    const label = historyRef.current.redoLabel;
    const command = historyRef.current.redo(doc);
    if (command) liveRef.current?.session?.enqueue(command, 'redo');
    sync();
    setSelection((prev) => new Set([...prev].filter((id) => doc.getInfo(id) !== undefined)));
    flash(t('editor.flash.redone', { label }));
  }, [canEdit, doc, sync, flash, heldByOther]);

  const save = useCallback(
    async (force = false) => {
      if (!canEdit || savingRef.current) return;
      const liveSessionNow = liveRef.current?.session;
      if (liveSessionNow) {
        // Đồng chỉnh sửa: máy chủ giữ bản nhạc chung, Lưu chỉ yêu cầu chốt thành một phiên bản
        liveSessionNow.save();
        flash(t('live.notice.saving'));
        return;
      }
      if (!force && !historyRef.current.dirty) {
        flash(t('editor.flash.nothingToSave'));
        return;
      }
      if (mode === 'suggest') {
        onSuggest?.(doc.serialize());
        return;
      }
      savingRef.current = true;
      setSaving(true);
      const position = historyRef.current.position;
      try {
        const result = await saveMusicXml(scoreId, doc.serialize(), version, force);
        historyRef.current.markSaved(position);
        clearDraft(scoreId, version, draftPrefix);
        purgeOtherDrafts(scoreId, result.version, draftPrefix);
        setVersion(result.version);
        setConflict(null);
        setFlags({
          dirty: historyRef.current.dirty,
          canUndo: historyRef.current.canUndo,
          canRedo: historyRef.current.canRedo,
        });
        toast.success(t('editor.toast.saved', { version: result.version }));
      } catch (err) {
        const latest = getConflictVersion(err);
        if (latest !== undefined) setConflict({ latestVersion: latest });
        else if (!reportPlanLimit(err)) toast.error(getSaveErrorMessage(err));
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [canEdit, doc, scoreId, version, flash, mode, onSuggest, draftPrefix],
  );

  const finishSuggestion = useCallback(() => {
    historyRef.current.markSaved(historyRef.current.position);
    clearDraft(scoreId, version, draftPrefix);
    setFlags({
      dirty: historyRef.current.dirty,
      canUndo: historyRef.current.canUndo,
      canRedo: historyRef.current.canRedo,
    });
  }, [scoreId, version, draftPrefix]);

  const overwrite = useCallback(async () => {
    if (!canForce) return;
    await save(true);
  }, [canForce, save]);

  const reloadLatest = useCallback(() => {
    clearDraft(scoreId, version, draftPrefix);
    allowLeaveRef.current = true;
    window.location.reload();
  }, [scoreId, version, draftPrefix]);

  /**
   * Khôi phục một phiên bản cũ từ bảng lịch sử: BE lưu nó thành phiên bản mới, sau đó tải lại nội dung vào tài liệu
   * đang mở, xóa lịch sử hoàn tác và bản nháp. Lệch phiên bản (2014) thì mở hộp thoại xung đột sẵn có.
   * Trả về true nếu khôi phục xong.
   */
  const restoreVersion = useCallback(
    async (target: number): Promise<boolean> => {
      if (!canEdit || savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      try {
        const result = await versionApi.restore(scoreId, target, version);
        try {
          const fetched = await fetchMusicXmlWithVersion(scoreId);
          doc.restore(fetched.xml);
        } catch {
          toast.warn(t('editor.toast.restoredNoReload', { version: result.version }));
          return false;
        }
        historyRef.current.clear();
        clearDraft(scoreId, version, draftPrefix);
        purgeOtherDrafts(scoreId, result.version, draftPrefix);
        setVersion(result.version);
        setConflict(null);
        setSelection(new Set());
        sync();
        toast.success(t('editor.toast.restored', { from: target, version: result.version }));
        return true;
      } catch (err) {
        const latest = getConflictVersion(err);
        if (latest !== undefined) setConflict({ latestVersion: latest });
        else toast.error(getVersionErrorMessage(err));
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [canEdit, doc, scoreId, version, sync, draftPrefix],
  );

  const downloadMine = useCallback(() => {
    const blob = new Blob([doc.serialize()], { type: 'application/vnd.recordare.musicxml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[\\/:*?"<>|]/g, '_') || 'ban-nhac'}.musicxml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [doc, title]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  const restoreDraft = useCallback(() => {
    if (!draft) return;
    try {
      doc.restore(draft.xml);
      historyRef.current.clear();
      historyRef.current.markUnsaved();
      setSelection(new Set());
      sync();
      toast.success(t('editor.toast.draftRestored'));
    } catch {
      toast.error(t('editor.toast.draftBroken'));
      clearDraft(scoreId, version);
      toast.error('Bản nháp bị hỏng nên không khôi phục được');
      clearDraft(scoreId, version, draftPrefix);
    }
    setDraft(null);
  }, [draft, doc, sync, scoreId, version, draftPrefix]);

  const discardDraft = useCallback(() => {
    clearDraft(scoreId, version, draftPrefix);
    setDraft(null);
  }, [scoreId, version, draftPrefix]);

  const confirmLeave = useCallback(
    async () =>
      !(liveRef.current?.active ? liveRef.current.state.pending > 0 : historyRef.current.dirty) ||
      confirmDialog(leaveDialogOptions()),
    [confirmDialog],
  );

  // Tự lưu nháp mỗi 30 giây khi có thay đổi chưa lưu
  useEffect(() => {
    if (!canEdit || !flags.dirty || liveActive) return;
    const timer = window.setInterval(() => {
      if (!saveDraft(scoreId, version, doc.serialize(), draftPrefix) && !draftWarnedRef.current) {
        draftWarnedRef.current = true;
        toast.warn(t('editor.toast.draftFull'));
      }
    }, DRAFT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [canEdit, flags.dirty, liveActive, scoreId, version, doc, draftPrefix]);

  // Rời hoặc đóng tab khi chưa lưu: lưu nháp ngay và hỏi xác nhận
  useEffect(() => {
    if (!canEdit || !(liveActive ? (live?.state.pending ?? 0) > 0 : flags.dirty)) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowLeaveRef.current) return;
      if (!liveActive) saveDraft(scoreId, version, doc.serialize(), draftPrefix);
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [canEdit, flags.dirty, liveActive, live?.state.pending, scoreId, version, doc, draftPrefix]);

  // Nút Back của trình duyệt khi chưa lưu: thêm một mục lịch sử đệm để chặn và hỏi xác nhận
  const livePending = live?.state.pending ?? 0;
  const hasUnsent = liveActive ? livePending > 0 : flags.dirty;
  useEffect(() => {
    if (!canEdit || !hasUnsent) return;
    window.history.pushState(null, '', window.location.href);
    const onPopState = async () => {
      if (allowLeaveRef.current) return;
      const leave = await confirmDialog(leaveDialogOptions());
      if (leave) {
        allowLeaveRef.current = true;
        window.history.go(-1);
      } else {
        window.history.pushState(null, '', window.location.href);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [canEdit, hasUnsent, confirmDialog]);

  // Phím tắt
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (blocked || conflict || draft) return;
      // Có hộp thoại đang mở (lịch sử phiên bản, xuất file...): phím thuộc về hộp thoại, không sửa bản nhạc phía sau
      if (document.querySelector('.sc-modal-overlay')) return;
      const target = e.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        void save();
      } else if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && !e.shiftKey && !e.altKey && e.key === '3') {
        e.preventDefault();
        editTuplet({ kind: 'make', actual: 3, normal: 2 });
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && selection.size > 0) {
        e.preventDefault();
        const up = e.key === 'ArrowUp';
        if (mod) applyPitch(up ? 'octaveUp' : 'octaveDown');
        else if (e.altKey) applyPitch(up ? 'semitoneUp' : 'semitoneDown');
        else applyPitch(up ? 'stepUp' : 'stepDown');
      } else if ((e.key === '[' || e.key === ']') && selection.size > 0) {
        e.preventDefault();
        selectInChord(e.key === ']' ? 1 : -1);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size > 0) {
        e.preventDefault();
        applySymbol('delete');
      } else if (!mod && !e.altKey && (key === 't' || key === 's') && selection.size > 0) {
        e.preventDefault();
        applySymbol(key === 't' ? 'tie' : 'slur');
      } else if (!mod && !e.altKey && /^[1-7]$/.test(e.key)) {
        chooseDuration(DIGIT_DURATIONS[e.key]);
      } else if (!mod && !e.altKey && e.key === '.') {
        toggleDot();
      } else if (inputMode && !mod && !e.altKey && isLetterKey(e.key) && selection.size > 0) {
        e.preventDefault();
        enterLetter(e.key);
      } else if (e.key === 'Escape' && chordMode) {
        setChordMode(false);
      } else if (e.key === 'Escape' && lyricMode) {
        setLyricMode(false);
      } else if (e.key === 'Escape' && inputMode) {
        setInputMode(false);
      } else if (e.key === 'Escape' && selection.size > 0) {
        clearSelection();
      } else if (e.key === 'Tab' && !mod && !e.altKey) {
        // Chỉ chiếm phím Tab khi đang ở vùng bản nhạc, để vẫn đi qua các nút bằng bàn phím được
        const inCanvas = target === document.body || !!target?.closest('.sv-canvas');
        if (!inCanvas) return;
        e.preventDefault();
        selectRelative(e.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    chordMode,
    setChordMode,
    lyricMode,
    setLyricMode,
    setInputMode,
    canEdit,
    blocked,
    conflict,
    draft,
    selection,
    save,
    undo,
    redo,
    applyPitch,
    clearSelection,
    selectRelative,
    selectInChord,
    applySymbol,
    chooseDuration,
    toggleDot,
    enterLetter,
    editTuplet,
    inputMode,
  ]);

  return {
    selection,
    revision,
    dirty: liveActive ? (live?.state.pending ?? 0) > 0 : flags.dirty,
    saving,
    version,
    canUndo: flags.canUndo,
    canRedo: flags.canRedo,
    issues,
    statusText,
    notice,
    previewTone,
    setPreviewTone,
    conflict,
    draft,
    select,
    clearSelection,
    applyPitch,
    applySymbol,
    inputMode,
    setInputMode,
    chordMode,
    setChordMode,
    enterChord,
    moveChord,
    pasteChordText,
    applyMark,
    editMeasures,
    transposeScore,
    editStaves,
    editNotation,
    editVoice,
    editTuplet,
    lyricMode,
    setLyricMode,
    lyricVerse,
    setLyricVerse,
    enterLyric,
    moveLyric,
    pasteLyricsText,
    editHeader,
    editTempo,
    inputDuration,
    chooseDuration,
    toggleDot,
    enterLetter,
    insertNoteAt,
    confirmMeasureOk,
    dragPitch,
    selectInChord,
    undo,
    redo,
    save,
    finishSuggestion,
    restoreDraft,
    discardDraft,
    reloadLatest,
    overwrite,
    restoreVersion,
    downloadMine,
    dismissConflict,
    confirmLeave,
  };
}
