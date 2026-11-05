import type { ReactNode } from 'react';
import type { SymbolOp } from '../../editor/commands';
import { DYNAMICS } from '../../editor/marks';
import type { MarkOp } from '../../editor/marks';
import type { DurationChoice, DurationType } from '../../editor/durations';
import type { PitchOp } from '../../editor/pitch';
import { DURATION_DRAG_TYPE } from '../../editor/staffHit';
import {
  ToolDelete,
  ToolDot,
  ToolEighth,
  ToolFlat,
  ToolHalf,
  ToolChord,
  ToolLyric,
  ToolNatural,
  ToolSlur,
  ToolTie,
  ToolOctaveDown,
  ToolOctaveUp,
  ToolPencil,
  ToolQuarter,
  ToolRest,
  ToolSelect,
  ToolSemitoneDown,
  ToolSemitoneUp,
  ToolSharp,
  ToolSixteenth,
  ToolStepDown,
  ToolStepUp,
  ToolWhole,
} from './ToolIcons';
import { IconRedo, IconSave, IconUndo } from './ViewerIcons';

interface Props {
  /** Chỉ dùng cho Mobile: bảng công cụ đang mở dạng bottom sheet. */
  open: boolean;
  onClose: () => void;
  /** Có đang chọn ít nhất một nốt không (các nút Cao độ chỉ bật khi có). */
  hasSelection: boolean;
  /** Đang lưu: tạm khóa nút sửa. */
  busy: boolean;
  onPitch: (op: PitchOp) => void;
  onSymbol: (op: SymbolOp) => void;
  /** Chế độ nhập nốt (bấm phím A–G để nhập) và trường độ đang dùng. */
  inputMode: boolean;
  onInputModeChange: (enabled: boolean) => void;
  inputDuration: DurationChoice;
  /** Chế độ nhập lời bài hát. */
  lyricMode: boolean;
  onLyricModeChange: (enabled: boolean) => void;
  /** Chế độ nhập hợp âm. */
  chordMode: boolean;
  onChordModeChange: (enabled: boolean) => void;
  /** Ký hiệu sắc thái, lặp lại và chỉ dẫn nhảy. */
  onMark: (op: MarkOp) => void;
  /** Thêm / xóa ô nhịp. */
  onMeasures: (op: 'insertAfter' | 'insertBefore' | 'delete') => void;
  /** Viết bè, nốt nhỏ, xóa bè. */
  onVoice: (op: 'addBelow' | 'addAbove' | 'cue' | 'remove') => void;
  /** "Giữ ô nhịp đủ phách": đổi trường độ nhưng lấp dấu lặng / ghi đè nốt sau để ô không đổi độ dài. */
  onDuration: (type: DurationType) => void;
  onDot: () => void;
  /** "Nghe khi sửa": phát âm xem trước mỗi khi đổi cao độ. */
  previewTone: boolean;
  onPreviewToneChange: (enabled: boolean) => void;
  /** Hoàn tác / làm lại / lưu: chỉ hiện trong bottom sheet trên Mobile (Desktop và iPad có ở thanh trên). */
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
}

interface PitchTool {
  op: PitchOp;
  icon: ReactNode;
  label: string;
  /** Phím tắt hiện trong tooltip. */
  shortcut: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';
const ALT = isMac ? '⌥' : 'Alt';

const PITCH_TOOLS: PitchTool[] = [
  { op: 'stepUp', icon: <ToolStepUp />, label: 'Lên bậc', shortcut: '↑' },
  { op: 'stepDown', icon: <ToolStepDown />, label: 'Xuống bậc', shortcut: '↓' },
  { op: 'semitoneUp', icon: <ToolSemitoneUp />, label: 'Lên ½ cung', shortcut: `${ALT}+↑` },
  { op: 'semitoneDown', icon: <ToolSemitoneDown />, label: 'Xuống ½ cung', shortcut: `${ALT}+↓` },
  { op: 'octaveUp', icon: <ToolOctaveUp />, label: 'Lên quãng 8', shortcut: `${MOD}+↑` },
  { op: 'octaveDown', icon: <ToolOctaveDown />, label: 'Xuống quãng 8', shortcut: `${MOD}+↓` },
];

interface SymbolTool {
  op: SymbolOp;
  icon: ReactNode;
  label: string;
  /** Phím tắt hiện trong tooltip (nếu có). */
  shortcut?: string;
}

const SYMBOL_TOOLS: SymbolTool[] = [
  { op: 'sharp', icon: <ToolSharp />, label: 'Thăng' },
  { op: 'flat', icon: <ToolFlat />, label: 'Giáng' },
  { op: 'natural', icon: <ToolNatural />, label: 'Bình' },
  { op: 'tie', icon: <ToolTie />, label: 'Nối', shortcut: 'T' },
  { op: 'slur', icon: <ToolSlur />, label: 'Luyến', shortcut: 'S' },
  { op: 'rest', icon: <ToolRest />, label: 'Dấu lặng' },
  { op: 'delete', icon: <ToolDelete />, label: 'Xóa', shortcut: 'Delete' },
];

const MARK_TOOLS: { op: MarkOp; label: string; title: string }[] = [
  { op: 'staccato', label: 'Staccato', title: 'Staccato: ngắt, gọn (bấm lại để bỏ)' },
  { op: 'accent', label: 'Accent', title: 'Accent: nhấn nốt (bấm lại để bỏ)' },
  { op: 'tenuto', label: 'Tenuto', title: 'Tenuto: giữ đủ độ dài (bấm lại để bỏ)' },
  { op: 'fermata', label: 'Fermata', title: 'Fermata: ngân tự do (bấm lại để bỏ)' },
  { op: 'cresc', label: 'Cresc.', title: 'Cresc.: to dần, từ nốt đầu đến nốt cuối của vùng chọn' },
  { op: 'dim', label: 'Dim.', title: 'Dim.: nhỏ dần, từ nốt đầu đến nốt cuối của vùng chọn' },
];

const REPEAT_TOOLS: { op: MarkOp; label: string; title: string }[] = [
  { op: 'repeatStart', label: '|:', title: 'Dấu lặp ở đầu ô nhịp (ô đầu của vùng chọn)' },
  { op: 'repeatEnd', label: ':|', title: 'Dấu lặp ở cuối ô nhịp (ô cuối của vùng chọn)' },
  { op: 'volta1', label: 'Nhà 1', title: 'Nhà 1 (1.) trải qua các ô của vùng chọn, đóng bằng dấu lặp' },
  {
    op: 'volta2',
    label: 'Nhà 2',
    title: 'Nhà 2 (2.) trải qua các ô của vùng chọn: dùng khi lần hát sau (lời 2) khác đoạn cuối',
  },
  { op: 'segno', label: 'Segno', title: 'Dấu Segno ở ô đầu của vùng chọn' },
  { op: 'coda', label: 'Coda', title: 'Dấu Coda ở ô đầu của vùng chọn' },
  { op: 'dc', label: 'D.C.', title: 'D.C.: quay lại từ đầu (ở cuối ô cuối của vùng chọn)' },
  { op: 'ds', label: 'D.S.', title: 'D.S.: quay lại dấu Segno' },
  { op: 'fine', label: 'Fine', title: 'Fine: kết thúc' },
  { op: 'tocoda', label: 'To Coda', title: 'To Coda: nhảy tới Coda' },
];

const DURATION_TOOLS: { type: DurationType; icon: ReactNode; label: string; key: string }[] = [
  { type: 'whole', icon: <ToolWhole />, label: 'Tròn', key: '5' },
  { type: 'half', icon: <ToolHalf />, label: 'Trắng', key: '4' },
  { type: 'quarter', icon: <ToolQuarter />, label: 'Đen', key: '3' },
  { type: 'eighth', icon: <ToolEighth />, label: 'Móc đơn', key: '2' },
  { type: '16th', icon: <ToolSixteenth />, label: 'Móc kép', key: '1' },
];

/**
 * Bảng công cụ chỉnh sửa (đặc tả 1.17): Desktop ở bên trái, iPad thu thành thanh dưới đáy, Mobile mở dạng
 * bottom sheet. Mobile chỉ có nhóm Cao độ (đặc tả 1.18). Chỉ hiện khi canEdit.
 */
export default function EditorToolPanel({
  open,
  onClose,
  hasSelection,
  busy,
  onPitch,
  onSymbol,
  inputMode,
  onInputModeChange,
  inputDuration,
  lyricMode,
  onLyricModeChange,
  chordMode,
  onChordModeChange,
  onMark,
  onMeasures,
  onVoice,
  onDuration,
  onDot,
  previewTone,
  onPreviewToneChange,
  canUndo,
  canRedo,
  canSave,
  onUndo,
  onRedo,
  onSave,
}: Props) {
  return (
    <>
      {open && <div className="sv-sheet-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={`sv-tools${open ? ' is-open' : ''}`} aria-label="Công cụ chỉnh sửa">
        <div className="sv-tools__head">
          <strong>Công cụ chỉnh sửa</strong>
          <button className="sc-btn sv-tools__close" onClick={onClose}>
            Đóng
          </button>
        </div>
        <p className="sv-tools__note">
          Bấm vào nốt để chọn (Shift để chọn thêm), rồi dùng nhóm Cao độ hoặc phím mũi tên.
        </p>

        <div className="sv-tools__group sv-tools__group--mode">
          <div className="sv-tools__title">Chế độ</div>
          <div className="sv-tools__row">
            <button
              className={`sv-tool${inputMode || lyricMode || chordMode ? '' : ' is-active'}`}
              aria-pressed={!inputMode && !lyricMode && !chordMode}
              onClick={() => onInputModeChange(false)}
              title="Chọn nốt"
              aria-label="Chọn"
            >
              <span className="sv-tool__icon" aria-hidden="true">
                <ToolSelect />
              </span>
              <span className="sv-tool__label">Chọn</span>
            </button>
            <button
              className={`sv-tool${inputMode ? ' is-active' : ''}`}
              aria-pressed={inputMode}
              onClick={() => onInputModeChange(true)}
              title="Nhập nốt: chọn dấu lặng rồi bấm phím A–G (Esc để thoát)"
              aria-label="Nhập nốt"
            >
              <span className="sv-tool__icon" aria-hidden="true">
                <ToolPencil />
              </span>
              <span className="sv-tool__label">Nhập nốt</span>
            </button>
            <button
              className={`sv-tool${lyricMode ? ' is-active' : ''}`}
              aria-pressed={lyricMode}
              onClick={() => onLyricModeChange(true)}
              title="Nhập lời bài hát: chọn nốt rồi gõ âm tiết, Space sang nốt kế (Esc để thoát)"
              aria-label="Nhập lời"
            >
              <span className="sv-tool__icon" aria-hidden="true">
                <ToolLyric />
              </span>
              <span className="sv-tool__label">Lời</span>
            </button>
            <button
              className={`sv-tool${chordMode ? ' is-active' : ''}`}
              aria-pressed={chordMode}
              onClick={() => onChordModeChange(true)}
              title="Nhập hợp âm: chọn nốt rồi gõ Am7, C/G... (Esc để thoát)"
              aria-label="Nhập hợp âm"
            >
              <span className="sv-tool__icon" aria-hidden="true">
                <ToolChord />
              </span>
              <span className="sv-tool__label">Hợp âm</span>
            </button>
          </div>
        </div>

        <div className="sv-tools__group sv-tools__group--pitch">
          <div className="sv-tools__title">Cao độ</div>
          <div className="sv-tools__row">
            {PITCH_TOOLS.map((tool) => (
              <button
                key={tool.op}
                className="sv-tool"
                disabled={!hasSelection || busy}
                onClick={() => onPitch(tool.op)}
                title={`${tool.label} (${tool.shortcut})${hasSelection ? '' : ' - hãy chọn nốt trước'}`}
                aria-label={tool.label}
              >
                <span className="sv-tool__icon" aria-hidden="true">
                  {tool.icon}
                </span>
                <span className="sv-tool__label">{tool.label}</span>
              </button>
            ))}
          </div>
          <label className="sv-tools__check">
            <input type="checkbox" checked={previewTone} onChange={(e) => onPreviewToneChange(e.target.checked)} />
            Nghe khi sửa
          </label>
        </div>

        <div className="sv-tools__group sv-tools__group--actions">
          <div className="sv-tools__title">Thao tác</div>
          <div className="sv-tools__actions">
            <button className="sc-btn" disabled={!canUndo || busy} onClick={onUndo}>
              <IconUndo /> Hoàn tác
            </button>
            <button className="sc-btn" disabled={!canRedo || busy} onClick={onRedo}>
              <IconRedo /> Làm lại
            </button>
            <button className="sc-btn sc-btn--primary" disabled={!canSave || busy} onClick={onSave}>
              <IconSave /> Lưu
            </button>
          </div>
        </div>

        <div className="sv-tools__group sv-tools__group--soon">
          <div className="sv-tools__title">Ký hiệu</div>
          <div className="sv-tools__row">
            {SYMBOL_TOOLS.map((tool) => (
              <button
                key={tool.op}
                className="sv-tool"
                disabled={!hasSelection || busy}
                onClick={() => onSymbol(tool.op)}
                title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}${hasSelection ? '' : ' - hãy chọn nốt trước'}`}
                aria-label={tool.label}
              >
                <span className="sv-tool__icon" aria-hidden="true">
                  {tool.icon}
                </span>
                <span className="sv-tool__label">{tool.label}</span>
              </button>
            ))}
            <button
              className={`sv-tool${inputMode && inputDuration.dotted ? ' is-active' : ''}`}
              disabled={(!hasSelection && !inputMode) || busy}
              aria-pressed={inputMode ? inputDuration.dotted : undefined}
              onClick={onDot}
              title="Chấm dôi (.)"
              aria-label="Chấm dôi"
            >
              <span className="sv-tool__icon" aria-hidden="true">
                <ToolDot />
              </span>
              <span className="sv-tool__label">Chấm dôi</span>
            </button>
          </div>
        </div>

        <div className="sv-tools__group sv-tools__group--soon">
          <div className="sv-tools__title">Ô nhịp</div>
          <div className="sv-tools__row sv-tools__row--text">
            <button
              className="sv-tool sv-tool--text"
              disabled={busy}
              onClick={() => onMeasures('insertAfter')}
              title="Thêm một ô nhịp trống sau ô đang chọn (không chọn gì: thêm vào cuối bài)"
            >
              Thêm ô sau
            </button>
            <button
              className="sv-tool sv-tool--text"
              disabled={!hasSelection || busy}
              onClick={() => onMeasures('insertBefore')}
              title="Chèn một ô nhịp trống trước ô đang chọn"
            >
              Chèn ô trước
            </button>
            <button
              className="sv-tool sv-tool--text"
              disabled={!hasSelection || busy}
              onClick={() => onMeasures('delete')}
              title="Xóa các ô nhịp có nốt đang chọn (bấm Hoàn tác nếu lỡ tay)"
            >
              Xóa ô nhịp
            </button>
          </div>
        </div>

        <div className="sv-tools__group sv-tools__group--soon">
          <div className="sv-tools__title">Viết bè</div>
          <div className="sv-tools__row sv-tools__row--text">
            <button
              className="sv-tool sv-tool--text"
              disabled={!hasSelection || busy}
              onClick={() => onVoice('addBelow')}
              title="Sao các nốt đang chọn sang một bè mới cùng trường độ, nốt nhỏ, thấp hơn một quãng ba (sau đó chỉnh cao độ tùy ý)"
            >
              Bè dưới
            </button>
            <button
              className="sv-tool sv-tool--text"
              disabled={!hasSelection || busy}
              onClick={() => onVoice('addAbove')}
              title="Như trên nhưng bè cao hơn một quãng ba"
            >
              Bè trên
            </button>
            <button
              className="sv-tool sv-tool--text"
              disabled={!hasSelection || busy}
              onClick={() => onVoice('cue')}
              title="Bật/tắt hình nốt nhỏ cho các nốt đang chọn"
            >
              Nốt nhỏ
            </button>
            <button
              className="sv-tool sv-tool--text"
              disabled={!hasSelection || busy}
              onClick={() => onVoice('remove')}
              title="Xóa bè phụ chứa nốt đang chọn (chỉ trong ô nhịp đang chọn)"
            >
              Xóa bè
            </button>
          </div>
        </div>

        <div className="sv-tools__group sv-tools__group--soon">
          <div className="sv-tools__title">Sắc thái</div>
          <div className="sv-tools__row sv-tools__row--text">
            {MARK_TOOLS.map((tool) => (
              <button
                key={tool.op}
                className="sv-tool sv-tool--text"
                disabled={!hasSelection || busy}
                onClick={() => onMark(tool.op)}
                title={`${tool.title}${hasSelection ? '' : ' - hãy chọn nốt trước'}`}
              >
                {tool.label}
              </button>
            ))}
            {DYNAMICS.map((d) => (
              <button
                key={d}
                className="sv-tool sv-tool--text sv-tool--dyn"
                disabled={!hasSelection || busy}
                onClick={() => onMark(`dyn:${d}`)}
                title={`Mức to nhỏ ${d} (đặt ở nốt đầu của vùng chọn)`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="sv-tools__group sv-tools__group--soon">
          <div className="sv-tools__title">Lặp lại &amp; chỉ dẫn</div>
          <div className="sv-tools__row sv-tools__row--text">
            {REPEAT_TOOLS.map((tool) => (
              <button
                key={tool.op}
                className="sv-tool sv-tool--text"
                disabled={!hasSelection || busy}
                onClick={() => onMark(tool.op)}
                title={`${tool.title}${hasSelection ? '' : ' - hãy chọn nốt trước'}`}
              >
                {tool.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sv-tools__group sv-tools__group--soon">
          <div className="sv-tools__title">Trường độ</div>
          <div className="sv-tools__row">
            {DURATION_TOOLS.map((tool) => (
              <button
                key={tool.type}
                className={`sv-tool${inputMode && inputDuration.type === tool.type ? ' is-active' : ''}`}
                disabled={busy}
                draggable={!busy}
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    DURATION_DRAG_TYPE,
                    JSON.stringify({ type: tool.type, dotted: inputDuration.dotted }),
                  );
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                aria-pressed={inputMode ? inputDuration.type === tool.type : undefined}
                onClick={() => onDuration(tool.type)}
                title={`${tool.label} (${tool.key}) · bấm: đổi trường độ nốt đang chọn · kéo vào khuông: thêm nốt`}
                aria-label={tool.label}
              >
                <span className="sv-tool__icon" aria-hidden="true">
                  {tool.icon}
                </span>
                <span className="sv-tool__label">{tool.label}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}
