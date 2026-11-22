import type { Dispatch, SetStateAction } from 'react';
import type { EditResult, SymbolOp } from './commands';
import type { AccidentalChoice, DurationChoice, DurationType, InsertTarget } from '../notes/durations';
import type { Draft } from './draft';
import type { LiveCollab } from '../live/useLiveCollab';
import type { HeaderField, TextStyle } from '../structure/header';
import type { LyricEnd } from '../notation/lyrics';
import type { MarkOp } from '../notation/marks';
import type { VoiceOp } from '../notes/voices';
import type { NotationChange } from '../structure/staves';
import type { TupletOp } from '../notes/tuplets';
import type { TempoInfo } from '../structure/tempo';
import type { MeasureIssue } from '../structure/measureCheck';
import type { PitchOp } from '../notes/pitch';
import type { ScoreDocument } from './ScoreDocument';

/** Thông báo ngắn; `key` đổi mỗi lần để giao diện chạy lại hiệu ứng rung. */
export interface Notice {
  text: string;
  key: number;
}

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
  /** Áp ký hiệu lên đúng các nốt `ids` (menu chuột phải), không phụ thuộc vùng chọn hiện tại. */
  applySymbolTo: (ids: readonly string[], op: SymbolOp) => void;
  /** Gỡ riêng một ký hiệu (dấu thể hiện, dấu luyến, lời, hợp âm, sắc thái...) khỏi nốt `id`. */
  removeAttachment: (id: string, key: string) => void;
  /** Chọn mọi nốt của một ô nhịp (mọi khuông). */
  selectMeasure: (measureIndex: number) => void;
  /** Chọn cả bản nhạc (Ctrl/Cmd + A). */
  selectAll: () => void;
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

/** Phần dùng chung mà các hook con của Editor cần: tài liệu, quyền sửa, vùng chọn, chạy lệnh và báo nhanh. */
export interface EditorCore {
  doc: ScoreDocument;
  canEdit: boolean;
  selection: ReadonlySet<string>;
  setSelection: Dispatch<SetStateAction<ReadonlySet<string>>>;
  /** Chạy một lệnh sửa: thành công thì ghi lịch sử và gửi cho phiên cùng sửa; `preview` = phát âm xem trước. */
  commit: (result: EditResult, preview: boolean) => void;
  flash: (text: string) => void;
}
