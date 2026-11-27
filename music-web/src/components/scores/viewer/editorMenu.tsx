/**
 * Các mục của menu chuột phải trong trình chỉnh sửa. Tách khỏi trang để trang chỉ lo trạng thái mở/đóng: hàm ở đây
 * chỉ đọc tài liệu và gọi các lệnh có sẵn của {@link ScoreEditor}.
 */
import Icon from '../../ui/Icon';
import type { MenuItem } from '../../ui/ContextMenu';
import type { ScoreDocument } from '../../editor/core/ScoreDocument';
import type { ScoreEditor } from '../../editor/core/useScoreEditor';
import { chordKey } from '../../editor/core/commands';
import { describeSelection } from '../../editor/core/describe';
import { listAttachments } from '../../editor/notation/attachments';
import type { Attachment } from '../../editor/notation/attachments';
import { t } from '../../../i18n/core';
import { isMac } from '../../../utils/platform';

const MOD = isMac ? '⌘' : 'Ctrl';
const ALT = isMac ? '⌥' : 'Alt';

/** Biểu tượng chữ cho các ký hiệu âm nhạc (dùng ký tự Unicode thay cho icon nét). */
const glyph = (text: string) => <span className="ui-ctx__glyph">{text}</span>;

const ATTACH_ICON: Record<Attachment['kind'], string> = {
  mark: '·',
  line: '⌒',
  lyric: '¶',
  chord: '♯',
  dynamic: 'ƒ',
  text: 'T',
};

export interface EditorMenuContext {
  doc: ScoreDocument;
  editor: ScoreEditor;
  /** Id các nốt dưới con trỏ lúc bấm chuột phải (một đầu nốt, hoặc cả hợp âm); rỗng = bấm ra ngoài nốt. */
  hitIds: readonly string[];
  /** Ô nhịp (từ 0) của nốt được bấm. */
  measureIndex: number | null;
  canEdit: boolean;
  /** Mục góp ý (có thể null nếu người dùng không góp ý được). */
  comment: {
    disabledReason: string | null;
    threads: number;
    onComment: () => void;
    onShowThreads: () => void;
  } | null;
  playing: boolean;
  onPlay: () => void;
}

/** Tiêu đề nhỏ ở đầu menu: mô tả nốt / vùng đang chọn. */
export function editorMenuTitle(doc: ScoreDocument, selection: ReadonlySet<string>, measureIndex: number | null) {
  const text = describeSelection(doc, selection);
  if (text) return text;
  return measureIndex === null ? t('editor.ctx.scoreTitle') : t('editor.ctx.measureTitle', { n: measureIndex + 1 });
}

/** Dựng các mục menu chuột phải theo chỗ được bấm và quyền của người dùng. */
export function buildEditorMenu(ctx: EditorMenuContext): MenuItem[] {
  const { doc, editor, hitIds, measureIndex, canEdit, comment } = ctx;
  const items: MenuItem[] = [];
  const onNote = hitIds.length > 0;
  const hasSelection = editor.selection.size > 0;

  if (canEdit && onNote) {
    const hit = doc.getInfo(hitIds[0]);
    const chordMembers = hit ? doc.notes.filter((n) => chordKey(n) === chordKey(hit)) : [];
    const singleInChord = hitIds.length === 1 && chordMembers.length > 1;
    const restOnly = [...editor.selection].every((id) => doc.getInfo(id)?.isRest);

    if (singleInChord) {
      items.push(
        {
          id: 'delete-one',
          label: t('editor.ctx.deleteOne'),
          hint: t('editor.ctx.deleteOneHint'),
          icon: <Icon name="eraser" size={16} />,
          shortcut: 'Del',
          onSelect: () => editor.applySymbolTo(hitIds, 'delete'),
        },
        {
          id: 'delete-chord',
          label: t('editor.ctx.deleteChord'),
          icon: <Icon name="trash" size={16} />,
          danger: true,
          onSelect: () =>
            editor.applySymbolTo(
              chordMembers.map((n) => n.id),
              'delete',
            ),
        },
        {
          id: 'select-chord',
          label: t('editor.ctx.selectChord'),
          icon: <Icon name="layers" size={16} />,
          onSelect: () =>
            editor.select(
              chordMembers.map((n) => n.id),
              false,
            ),
        },
      );
    } else {
      items.push({
        id: 'delete',
        label: restOnly ? t('editor.ctx.deleteRest') : t('editor.ctx.delete'),
        hint: restOnly ? t('editor.ctx.deleteRestHint') : undefined,
        icon: <Icon name="trash" size={16} />,
        shortcut: 'Del',
        danger: true,
        onSelect: () => editor.applySymbol('delete'),
      });
    }
    if (!restOnly) {
      items.push({
        id: 'rest',
        label: t('editor.cmd.symbol.rest'),
        icon: <Icon name="rest" size={16} />,
        onSelect: () => editor.applySymbol('rest'),
      });
    }

    if (!restOnly) {
      items.push(
        { type: 'separator', id: 'sep-pitch' },
        {
          id: 'pitch',
          label: t('editor.ctx.pitch'),
          icon: <Icon name="arrowUp" size={16} />,
          children: [
            {
              id: 'stepUp',
              label: t('editor.ctx.stepUp'),
              icon: glyph('↑'),
              shortcut: '↑',
              onSelect: () => editor.applyPitch('stepUp'),
            },
            {
              id: 'stepDown',
              label: t('editor.ctx.stepDown'),
              icon: glyph('↓'),
              shortcut: '↓',
              onSelect: () => editor.applyPitch('stepDown'),
            },
            { type: 'separator', id: 'p-sep1' },
            {
              id: 'semiUp',
              label: t('editor.ctx.semitoneUp'),
              icon: glyph('♯'),
              shortcut: `${ALT}+↑`,
              onSelect: () => editor.applyPitch('semitoneUp'),
            },
            {
              id: 'semiDown',
              label: t('editor.ctx.semitoneDown'),
              icon: glyph('♭'),
              shortcut: `${ALT}+↓`,
              onSelect: () => editor.applyPitch('semitoneDown'),
            },
            { type: 'separator', id: 'p-sep2' },
            {
              id: 'octUp',
              label: t('editor.ctx.octaveUp'),
              icon: glyph('8↑'),
              shortcut: `${MOD}+↑`,
              onSelect: () => editor.applyPitch('octaveUp'),
            },
            {
              id: 'octDown',
              label: t('editor.ctx.octaveDown'),
              icon: glyph('8↓'),
              shortcut: `${MOD}+↓`,
              onSelect: () => editor.applyPitch('octaveDown'),
            },
          ],
        },
        {
          id: 'accidental',
          label: t('editor.ctx.accidental'),
          icon: glyph('♯'),
          children: [
            {
              id: 'sharp',
              label: t('editor.cmd.symbol.sharp'),
              icon: glyph('♯'),
              onSelect: () => editor.applySymbol('sharp'),
            },
            {
              id: 'flat',
              label: t('editor.cmd.symbol.flat'),
              icon: glyph('♭'),
              onSelect: () => editor.applySymbol('flat'),
            },
            {
              id: 'natural',
              label: t('editor.cmd.symbol.natural'),
              icon: glyph('♮'),
              onSelect: () => editor.applySymbol('natural'),
            },
          ],
        },
        {
          id: 'tie',
          label: t('editor.ctx.tie'),
          icon: glyph('‿'),
          shortcut: 'T',
          onSelect: () => editor.applySymbol('tie'),
        },
        {
          id: 'slur',
          label: t('editor.ctx.slur'),
          icon: glyph('⌒'),
          shortcut: 'S',
          disabled: editor.selection.size < 2,
          disabledReason: t('editor.failure.slurTarget'),
          onSelect: () => editor.applySymbol('slur'),
        },
        {
          id: 'voices',
          label: t('editor.ctx.voices'),
          icon: <Icon name="layers" size={16} />,
          children: [
            {
              id: 'chordAbove',
              label: t('editor.tool.text.chordAbove.label'),
              hint: t('editor.ctx.chordAboveHint'),
              onSelect: () => editor.editVoice('chordAbove'),
            },
            {
              id: 'chordBelow',
              label: t('editor.tool.text.chordBelow.label'),
              hint: t('editor.ctx.chordBelowHint'),
              onSelect: () => editor.editVoice('chordBelow'),
            },
            { type: 'separator', id: 'v-sep' },
            {
              id: 'addAbove',
              label: t('editor.tool.text.addAbove.label'),
              onSelect: () => editor.editVoice('addAbove'),
            },
            {
              id: 'addBelow',
              label: t('editor.tool.text.addBelow.label'),
              onSelect: () => editor.editVoice('addBelow'),
            },
            { id: 'blank', label: t('editor.tool.text.blank.label'), onSelect: () => editor.editVoice('blank') },
            { type: 'separator', id: 'v-sep2' },
            {
              id: 'removeVoice',
              label: t('editor.tool.text.removeVoice.label'),
              danger: true,
              onSelect: () => editor.editVoice('remove'),
            },
          ],
        },
      );
    }

    // Ký hiệu đang gắn ở nốt được bấm: xoá riêng từng cái
    const attached = listAttachments(doc, hitIds[0]);
    if (attached.length > 0) {
      const removeItems: MenuItem[] = attached.map((a) => ({
        id: `att-${a.key}`,
        label: t('editor.ctx.removeAttachment', { name: a.label }),
        icon: glyph(ATTACH_ICON[a.kind]),
        onSelect: () => editor.removeAttachment(hitIds[0], a.key),
      }));
      items.push({ type: 'separator', id: 'sep-att' });
      if (removeItems.length <= 4) {
        items.push({ type: 'header', id: 'att-head', label: t('editor.ctx.attachedHeader') }, ...removeItems);
      } else {
        items.push({
          id: 'attachments',
          label: t('editor.ctx.attachedMenu', { count: attached.length }),
          icon: <Icon name="eraser" size={16} />,
          children: removeItems,
        });
      }
    }
  }

  if (canEdit) {
    items.push(
      { type: 'separator', id: 'sep-measure' },
      {
        id: 'measure',
        label: measureIndex === null ? t('editor.ctx.measures') : t('editor.ctx.measureN', { n: measureIndex + 1 }),
        icon: <Icon name="select" size={16} />,
        children: [
          ...(measureIndex !== null
            ? [
                {
                  id: 'selectMeasure',
                  label: t('editor.ctx.selectMeasure'),
                  onSelect: () => editor.selectMeasure(measureIndex),
                } as MenuItem,
                { type: 'separator', id: 'm-sep' } as MenuItem,
              ]
            : []),
          {
            id: 'insertBefore',
            label: t('editor.tool.text.insertBefore.label'),
            disabled: !hasSelection,
            onSelect: () => editor.editMeasures('insertBefore'),
          },
          {
            id: 'insertAfter',
            label: hasSelection ? t('editor.tool.text.insertAfter.label') : t('editor.ctx.appendMeasure'),
            onSelect: () => editor.editMeasures('insertAfter'),
          },
          { type: 'separator', id: 'm-sep2' },
          {
            id: 'deleteMeasure',
            label: t('editor.tool.text.deleteMeasure.label'),
            danger: true,
            disabled: !hasSelection,
            onSelect: () => editor.editMeasures('delete'),
          },
        ],
      },
    );
    if (!onNote) {
      items.push(
        {
          id: 'selectAll',
          label: t('editor.ctx.selectAll'),
          icon: <Icon name="select" size={16} />,
          shortcut: `${MOD}+A`,
          onSelect: editor.selectAll,
        },
        {
          id: 'input',
          label: editor.inputMode ? t('editor.ctx.inputOff') : t('editor.ctx.inputOn'),
          icon: <Icon name="pencil" size={16} />,
          onSelect: () => editor.setInputMode(!editor.inputMode),
        },
        {
          id: 'undo',
          label: t('editor.tool.undo'),
          icon: <Icon name="arrowDown" size={16} style={{ transform: 'rotate(90deg)' }} />,
          shortcut: `${MOD}+Z`,
          disabled: !editor.canUndo,
          onSelect: editor.undo,
        },
        {
          id: 'redo',
          label: t('editor.tool.redo'),
          icon: <Icon name="arrowDown" size={16} style={{ transform: 'rotate(-90deg)' }} />,
          shortcut: `${MOD}+Shift+Z`,
          disabled: !editor.canRedo,
          onSelect: editor.redo,
        },
      );
      if (hasSelection) {
        items.push({
          id: 'clear',
          label: t('editor.ctx.clearSelection'),
          icon: <Icon name="minus" size={16} />,
          shortcut: 'Esc',
          onSelect: editor.clearSelection,
        });
      }
    }
  }

  // Phát và góp ý: ai xem được cũng dùng được
  items.push(
    { type: 'separator', id: 'sep-play' },
    {
      id: 'play',
      label: ctx.playing
        ? t('editor.view.play.pause')
        : hasSelection
          ? t('editor.view.play.fromSelection')
          : t('editor.view.play.all'),
      icon: <Icon name="play" size={16} />,
      onSelect: ctx.onPlay,
    },
  );
  if (comment && (onNote || hasSelection)) {
    items.push({
      id: 'comment',
      label: t('scores.comments.contextComment'),
      icon: <Icon name="comment" size={16} />,
      shortcut: `${MOD}+${ALT}+M`,
      disabled: !!comment.disabledReason,
      disabledReason: comment.disabledReason ?? undefined,
      onSelect: comment.onComment,
    });
  }
  if (comment && comment.threads > 0 && measureIndex !== null) {
    items.push({
      id: 'threads',
      label: t('scores.comments.contextView', { measure: measureIndex + 1, count: comment.threads }),
      icon: <Icon name="inbox" size={16} />,
      onSelect: comment.onShowThreads,
    });
  }

  // Bỏ vạch ngăn thừa ở đầu, cuối và hai vạch liền nhau
  return items.filter((item, i, all) => {
    if (item.type !== 'separator') return true;
    if (i === 0 || i === all.length - 1) return false;
    return all[i + 1]?.type !== 'separator' && all[i - 1]?.type !== 'separator';
  });
}
