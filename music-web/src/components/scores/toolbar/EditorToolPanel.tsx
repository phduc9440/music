import { Fragment, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { SymbolOp } from '../../editor/core/commands';
import { DYNAMICS, EXTRA_DYNAMICS } from '../../editor/notation/marks';
import type { MarkOp } from '../../editor/notation/marks';
import { TUPLET_PRESETS, tupletPresetLabel } from '../../editor/notes/tuplets';
import type { TupletOp } from '../../editor/notes/tuplets';
import type { VoiceOp } from '../../editor/notes/voices';
import type { DurationChoice, DurationType } from '../../editor/notes/durations';
import type { PitchOp } from '../../editor/notes/pitch';
import { DURATION_DRAG_TYPE } from '../../editor/core/staffHit';
import { hasKey, t } from '../../../i18n/core';
import { useMediaQuery } from '../../player/hooks/useMediaQuery';
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
  ToolSixtyFourth,
  ToolStepDown,
  ToolStepUp,
  ToolThirtySecond,
  ToolWhole,
} from './ToolIcons';
import { IconRedo, IconSave, IconUndo } from '../viewer/ViewerIcons';

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
  /** Thêm khuông Fa cho đàn, thêm khuông Sol/Fa/Tenor riêng, xóa khuông. */
  onStaves: (op: 'addBass' | 'addG' | 'addF' | 'addTenor' | 'remove') => void;
  /** Mở hộp thoại khóa nhạc, dấu hóa, nhịp. */
  onOpenNotation: () => void;
  /** Thêm / xóa ô nhịp. */
  onMeasures: (op: 'insertAfter' | 'insertBefore' | 'delete') => void;
  /** Viết bè, nốt nhỏ, xóa bè. */
  onVoice: (op: VoiceOp) => void;
  /** Tạo chùm (chùm ba, chùm năm...) từ nốt đang chọn hoặc bỏ chùm. */
  onTuplet: (op: TupletOp) => void;
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

const pitchLabel = (op: PitchOp): string => t(`editor.tool.pitch.${op}`);
const symbolLabel = (op: SymbolOp): string => t(`editor.tool.symbol.${op}`);
const durationToolLabel = (type: DurationType): string => t(`editor.tool.durationLabel.${type}`);

interface PitchTool {
  op: PitchOp;
  icon: ReactNode;
  /** Phím tắt hiện trong tooltip. */
  shortcut: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';
const ALT = isMac ? '⌥' : 'Alt';

const PITCH_TOOLS: PitchTool[] = [
  { op: 'stepUp', icon: <ToolStepUp />, shortcut: '↑' },
  { op: 'stepDown', icon: <ToolStepDown />, shortcut: '↓' },
  { op: 'semitoneUp', icon: <ToolSemitoneUp />, shortcut: `${ALT}+↑` },
  { op: 'semitoneDown', icon: <ToolSemitoneDown />, shortcut: `${ALT}+↓` },
  { op: 'octaveUp', icon: <ToolOctaveUp />, shortcut: `${MOD}+↑` },
  { op: 'octaveDown', icon: <ToolOctaveDown />, shortcut: `${MOD}+↓` },
];

interface SymbolTool {
  op: SymbolOp;
  icon: ReactNode;
  /** Phím tắt hiện trong tooltip (nếu có). */
  shortcut?: string;
}

const SYMBOL_TOOLS: SymbolTool[] = [
  { op: 'sharp', icon: <ToolSharp /> },
  { op: 'flat', icon: <ToolFlat /> },
  { op: 'natural', icon: <ToolNatural /> },
  { op: 'tie', icon: <ToolTie />, shortcut: 'T' },
  { op: 'slur', icon: <ToolSlur />, shortcut: 'S' },
  { op: 'rest', icon: <ToolRest /> },
  { op: 'delete', icon: <ToolDelete />, shortcut: 'Delete' },
];

const REPEAT_OPS: MarkOp[] = [
  'repeatStart',
  'repeatEnd',
  'volta1',
  'volta2',
  'volta3',
  'repeatTimes:2',
  'repeatTimes:3',
  'repeatTimes:4',
  'segno',
  'coda',
  'dc',
  'ds',
  'fine',
  'tocoda',
];
const BREAK_OPS: MarkOp[] = ['lineBreak', 'pageBreak', 'barDouble'];

/** Nhãn đoạn đặt sẵn; tên (cũng là chữ ghi vào bản nhạc) và từ khóa tìm kiếm nằm trong `editor.tool.preset.<id>`. */
const SECTION_IDS = ['intro', 'verse1', 'verse2', 'chorus', 'bridge', 'outro'] as const;
const sectionName = (id: (typeof SECTION_IDS)[number]): string => t(`editor.tool.preset.${id}.name`);
const sectionOp = (id: (typeof SECTION_IDS)[number]): MarkOp => `section:${sectionName(id)}`;
const SECTION_OPS = (): MarkOp[] => [...SECTION_IDS.map(sectionOp), 'sectionRemove'];

/** Nhãn và chú thích của một ký hiệu dạng MarkOp theo ngôn ngữ hiện tại; undefined nếu không có trong bảng. */
const markDef = (op: MarkOp): { label: string; title: string } | undefined => {
  if (op.startsWith('dyn:')) {
    const d = op.slice(4);
    return { label: d, title: t(`editor.tool.dyn.${d === 'ppp' || d === 'fff' ? d : 'accent'}`, { d }) };
  }
  const preset = SECTION_IDS.find((id) => sectionOp(id) === op);
  if (preset) {
    const name = sectionName(preset);
    return {
      label: name,
      title: t('editor.tool.sectionTitle', { name, keywords: t(`editor.tool.preset.${preset}.keywords`) }),
    };
  }
  const key = `editor.tool.mark.${op.replace(':', '_')}`;
  return hasKey(`${key}.label`) ? { label: t(`${key}.label`), title: t(`${key}.title`) } : undefined;
};

const DURATION_TOOLS: { type: DurationType; icon: ReactNode; key: string }[] = [
  { type: 'whole', icon: <ToolWhole />, key: '5' },
  { type: 'half', icon: <ToolHalf />, key: '4' },
  { type: 'quarter', icon: <ToolQuarter />, key: '3' },
  { type: 'eighth', icon: <ToolEighth />, key: '2' },
  { type: '16th', icon: <ToolSixteenth />, key: '1' },
  { type: '32nd', icon: <ToolThirtySecond />, key: '6' },
  { type: '64th', icon: <ToolSixtyFourth />, key: '7' },
];

/** Từ khóa thêm (tên tiếng Anh, tên gọi khác; giữ cả từ tiếng Việt để gõ kiểu nào cũng ra) để ô "Tìm ký hiệu" gõ kiểu nào cũng ra. */
const KEYWORDS: Partial<Record<MarkOp, string>> = {
  staccato: 'staccato ngắt', // i18n-ignore
  accent: 'accent nhấn', // i18n-ignore
  tenuto: 'tenuto',
  marcato: 'marcato',
  staccatissimo: 'staccatissimo',
  fermata: 'fermata ngân dấu nghỉ', // i18n-ignore
  fermataBelow: 'fermata ngược inverted fermata ngân dấu nghỉ', // i18n-ignore
  trillSharp: 'trill sharp thăng dấu hóa láy rền', // i18n-ignore
  trillFlat: 'trill flat giáng dấu hóa láy rền', // i18n-ignore
  trillNatural: 'trill natural bình dấu hóa láy rền', // i18n-ignore
  breath: 'breath mark lấy hơi', // i18n-ignore
  caesura: 'caesura ngắt nghỉ', // i18n-ignore
  trill: 'trill tr láy hoa mỹ', // i18n-ignore
  mordent: 'mordent láy hoa mỹ', // i18n-ignore
  invMordent: 'inverted mordent láy hoa mỹ', // i18n-ignore
  turn: 'turn gruppetto láy hoa mỹ', // i18n-ignore
  graceSlash: 'grace note acciaccatura nốt hoa mỹ trang trí', // i18n-ignore
  gracePlain: 'grace note appoggiatura nốt hoa mỹ trang trí', // i18n-ignore
  arpeggio: 'arpeggio rải hợp âm hoa mỹ', // i18n-ignore
  arpeggioDown: 'arpeggio rải hợp âm xuống hoa mỹ', // i18n-ignore
  glissando: 'glissando gliss trượt hoa mỹ', // i18n-ignore
  slide: 'slide trượt glissando hoa mỹ', // i18n-ignore
  graceToggle: 'grace note đổi gạch chéo acciaccatura appoggiatura hoa mỹ', // i18n-ignore
  cresc: 'crescendo to dần', // i18n-ignore
  dim: 'diminuendo decrescendo nhỏ dần', // i18n-ignore
  pedal: 'pedal',
  ottava8va: 'ottava octave quãng tám', // i18n-ignore
  ottava8vb: 'ottava octave quãng tám', // i18n-ignore
  repeatStart: 'repeat lặp lại dấu lặp', // i18n-ignore
  repeatEnd: 'repeat lặp lại dấu lặp', // i18n-ignore
  volta1: 'volta ending nhà 1', // i18n-ignore
  volta2: 'volta ending nhà 2', // i18n-ignore
  volta3: 'volta ending nhà 3', // i18n-ignore
  'repeatTimes:2': 'repeat lặp lần số lần', // i18n-ignore
  'repeatTimes:3': 'repeat lặp lần số lần', // i18n-ignore
  'repeatTimes:4': 'repeat lặp lần số lần', // i18n-ignore
  sectionRemove: 'nhãn đoạn section rehearsal bỏ', // i18n-ignore
  barDouble: 'double bar vạch đôi vạch kép ngăn đoạn', // i18n-ignore
  lineBreak: 'line break xuống dòng ngắt dòng', // i18n-ignore
  pageBreak: 'page break sang trang ngắt trang', // i18n-ignore
  segno: 'segno',
  coda: 'coda',
  dc: 'da capo quay lại đầu', // i18n-ignore
  ds: 'dal segno quay lại segno', // i18n-ignore
  fine: 'fine kết thúc', // i18n-ignore
  tocoda: 'to coda nhảy tới coda', // i18n-ignore
};

const ARTICULATION_OPS: MarkOp[] = [
  'staccato',
  'accent',
  'tenuto',
  'marcato',
  'staccatissimo',
  'fermata',
  'fermataBelow',
  'breath',
  'caesura',
];
const ORNAMENT_OPS: MarkOp[] = [
  'trill',
  'trillSharp',
  'trillFlat',
  'trillNatural',
  'mordent',
  'invMordent',
  'turn',
  'graceSlash',
  'gracePlain',
  'graceToggle',
  'arpeggio',
  'arpeggioDown',
  'glissando',
  'slide',
];
const PEDAL_OPS: MarkOp[] = ['pedal', 'ottava8va', 'ottava8vb'];

/** Bỏ dấu, hạ chữ thường để "lay", "Láy", "LÁY" cùng khớp. */
const normalize = (text: string): string => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd'); // i18n-ignore

const OPEN_KEY = 'sv-tools-open';
/** Các mục mở sẵn lần đầu; những mục khác thu gọn như bảng Palettes của MuseScore. */
const DEFAULT_OPEN = ['mode', 'pitch', 'duration'];

const loadOpen = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null');
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed;
  } catch {
    // Bộ nhớ trình duyệt bị chặn hoặc dữ liệu hỏng: dùng mặc định
  }
  return DEFAULT_OPEN;
};

const saveOpen = (open: string[]): void => {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(open));
  } catch {
    // Chỉ là tiện ích nhớ trạng thái: lỗi thì bỏ qua
  }
};

/** Một nút trong bảng công cụ, kèm chữ để ô tìm kiếm lọc. */
interface ToolEntry {
  key: string;
  /** Nhãn + chú thích + từ khóa, dùng để tìm kiếm. */
  text: string;
  node: ReactNode;
}

/** Một hàng nút: lưới biểu tượng hoặc lưới nút chữ, có thể có tiêu đề phụ. */
interface ToolBlock {
  kind: 'icon' | 'text';
  sub?: string;
  entries: ToolEntry[];
}

interface ToolSection {
  id: string;
  title: string;
  /** Hậu tố class: mode / pitch / actions giữ nguyên cách hiển thị trên iPad và Mobile, các mục còn lại là "soon". */
  mod: 'mode' | 'pitch' | 'actions' | 'soon';
  blocks: ToolBlock[];
  /** Phần không phải nút công cụ (hộp "Nghe khi sửa", hàng Hoàn tác/Lưu): chỉ hiện khi không tìm kiếm. */
  extra?: ReactNode;
}

/** Nút có biểu tượng và nhãn nhỏ bên dưới. */
function IconTool({
  icon,
  label,
  ...rest
}: { icon: ReactNode; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button aria-label={label} {...rest}>
      <span className="sv-tool__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sv-tool__label">{label}</span>
    </button>
  );
}

/**
 * Bảng công cụ chỉnh sửa (đặc tả 1.17): Desktop ở bên trái dạng các mục xổ xuống (có ô "Tìm ký hiệu"), iPad thu thành
 * thanh dưới đáy, Mobile mở dạng bottom sheet. Mobile chỉ có nhóm Cao độ (đặc tả 1.18). Chỉ hiện khi canEdit.
 * Thu gọn và tìm kiếm chỉ áp dụng ở Desktop; iPad và Mobile luôn trải các nhóm như trước.
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
  onStaves,
  onOpenNotation,
  onMeasures,
  onVoice,
  onTuplet,
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
  const [expanded, setExpanded] = useState<string[]>(loadOpen);
  const [query, setQuery] = useState('');
  const [sectionText, setSectionText] = useState('');
  const wide = useMediaQuery('(min-width: 1280px)');
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const searching = wide && words.length > 0;
  const matches = (text: string): boolean => {
    const hay = normalize(text);
    return words.every((word) => hay.includes(word));
  };

  const toggle = (id: string) => {
    const next = expanded.includes(id) ? expanded.filter((x) => x !== id) : [...expanded, id];
    setExpanded(next);
    saveOpen(next);
  };

  const needSelection = !hasSelection || busy;
  const selectionHint = hasSelection ? '' : t('editor.tool.selectFirst');
  const selectMode = !inputMode && !lyricMode && !chordMode;

  /** Nút chữ của một ký hiệu MarkOp; null nếu không có trong bảng tra. */
  const markEntry = (op: MarkOp, extraClass = ''): ToolEntry | null => {
    const def = markDef(op);
    if (!def) return null;
    return {
      key: op,
      text: `${def.label} ${def.title} ${KEYWORDS[op] ?? ''}`,
      node: (
        <button
          className={`sv-tool sv-tool--text${extraClass}`}
          disabled={needSelection}
          onClick={() => onMark(op)}
          title={`${def.title}${selectionHint}`}
        >
          {def.label}
        </button>
      ),
    };
  };
  const markEntries = (ops: MarkOp[], extraClass = ''): ToolEntry[] =>
    ops.map((op) => markEntry(op, extraClass)).filter((e): e is ToolEntry => e !== null);

  const dynamicEntry = (d: (typeof DYNAMICS)[number]): ToolEntry => ({
    key: `dyn:${d}`,
    text: `${d} sắc thái to nhỏ dynamics`, // i18n-ignore
    node: (
      <button
        className="sv-tool sv-tool--text sv-tool--dyn"
        disabled={needSelection}
        onClick={() => onMark(`dyn:${d}`)}
        title={`${t('editor.tool.dynamicTitle', { d })}${selectionHint}`}
      >
        {d}
      </button>
    ),
  });

  /** Nút chữ chung: nhãn, chú thích, hàm bấm. */
  const textEntry = (key: string, label: string, title: string, onClick: () => void, disabled: boolean): ToolEntry => ({
    key,
    text: `${label} ${title}`,
    node: (
      <button className="sv-tool sv-tool--text" disabled={disabled} onClick={onClick} title={title}>
        {label}
      </button>
    ),
  });

  const sections: ToolSection[] = [
    {
      id: 'mode',
      title: t('editor.tool.section.mode'),
      mod: 'mode',
      blocks: [
        {
          kind: 'icon',
          entries: [
            {
              key: 'select',
              text: 'Chọn nốt chế độ chọn select', // i18n-ignore
              node: (
                <IconTool
                  className={`sv-tool${selectMode ? ' is-active' : ''}`}
                  aria-pressed={selectMode}
                  onClick={() => onInputModeChange(false)}
                  title={t('editor.tool.mode.select.title')}
                  icon={<ToolSelect />}
                  label={t('editor.tool.mode.select.label')}
                />
              ),
            },
            {
              key: 'input',
              text: 'Nhập nốt chế độ nhập pencil', // i18n-ignore
              node: (
                <IconTool
                  className={`sv-tool${inputMode ? ' is-active' : ''}`}
                  aria-pressed={inputMode}
                  onClick={() => onInputModeChange(true)}
                  title={t('editor.tool.mode.input.title')}
                  icon={<ToolPencil />}
                  label={t('editor.tool.mode.input.label')}
                />
              ),
            },
            {
              key: 'lyric',
              text: 'Lời nhập lời bài hát lyrics', // i18n-ignore
              node: (
                <IconTool
                  className={`sv-tool${lyricMode ? ' is-active' : ''}`}
                  aria-pressed={lyricMode}
                  onClick={() => onLyricModeChange(true)}
                  title={t('editor.tool.mode.lyric.title')}
                  icon={<ToolLyric />}
                  label={t('editor.tool.mode.lyric.label')}
                />
              ),
            },
            {
              key: 'chord',
              text: 'Hợp âm nhập hợp âm chord', // i18n-ignore
              node: (
                <IconTool
                  className={`sv-tool${chordMode ? ' is-active' : ''}`}
                  aria-pressed={chordMode}
                  onClick={() => onChordModeChange(true)}
                  title={t('editor.tool.mode.chord.title')}
                  icon={<ToolChord />}
                  label={t('editor.tool.mode.chord.label')}
                />
              ),
            },
          ],
        },
      ],
    },
    {
      id: 'pitch',
      title: t('editor.tool.section.pitch'),
      mod: 'pitch',
      blocks: [
        {
          kind: 'icon',
          entries: PITCH_TOOLS.map((tool) => ({
            key: tool.op,
            text: `${pitchLabel(tool.op)} cao độ pitch`, // i18n-ignore
            node: (
              <IconTool
                className="sv-tool"
                disabled={needSelection}
                onClick={() => onPitch(tool.op)}
                title={`${pitchLabel(tool.op)} (${tool.shortcut})${selectionHint}`}
                icon={tool.icon}
                label={pitchLabel(tool.op)}
              />
            ),
          })),
        },
      ],
      extra: (
        <label className="sv-tools__check">
          <input type="checkbox" checked={previewTone} onChange={(e) => onPreviewToneChange(e.target.checked)} />
          {t('editor.tool.previewTone')}
        </label>
      ),
    },
    {
      id: 'actions',
      title: t('editor.tool.section.actions'),
      mod: 'actions',
      blocks: [],
      extra: (
        <div className="sv-tools__actions">
          <button className="sc-btn" disabled={!canUndo || busy} onClick={onUndo}>
            <IconUndo /> {t('editor.tool.undo')}
          </button>
          <button className="sc-btn" disabled={!canRedo || busy} onClick={onRedo}>
            <IconRedo /> {t('editor.tool.redo')}
          </button>
          <button className="sc-btn sc-btn--primary" disabled={!canSave || busy} onClick={onSave}>
            <IconSave /> {t('common.save')}
          </button>
        </div>
      ),
    },
    {
      id: 'duration',
      title: t('editor.tool.section.duration'),
      mod: 'soon',
      blocks: [
        {
          kind: 'icon',
          entries: [
            ...DURATION_TOOLS.map((tool) => ({
              key: tool.type,
              text: `${durationToolLabel(tool.type)} trường độ nốt duration`, // i18n-ignore
              node: (
                <IconTool
                  className={`sv-tool${inputMode && inputDuration.type === tool.type ? ' is-active' : ''}`}
                  disabled={busy}
                  draggable={!busy}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      DURATION_DRAG_TYPE,
                      JSON.stringify({ type: tool.type, dots: inputDuration.dots }),
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  aria-pressed={inputMode ? inputDuration.type === tool.type : undefined}
                  onClick={() => onDuration(tool.type)}
                  title={t('editor.tool.durationTitle', { label: durationToolLabel(tool.type), key: tool.key })}
                  icon={tool.icon}
                  label={durationToolLabel(tool.type)}
                />
              ),
            })),
            {
              key: 'dot',
              text: 'Chấm dôi dot', // i18n-ignore
              node: (
                <IconTool
                  className={`sv-tool${inputMode && inputDuration.dots > 0 ? ' is-active' : ''}`}
                  disabled={(!hasSelection && !inputMode) || busy}
                  aria-pressed={inputMode ? inputDuration.dots > 0 : undefined}
                  onClick={onDot}
                  title={t('editor.tool.dot.title')}
                  icon={<ToolDot />}
                  label={t('editor.tool.dot.label')}
                />
              ),
            },
          ],
        },
        {
          kind: 'text',
          entries: [
            {
              key: 'breve',
              text: 'Tròn đôi breve trường độ', // i18n-ignore
              node: (
                <button
                  className={`sv-tool sv-tool--text${inputMode && inputDuration.type === 'breve' ? ' is-active' : ''}`}
                  disabled={busy}
                  onClick={() => onDuration('breve')}
                  title={t('editor.tool.breveTitle')}
                >
                  {durationToolLabel('breve')}
                </button>
              ),
            },
          ],
        },
        {
          kind: 'text',
          sub: t('editor.tool.sub.tuplet', { mod: MOD }),
          entries: [
            ...TUPLET_PRESETS.map((preset) => ({
              key: tupletPresetLabel(preset),
              text: `${tupletPresetLabel(preset)} chùm tuplet triplet`, // i18n-ignore
              node: (
                <button
                  className="sv-tool sv-tool--text"
                  disabled={needSelection}
                  onClick={() => onTuplet({ kind: 'make', actual: preset.actual, normal: preset.normal })}
                  title={`${t('editor.tool.tupletTitle', { label: tupletPresetLabel(preset), actual: preset.actual, normal: preset.normal })}${selectionHint}`}
                >
                  {tupletPresetLabel(preset)}
                </button>
              ),
            })),
            textEntry(
              'tuplet-remove',
              t('editor.tool.text.tuplet-remove.label'),
              `${t('editor.tool.text.tuplet-remove.title')}${selectionHint}`,
              () => onTuplet({ kind: 'remove' }),
              needSelection,
            ),
          ],
        },
      ],
    },
    {
      id: 'symbols',
      title: t('editor.tool.section.symbols'),
      mod: 'soon',
      blocks: [
        {
          kind: 'icon',
          entries: SYMBOL_TOOLS.map((tool) => ({
            key: tool.op,
            text: `${symbolLabel(tool.op)} dấu hóa nối luyến lặng xóa sharp flat natural tie slur rest delete`, // i18n-ignore
            node: (
              <IconTool
                className="sv-tool"
                disabled={needSelection}
                onClick={() => onSymbol(tool.op)}
                title={`${symbolLabel(tool.op)}${tool.shortcut ? ` (${tool.shortcut})` : ''}${selectionHint}`}
                icon={tool.icon}
                label={symbolLabel(tool.op)}
              />
            ),
          })),
        },
      ],
    },
    {
      id: 'articulation',
      title: t('editor.tool.section.articulation'),
      mod: 'soon',
      blocks: [{ kind: 'text', entries: markEntries(ARTICULATION_OPS) }],
    },
    {
      id: 'ornament',
      title: t('editor.tool.section.ornament'),
      mod: 'soon',
      blocks: [{ kind: 'text', entries: markEntries(ORNAMENT_OPS) }],
    },
    {
      id: 'dynamics',
      title: t('editor.tool.section.dynamics'),
      mod: 'soon',
      blocks: [
        {
          kind: 'text',
          entries: [
            ...DYNAMICS.map(dynamicEntry),
            ...markEntries(
              EXTRA_DYNAMICS.map((d) => `dyn:${d}` as MarkOp),
              ' sv-tool--dyn',
            ),
            ...markEntries(['cresc', 'dim']),
          ],
        },
        { kind: 'text', sub: t('editor.tool.sub.pedal'), entries: markEntries(PEDAL_OPS) },
      ],
    },
    {
      id: 'repeats',
      title: t('editor.tool.section.repeats'),
      mod: 'soon',
      blocks: [{ kind: 'text', entries: markEntries(REPEAT_OPS) }],
    },
    {
      id: 'structure',
      title: t('editor.tool.section.structure'),
      mod: 'soon',
      blocks: [
        {
          kind: 'text',
          sub: t('editor.tool.sub.section'),
          entries: markEntries(SECTION_OPS()),
        },
        { kind: 'text', sub: t('editor.tool.sub.breaks'), entries: markEntries(BREAK_OPS) },
      ],
      extra: (
        <form
          className="sv-tools__inline"
          onSubmit={(e) => {
            e.preventDefault();
            const text = sectionText.trim();
            if (!text || needSelection) return;
            onMark(`section:${text}`);
            setSectionText('');
          }}
        >
          <input
            value={sectionText}
            onChange={(e) => setSectionText(e.target.value)}
            maxLength={30}
            placeholder={t('editor.tool.sectionForm.placeholder')}
            aria-label={t('editor.tool.sectionForm.aria')}
          />
          <button
            type="submit"
            className="sv-tool sv-tool--text"
            disabled={needSelection || !sectionText.trim()}
            title={`${t('editor.tool.sectionForm.title')}${selectionHint}`}
          >
            {t('editor.tool.sectionForm.submit')}
          </button>
        </form>
      ),
    },
    {
      id: 'staves',
      title: t('editor.tool.section.staves'),
      mod: 'soon',
      blocks: [
        {
          kind: 'text',
          entries: [
            textEntry(
              'addBass',
              t('editor.tool.text.addBass.label'),
              t('editor.tool.text.addBass.title'),
              () => onStaves('addBass'),
              busy,
            ),
            textEntry(
              'addG',
              t('editor.tool.text.addG.label'),
              t('editor.tool.text.addG.title'),
              () => onStaves('addG'),
              busy,
            ),
            textEntry(
              'addF',
              t('editor.tool.text.addF.label'),
              t('editor.tool.text.addF.title'),
              () => onStaves('addF'),
              busy,
            ),
            textEntry(
              'addTenor',
              t('editor.tool.text.addTenor.label'),
              t('editor.tool.text.addTenor.title'),
              () => onStaves('addTenor'),
              busy,
            ),
            textEntry(
              'removeStaff',
              t('editor.tool.text.removeStaff.label'),
              t('editor.tool.text.removeStaff.title'),
              () => onStaves('remove'),
              needSelection,
            ),
            textEntry(
              'notation',
              t('editor.tool.text.notation.label'),
              t('editor.tool.text.notation.title'),
              onOpenNotation,
              needSelection,
            ),
          ],
        },
      ],
    },
    {
      id: 'measures',
      title: t('editor.tool.section.measures'),
      mod: 'soon',
      blocks: [
        {
          kind: 'text',
          entries: [
            textEntry(
              'insertAfter',
              t('editor.tool.text.insertAfter.label'),
              t('editor.tool.text.insertAfter.title'),
              () => onMeasures('insertAfter'),
              busy,
            ),
            textEntry(
              'insertBefore',
              t('editor.tool.text.insertBefore.label'),
              t('editor.tool.text.insertBefore.title'),
              () => onMeasures('insertBefore'),
              needSelection,
            ),
            textEntry(
              'deleteMeasure',
              t('editor.tool.text.deleteMeasure.label'),
              t('editor.tool.text.deleteMeasure.title'),
              () => onMeasures('delete'),
              needSelection,
            ),
          ],
        },
      ],
    },
    {
      id: 'voices',
      title: t('editor.tool.section.voices'),
      mod: 'soon',
      blocks: [
        {
          kind: 'text',
          entries: [
            textEntry(
              'chordBelow',
              t('editor.tool.text.chordBelow.label'),
              t('editor.tool.text.chordBelow.title'),
              () => onVoice('chordBelow'),
              needSelection,
            ),
            textEntry(
              'chordAbove',
              t('editor.tool.text.chordAbove.label'),
              t('editor.tool.text.chordAbove.title'),
              () => onVoice('chordAbove'),
              needSelection,
            ),
            textEntry(
              'blank',
              t('editor.tool.text.blank.label'),
              t('editor.tool.text.blank.title'),
              () => onVoice('blank'),
              needSelection,
            ),
            textEntry(
              'addBelow',
              t('editor.tool.text.addBelow.label'),
              t('editor.tool.text.addBelow.title'),
              () => onVoice('addBelow'),
              needSelection,
            ),
            textEntry(
              'addAbove',
              t('editor.tool.text.addAbove.label'),
              t('editor.tool.text.addAbove.title'),
              () => onVoice('addAbove'),
              needSelection,
            ),
            textEntry(
              'cue',
              t('editor.tool.text.cue.label'),
              t('editor.tool.text.cue.title'),
              () => onVoice('cue'),
              needSelection,
            ),
            textEntry(
              'removeVoice',
              t('editor.tool.text.removeVoice.label'),
              t('editor.tool.text.removeVoice.title'),
              () => onVoice('remove'),
              needSelection,
            ),
          ],
        },
      ],
    },
  ];

  // Đang tìm: chỉ giữ nút khớp (mục có tên khớp thì giữ cả mục), mục không còn nút nào thì ẩn
  const visible = sections
    .map((section) => {
      if (!searching) return { section, blocks: section.blocks };
      const sectionHit = matches(section.title);
      const blocks = section.blocks
        .map((block) => ({
          ...block,
          entries: sectionHit ? block.entries : block.entries.filter((entry) => matches(entry.text)),
        }))
        .filter((block) => block.entries.length > 0);
      return { section, blocks };
    })
    .filter(({ blocks }) => !searching || blocks.length > 0);

  return (
    <>
      {open && <div className="sv-sheet-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={`sv-tools${open ? ' is-open' : ''}`} aria-label={t('editor.tool.panel')}>
        <div className="sv-tools__head">
          <strong>{t('editor.tool.panel')}</strong>
          <button className="sc-btn sv-tools__close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <p className="sv-tools__note">{t('editor.tool.note')}</p>
        <div className="sv-tools__search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
            placeholder={t('editor.tool.searchPlaceholder')}
            aria-label={t('editor.tool.searchAria')}
          />
        </div>

        {searching && visible.length === 0 && (
          <p className="sv-tools__empty" role="status">
            {t('editor.tool.empty', { query: query.trim() })}
          </p>
        )}

        {visible.map(({ section, blocks }) => {
          const isOpen = searching || expanded.includes(section.id);
          return (
            <section
              key={section.id}
              className={`sv-tools__group sv-tools__group--${section.mod}${isOpen ? '' : ' is-collapsed'}`}
            >
              <h3 className="sv-tools__title">
                <button
                  type="button"
                  className="sv-tools__toggle"
                  aria-expanded={isOpen}
                  aria-controls={`sv-tools-${section.id}`}
                  disabled={searching}
                  onClick={() => toggle(section.id)}
                >
                  {section.title}
                  <span className="sv-tools__chev" aria-hidden="true" />
                </button>
              </h3>
              <div id={`sv-tools-${section.id}`} className="sv-tools__body">
                {blocks.map((block, index) => (
                  <div key={index}>
                    {block.sub && <div className="sv-tools__sub">{block.sub}</div>}
                    <div className={`sv-tools__row${block.kind === 'text' ? ' sv-tools__row--text' : ''}`}>
                      {block.entries.map((entry) => (
                        <Fragment key={entry.key}>{entry.node}</Fragment>
                      ))}
                    </div>
                  </div>
                ))}
                {!searching && section.extra}
              </div>
            </section>
          );
        })}
      </aside>
    </>
  );
}
