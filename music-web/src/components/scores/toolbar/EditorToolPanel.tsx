import { Fragment, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { SymbolOp } from '../../editor/core/commands';
import { DYNAMICS, EXTRA_DYNAMICS } from '../../editor/notation/marks';
import type { MarkOp } from '../../editor/notation/marks';
import { TUPLET_PRESETS } from '../../editor/notes/tuplets';
import type { TupletOp } from '../../editor/notes/tuplets';
import type { VoiceOp } from '../../editor/notes/voices';
import type { DurationChoice, DurationType } from '../../editor/notes/durations';
import type { PitchOp } from '../../editor/notes/pitch';
import { DURATION_DRAG_TYPE } from '../../editor/core/staffHit';
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

/** Menu "Thêm ký hiệu…": các ký hiệu ít dùng, chia nhóm. */
const MORE_MARK_GROUPS: { title: string; tools: { op: MarkOp; label: string; title: string }[] }[] = [
  {
    title: 'Sắc thái',
    tools: EXTRA_DYNAMICS.map((d) => ({
      op: `dyn:${d}` as MarkOp,
      label: d,
      title:
        d === 'ppp' || d === 'fff'
          ? `${d}: ${d === 'ppp' ? 'rất rất nhỏ' : 'rất rất to'} (đặt ở nốt đầu của vùng chọn)`
          : `${d}: nhấn mạnh một nốt rồi trở lại mức cũ (đặt ở nốt đầu của vùng chọn)`,
    })),
  },
  {
    title: 'Kỹ thuật',
    tools: [
      { op: 'fermataBelow', label: 'Fermata ngược', title: 'Fermata ngược (vẽ dưới nốt): ngân tự do (bấm lại để bỏ)' },
      { op: 'marcato', label: 'Marcato', title: 'Marcato: nhấn mạnh và ngắt (bấm lại để bỏ)' },
      { op: 'staccatissimo', label: 'Staccatissimo', title: 'Staccatissimo: ngắt rất ngắn (bấm lại để bỏ)' },
      { op: 'breath', label: 'Lấy hơi', title: 'Dấu lấy hơi sau nốt: nốt ngắt sớm một chút khi phát (bấm lại để bỏ)' },
      {
        op: 'caesura',
        label: 'Ngắt nghỉ',
        title: 'Dấu ngắt nghỉ //: nghỉ thêm một phách sau nốt khi phát (bấm lại để bỏ; bản xem trước chưa vẽ dấu này)',
      },
      { op: 'arpeggio', label: 'Rải hợp âm', title: 'Rải các nốt của hợp âm đang chọn từ dưới lên (bấm lại để bỏ)' },
    ],
  },
  {
    title: 'Láy',
    tools: [
      { op: 'trill', label: 'Láy rền', title: 'Láy rền (tr): luân phiên với nốt liền trên (bấm lại để bỏ)' },
      {
        op: 'trillSharp',
        label: 'Láy rền ♯',
        title: 'Dấu thăng cho láy rền: nốt liền trên được nâng nửa cung (thêm láy rền nếu chưa có; bấm lại để bỏ dấu)',
      },
      {
        op: 'trillFlat',
        label: 'Láy rền ♭',
        title: 'Dấu giáng cho láy rền: nốt liền trên được hạ nửa cung (thêm láy rền nếu chưa có; bấm lại để bỏ dấu)',
      },
      {
        op: 'trillNatural',
        label: 'Láy rền ♮',
        title:
          'Dấu bình cho láy rền: nốt liền trên theo âm gốc, bỏ qua hóa biểu (thêm láy rền nếu chưa có; bấm lại để bỏ dấu)',
      },
      { op: 'mordent', label: 'Láy ngắn', title: 'Láy ngắn (mordent): nốt - nốt dưới - nốt (bấm lại để bỏ)' },
      {
        op: 'invMordent',
        label: 'Láy ngắn ngược',
        title: 'Láy ngắn ngược: nốt - nốt trên - nốt (bấm lại để bỏ)',
      },
      { op: 'turn', label: 'Láy vòng', title: 'Láy vòng: nốt trên - nốt - nốt dưới - nốt (bấm lại để bỏ)' },
    ],
  },
  {
    title: 'Khác',
    tools: [
      { op: 'pedal', label: 'Pedal', title: 'Pedal: nhấn từ nốt đầu đến hết nốt cuối của vùng chọn (bấm lại để bỏ)' },
      { op: 'ottava8va', label: '8va', title: '8va: viết thấp hơn một quãng tám, đàn/hát cao hơn (bấm lại để bỏ)' },
      { op: 'ottava8vb', label: '8vb', title: '8vb: viết cao hơn một quãng tám, đàn/hát thấp hơn (bấm lại để bỏ)' },
      {
        op: 'graceSlash',
        label: 'Hoa mỹ (gạch)',
        title: 'Nốt hoa mỹ có gạch chéo (acciaccatura): thêm trước nốt đang chọn, cao hơn một bậc',
      },
      {
        op: 'gracePlain',
        label: 'Hoa mỹ (không gạch)',
        title: 'Nốt hoa mỹ không gạch (appoggiatura): thêm trước nốt đang chọn, cao hơn một bậc',
      },
      {
        op: 'graceToggle',
        label: 'Đổi gạch (hoa mỹ)',
        title: 'Đổi nốt hoa mỹ đang chọn giữa có gạch chéo (acciaccatura) và không gạch (appoggiatura)',
      },
      {
        op: 'arpeggioDown',
        label: 'Rải xuống',
        title: 'Rải các nốt của hợp âm đang chọn từ trên xuống (bấm lại để bỏ)',
      },
      {
        op: 'glissando',
        label: 'Glissando',
        title:
          'Glissando: đường lượn từ nốt đang chọn tới nốt liền sau (hoặc tới nốt cuối của vùng chọn); bấm lại để bỏ',
      },
      {
        op: 'slide',
        label: 'Trượt',
        title: 'Trượt (slide): đường thẳng nối hai nốt như glissando, không có chữ; bấm lại để bỏ',
      },
    ],
  },
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
  {
    op: 'volta3',
    label: 'Nhà 3',
    title: 'Nhà 3 (3.) trải qua các ô của vùng chọn, để hở: dùng khi có lần chơi thứ ba',
  },
  {
    op: 'repeatTimes:2',
    label: 'Lặp ×2',
    title: 'Chơi đoạn lặp 2 lần (mặc định). Chọn ô có dấu lặp cuối :|',
  },
  {
    op: 'repeatTimes:3',
    label: 'Lặp ×3',
    title: 'Chơi đoạn lặp 3 lần: đặt ở dấu lặp cuối của ô cuối vùng chọn (cần có :| trước)',
  },
  {
    op: 'repeatTimes:4',
    label: 'Lặp ×4',
    title: 'Chơi đoạn lặp 4 lần: đặt ở dấu lặp cuối của ô cuối vùng chọn (cần có :| trước)',
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
  { type: '32nd', icon: <ToolThirtySecond />, label: 'Móc ba', key: '6' },
  { type: '64th', icon: <ToolSixtyFourth />, label: 'Móc tứ', key: '7' },
];

/** Nhãn đoạn đặt sẵn (kèm tên tiếng Anh để ô tìm kiếm gõ kiểu nào cũng ra). */
const SECTION_PRESETS: { name: string; en: string }[] = [
  { name: 'Intro', en: 'intro mở đầu' },
  { name: 'Phiên khúc 1', en: 'verse 1' },
  { name: 'Phiên khúc 2', en: 'verse 2' },
  { name: 'Điệp khúc', en: 'chorus' },
  { name: 'Cầu', en: 'bridge' },
  { name: 'Kết', en: 'outro ending kết thúc' },
];

const SECTION_TOOLS: { op: MarkOp; label: string; title: string }[] = [
  ...SECTION_PRESETS.map(({ name, en }) => ({
    op: `section:${name}` as MarkOp,
    label: name,
    title: `Nhãn đoạn "${name}" (${en}) ở đầu ô đang chọn: bấm lại để bỏ, nhãn khác sẽ thay nhãn cũ`,
  })),
  { op: 'sectionRemove', label: 'Bỏ nhãn', title: 'Bỏ nhãn đoạn ở ô đang chọn' },
];

const BREAK_TOOLS: { op: MarkOp; label: string; title: string }[] = [
  {
    op: 'lineBreak',
    label: 'Xuống dòng',
    title: 'Bắt đầu dòng mới tại ô đang chọn (bấm lại để bỏ); chỉ có tác dụng ở chế độ xem theo trang',
  },
  {
    op: 'pageBreak',
    label: 'Sang trang',
    title: 'Bắt đầu trang mới tại ô đang chọn (bấm lại để bỏ); chỉ có tác dụng ở chế độ xem theo trang',
  },
  {
    op: 'barDouble',
    label: 'Vạch đôi',
    title: 'Vạch đôi ở cuối ô cuối của vùng chọn để ngăn đoạn (bấm lại để bỏ; ô có dấu lặp cuối thì không đặt được)',
  },
];

/** Tra nhanh nhãn và chú thích của mọi ký hiệu dạng MarkOp (gộp từ các bảng ở trên). */
const MARK_INDEX = new Map<MarkOp, { label: string; title: string }>(
  [
    ...MARK_TOOLS,
    ...MORE_MARK_GROUPS.flatMap((group) => group.tools),
    ...REPEAT_TOOLS,
    ...SECTION_TOOLS,
    ...BREAK_TOOLS,
  ].map((tool) => [tool.op, tool]),
);

/** Từ khóa thêm (tên tiếng Anh, tên gọi khác) để ô "Tìm ký hiệu" gõ kiểu nào cũng ra. */
const KEYWORDS: Partial<Record<MarkOp, string>> = {
  staccato: 'staccato ngắt',
  accent: 'accent nhấn',
  tenuto: 'tenuto',
  marcato: 'marcato',
  staccatissimo: 'staccatissimo',
  fermata: 'fermata ngân dấu nghỉ',
  fermataBelow: 'fermata ngược inverted fermata ngân dấu nghỉ',
  trillSharp: 'trill sharp thăng dấu hóa láy rền',
  trillFlat: 'trill flat giáng dấu hóa láy rền',
  trillNatural: 'trill natural bình dấu hóa láy rền',
  breath: 'breath mark lấy hơi',
  caesura: 'caesura ngắt nghỉ',
  trill: 'trill tr láy hoa mỹ',
  mordent: 'mordent láy hoa mỹ',
  invMordent: 'inverted mordent láy hoa mỹ',
  turn: 'turn gruppetto láy hoa mỹ',
  graceSlash: 'grace note acciaccatura nốt hoa mỹ trang trí',
  gracePlain: 'grace note appoggiatura nốt hoa mỹ trang trí',
  arpeggio: 'arpeggio rải hợp âm hoa mỹ',
  arpeggioDown: 'arpeggio rải hợp âm xuống hoa mỹ',
  glissando: 'glissando gliss trượt hoa mỹ',
  slide: 'slide trượt glissando hoa mỹ',
  graceToggle: 'grace note đổi gạch chéo acciaccatura appoggiatura hoa mỹ',
  cresc: 'crescendo to dần',
  dim: 'diminuendo decrescendo nhỏ dần',
  pedal: 'pedal',
  ottava8va: 'ottava octave quãng tám',
  ottava8vb: 'ottava octave quãng tám',
  repeatStart: 'repeat lặp lại dấu lặp',
  repeatEnd: 'repeat lặp lại dấu lặp',
  volta1: 'volta ending nhà 1',
  volta2: 'volta ending nhà 2',
  volta3: 'volta ending nhà 3',
  'repeatTimes:2': 'repeat lặp lần số lần',
  'repeatTimes:3': 'repeat lặp lần số lần',
  'repeatTimes:4': 'repeat lặp lần số lần',
  sectionRemove: 'nhãn đoạn section rehearsal bỏ',
  barDouble: 'double bar vạch đôi vạch kép ngăn đoạn',
  lineBreak: 'line break xuống dòng ngắt dòng',
  pageBreak: 'page break sang trang ngắt trang',
  segno: 'segno',
  coda: 'coda',
  dc: 'da capo quay lại đầu',
  ds: 'dal segno quay lại segno',
  fine: 'fine kết thúc',
  tocoda: 'to coda nhảy tới coda',
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
const normalize = (text: string): string => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

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
  const selectionHint = hasSelection ? '' : ' - hãy chọn nốt trước';
  const selectMode = !inputMode && !lyricMode && !chordMode;

  /** Nút chữ của một ký hiệu MarkOp; null nếu không có trong bảng tra. */
  const markEntry = (op: MarkOp, extraClass = ''): ToolEntry | null => {
    const def = MARK_INDEX.get(op);
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
    text: `${d} sắc thái to nhỏ dynamics`,
    node: (
      <button
        className="sv-tool sv-tool--text sv-tool--dyn"
        disabled={needSelection}
        onClick={() => onMark(`dyn:${d}`)}
        title={`Mức to nhỏ ${d} (đặt ở nốt đầu của vùng chọn)${selectionHint}`}
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
      title: 'Chế độ',
      mod: 'mode',
      blocks: [
        {
          kind: 'icon',
          entries: [
            {
              key: 'select',
              text: 'Chọn nốt chế độ chọn select',
              node: (
                <IconTool
                  className={`sv-tool${selectMode ? ' is-active' : ''}`}
                  aria-pressed={selectMode}
                  onClick={() => onInputModeChange(false)}
                  title="Chọn nốt"
                  icon={<ToolSelect />}
                  label="Chọn"
                />
              ),
            },
            {
              key: 'input',
              text: 'Nhập nốt chế độ nhập pencil',
              node: (
                <IconTool
                  className={`sv-tool${inputMode ? ' is-active' : ''}`}
                  aria-pressed={inputMode}
                  onClick={() => onInputModeChange(true)}
                  title="Nhập nốt: chọn dấu lặng rồi bấm phím A–G (Esc để thoát)"
                  icon={<ToolPencil />}
                  label="Nhập nốt"
                />
              ),
            },
            {
              key: 'lyric',
              text: 'Lời nhập lời bài hát lyrics',
              node: (
                <IconTool
                  className={`sv-tool${lyricMode ? ' is-active' : ''}`}
                  aria-pressed={lyricMode}
                  onClick={() => onLyricModeChange(true)}
                  title="Nhập lời bài hát: chọn nốt rồi gõ âm tiết, Space sang nốt kế (Esc để thoát)"
                  icon={<ToolLyric />}
                  label="Lời"
                />
              ),
            },
            {
              key: 'chord',
              text: 'Hợp âm nhập hợp âm chord',
              node: (
                <IconTool
                  className={`sv-tool${chordMode ? ' is-active' : ''}`}
                  aria-pressed={chordMode}
                  onClick={() => onChordModeChange(true)}
                  title="Nhập hợp âm: chọn nốt rồi gõ Am7, C/G... (Esc để thoát)"
                  icon={<ToolChord />}
                  label="Hợp âm"
                />
              ),
            },
          ],
        },
      ],
    },
    {
      id: 'pitch',
      title: 'Cao độ',
      mod: 'pitch',
      blocks: [
        {
          kind: 'icon',
          entries: PITCH_TOOLS.map((tool) => ({
            key: tool.op,
            text: `${tool.label} cao độ pitch`,
            node: (
              <IconTool
                className="sv-tool"
                disabled={needSelection}
                onClick={() => onPitch(tool.op)}
                title={`${tool.label} (${tool.shortcut})${selectionHint}`}
                icon={tool.icon}
                label={tool.label}
              />
            ),
          })),
        },
      ],
      extra: (
        <label className="sv-tools__check">
          <input type="checkbox" checked={previewTone} onChange={(e) => onPreviewToneChange(e.target.checked)} />
          Nghe khi sửa
        </label>
      ),
    },
    {
      id: 'actions',
      title: 'Thao tác',
      mod: 'actions',
      blocks: [],
      extra: (
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
      ),
    },
    {
      id: 'duration',
      title: 'Trường độ',
      mod: 'soon',
      blocks: [
        {
          kind: 'icon',
          entries: [
            ...DURATION_TOOLS.map((tool) => ({
              key: tool.type,
              text: `${tool.label} trường độ nốt duration`,
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
                  title={`${tool.label} (${tool.key}) · bấm: đổi trường độ nốt đang chọn · kéo vào khuông: thêm nốt`}
                  icon={tool.icon}
                  label={tool.label}
                />
              ),
            })),
            {
              key: 'dot',
              text: 'Chấm dôi dot',
              node: (
                <IconTool
                  className={`sv-tool${inputMode && inputDuration.dots > 0 ? ' is-active' : ''}`}
                  disabled={(!hasSelection && !inputMode) || busy}
                  aria-pressed={inputMode ? inputDuration.dots > 0 : undefined}
                  onClick={onDot}
                  title="Chấm dôi (.): bấm lần 2 chấm dôi kép, lần 3 bỏ chấm"
                  icon={<ToolDot />}
                  label="Chấm dôi"
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
              text: 'Tròn đôi breve trường độ',
              node: (
                <button
                  className={`sv-tool sv-tool--text${inputMode && inputDuration.type === 'breve' ? ' is-active' : ''}`}
                  disabled={busy}
                  onClick={() => onDuration('breve')}
                  title="Tròn đôi (dài 2 nốt tròn): bấm để đổi trường độ nốt đang chọn, hoặc đặt trường độ nhập"
                >
                  Tròn đôi
                </button>
              ),
            },
          ],
        },
        {
          kind: 'text',
          sub: `Chùm (${MOD}+3 = chùm ba)`,
          entries: [
            ...TUPLET_PRESETS.map((preset) => ({
              key: preset.label,
              text: `${preset.label} chùm tuplet triplet`,
              node: (
                <button
                  className="sv-tool sv-tool--text"
                  disabled={needSelection}
                  onClick={() => onTuplet({ kind: 'make', actual: preset.actual, normal: preset.normal })}
                  title={`${preset.label}: ${preset.actual} nốt trong thời gian của ${preset.normal} nốt cùng loại (nốt đang chọn giữ chỗ đầu, các chỗ còn lại là dấu lặng để nhập)${selectionHint}`}
                >
                  {preset.label}
                </button>
              ),
            })),
            textEntry(
              'tuplet-remove',
              'Bỏ chùm',
              `Bỏ chùm: gộp cả chùm chứa nốt đang chọn về một nốt (giữ cao độ nốt đầu tiên có cao độ)${selectionHint}`,
              () => onTuplet({ kind: 'remove' }),
              needSelection,
            ),
          ],
        },
      ],
    },
    {
      id: 'symbols',
      title: 'Dấu hóa & nối',
      mod: 'soon',
      blocks: [
        {
          kind: 'icon',
          entries: SYMBOL_TOOLS.map((tool) => ({
            key: tool.op,
            text: `${tool.label} dấu hóa nối luyến lặng xóa sharp flat natural tie slur rest delete`,
            node: (
              <IconTool
                className="sv-tool"
                disabled={needSelection}
                onClick={() => onSymbol(tool.op)}
                title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ''}${selectionHint}`}
                icon={tool.icon}
                label={tool.label}
              />
            ),
          })),
        },
      ],
    },
    {
      id: 'articulation',
      title: 'Dấu nhấn & kỹ thuật',
      mod: 'soon',
      blocks: [{ kind: 'text', entries: markEntries(ARTICULATION_OPS) }],
    },
    {
      id: 'ornament',
      title: 'Hoa mỹ',
      mod: 'soon',
      blocks: [{ kind: 'text', entries: markEntries(ORNAMENT_OPS) }],
    },
    {
      id: 'dynamics',
      title: 'Sắc thái',
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
        { kind: 'text', sub: 'Pedal & quãng tám', entries: markEntries(PEDAL_OPS) },
      ],
    },
    {
      id: 'repeats',
      title: 'Lặp lại & chỉ dẫn',
      mod: 'soon',
      blocks: [{ kind: 'text', entries: markEntries(REPEAT_TOOLS.map((tool) => tool.op)) }],
    },
    {
      id: 'structure',
      title: 'Cấu trúc bài',
      mod: 'soon',
      blocks: [
        {
          kind: 'text',
          sub: 'Nhãn đoạn (đặt ở đầu ô đang chọn)',
          entries: markEntries(SECTION_TOOLS.map((tool) => tool.op)),
        },
        { kind: 'text', sub: 'Ngắt đoạn', entries: markEntries(BREAK_TOOLS.map((tool) => tool.op)) },
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
            placeholder="Nhãn tự đặt (ví dụ: Rap)"
            aria-label="Nhãn đoạn tự đặt"
          />
          <button
            type="submit"
            className="sv-tool sv-tool--text"
            disabled={needSelection || !sectionText.trim()}
            title={`Đặt nhãn tự đặt ở đầu ô đang chọn${selectionHint}`}
          >
            Đặt
          </button>
        </form>
      ),
    },
    {
      id: 'staves',
      title: 'Khuông nhạc',
      mod: 'soon',
      blocks: [
        {
          kind: 'text',
          entries: [
            textEntry(
              'addBass',
              'Thêm Fa (đàn)',
              'Thêm khuông Fa dưới khuông hiện tại: đàn hai khuông (khuông của nốt đang chọn, mặc định khuông đầu)',
              () => onStaves('addBass'),
              busy,
            ),
            textEntry(
              'addG',
              'Thêm khuông Sol',
              'Thêm một khuông riêng khóa Sol (ví dụ bè S/A) phía dưới cùng',
              () => onStaves('addG'),
              busy,
            ),
            textEntry(
              'addF',
              'Thêm khuông Fa',
              'Thêm một khuông riêng khóa Fa (ví dụ bè T/B) phía dưới cùng',
              () => onStaves('addF'),
              busy,
            ),
            textEntry(
              'addTenor',
              'Thêm khuông Tenor',
              'Thêm một khuông riêng khóa Sol số 8 dưới (bè Tenor trong SATB) phía dưới cùng',
              () => onStaves('addTenor'),
              busy,
            ),
            textEntry(
              'removeStaff',
              'Xóa khuông',
              'Xóa khuông của nốt đang chọn (khuông Fa của đàn, hoặc cả khuông riêng)',
              () => onStaves('remove'),
              needSelection,
            ),
            textEntry(
              'notation',
              'Khóa · Dấu hóa · Nhịp…',
              'Đổi khóa Sol/Fa/Đô, dấu hóa đầu khuông, chỉ số nhịp (kể cả đổi nhịp giữa bài và nhịp tự do)',
              onOpenNotation,
              needSelection,
            ),
          ],
        },
      ],
    },
    {
      id: 'measures',
      title: 'Ô nhịp',
      mod: 'soon',
      blocks: [
        {
          kind: 'text',
          entries: [
            textEntry(
              'insertAfter',
              'Thêm ô sau',
              'Thêm một ô nhịp trống sau ô đang chọn (không chọn gì: thêm vào cuối bài)',
              () => onMeasures('insertAfter'),
              busy,
            ),
            textEntry(
              'insertBefore',
              'Chèn ô trước',
              'Chèn một ô nhịp trống trước ô đang chọn',
              () => onMeasures('insertBefore'),
              needSelection,
            ),
            textEntry(
              'deleteMeasure',
              'Xóa ô nhịp',
              'Xóa các ô nhịp có nốt đang chọn (bấm Hoàn tác nếu lỡ tay)',
              () => onMeasures('delete'),
              needSelection,
            ),
          ],
        },
      ],
    },
    {
      id: 'voices',
      title: 'Viết bè',
      mod: 'soon',
      blocks: [
        {
          kind: 'text',
          entries: [
            textEntry(
              'chordBelow',
              'Bè thân ↓',
              'Bè cùng thân: thêm vào mỗi nốt đang chọn một nốt cùng trường độ, thấp hơn một quãng ba (hai nốt chung một thân)',
              () => onVoice('chordBelow'),
              needSelection,
            ),
            textEntry(
              'chordAbove',
              'Bè thân ↑',
              'Bè cùng thân: thêm nốt cùng trường độ, cao hơn một quãng ba',
              () => onVoice('chordAbove'),
              needSelection,
            ),
            textEntry(
              'blank',
              'Bè riêng',
              'Thêm một bè riêng (ô trống): bấm vào dấu lặng của bè mới để nhập nốt với nhịp điệu khác bè chính',
              () => onVoice('blank'),
              needSelection,
            ),
            textEntry(
              'addBelow',
              'Chép bè ↓',
              'Chép cả ô nhịp sang bè riêng thấp hơn một quãng ba, rồi sửa trường độ, cao độ từng nốt',
              () => onVoice('addBelow'),
              needSelection,
            ),
            textEntry(
              'addAbove',
              'Chép bè ↑',
              'Chép cả ô nhịp sang bè riêng cao hơn một quãng ba',
              () => onVoice('addAbove'),
              needSelection,
            ),
            textEntry(
              'cue',
              'Nốt nhỏ',
              'Bật/tắt hình nốt nhỏ cho các nốt đang chọn (thường dùng cho nốt bè)',
              () => onVoice('cue'),
              needSelection,
            ),
            textEntry(
              'removeVoice',
              'Xóa bè',
              'Xóa bè riêng chứa nốt đang chọn (bè chính không xóa được)',
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
            placeholder="Tìm ký hiệu (láy, fermata, lặp...)"
            aria-label="Tìm ký hiệu"
          />
        </div>

        {searching && visible.length === 0 && (
          <p className="sv-tools__empty" role="status">
            Không có ký hiệu nào khớp “{query.trim()}”.
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
