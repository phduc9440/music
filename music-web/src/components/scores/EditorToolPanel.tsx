import type { ReactNode } from 'react';
import type { SymbolOp } from '../../editor/commands';
import type { DurationChoice, DurationType } from '../../editor/durations';
import type { PitchOp } from '../../editor/pitch';
import { DURATION_DRAG_TYPE } from '../../editor/staffHit';
import {
  ToolDelete,
  ToolDot,
  ToolEighth,
  ToolFlat,
  ToolHalf,
  ToolNatural,
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
  /** "Giữ ô nhịp đủ phách": đổi trường độ nhưng lấp dấu lặng / ghi đè nốt sau để ô không đổi độ dài. */
  keepMeasure: boolean;
  onKeepMeasureChange: (enabled: boolean) => void;
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
  { op: 'rest', icon: <ToolRest />, label: 'Dấu lặng' },
  { op: 'delete', icon: <ToolDelete />, label: 'Xóa', shortcut: 'Delete' },
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
  keepMeasure,
  onKeepMeasureChange,
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
              className={`sv-tool${inputMode ? '' : ' is-active'}`}
              aria-pressed={!inputMode}
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
          <label
            className="sv-tools__check"
            title="Bật: nốt ngắn đi thì lấp dấu lặng, nốt dài ra thì ghi đè nốt sau, ô nhịp giữ nguyên độ dài. Tắt: đổi đúng trường độ đã chọn."
          >
            <input type="checkbox" checked={keepMeasure} onChange={(e) => onKeepMeasureChange(e.target.checked)} />
            Giữ ô nhịp đủ phách
          </label>
        </div>
      </aside>
    </>
  );
}
