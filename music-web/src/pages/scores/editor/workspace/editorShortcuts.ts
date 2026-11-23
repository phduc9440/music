import { t } from '../../../../i18n/core';
import { isMac } from '../../../../utils/platform';

export const MOD = isMac ? '⌘' : 'Ctrl';
export const ALT = isMac ? '⌥' : 'Alt';

/** Danh sách phím tắt trong hộp thoại "Phím tắt" (mở bằng phím ?): dựng lúc hiển thị để đổi ngôn ngữ có hiệu lực ngay. */
export const editShortcuts = (): [string, string][] => [
  [t('editor.view.help.select.keys'), t('editor.view.help.select.desc')],
  [t('editor.view.help.head.keys'), t('editor.view.help.head.desc')],
  [t('editor.view.help.context.keys'), t('editor.view.help.context.desc')],
  [t('editor.view.help.drag.keys'), t('editor.view.help.drag.desc')],
  ['Tab / Shift + Tab', t('editor.view.help.tab.desc')],
  [`${MOD} + A`, t('editor.view.help.selectAll.desc')],
  ['[  /  ]', t('editor.view.help.chord.desc')],
  ['↑ / ↓', t('editor.view.help.step.desc')],
  [`${ALT} + ↑ / ↓`, t('editor.view.help.semitone.desc')],
  [`${MOD} + ↑ / ↓`, t('editor.view.help.octave.desc')],
  [`${MOD} + Z`, t('editor.view.help.undo.desc')],
  [t('editor.view.help.redo.keys', { mod: MOD }), t('editor.view.help.redo.desc')],
  [`${MOD} + S`, t('editor.view.help.save.desc')],
  ['1 – 7', t('editor.view.help.duration.desc')],
  ['.', t('editor.view.help.dot.desc')],
  [`${MOD} + 3`, t('editor.view.help.tuplet.desc')],
  [t('editor.view.help.clickStaff.keys'), t('editor.view.help.clickStaff.desc')],
  [t('editor.view.help.dragDuration.keys'), t('editor.view.help.dragDuration.desc')],
  [t('editor.view.help.letters.keys'), t('editor.view.help.letters.desc')],
  [t('editor.view.help.header.keys'), t('editor.view.help.header.desc')],
  [t('editor.view.help.lyricMode.keys'), t('editor.view.help.lyricMode.desc')],
  [t('editor.view.help.chordMode.keys'), t('editor.view.help.chordMode.desc')],
  [t('editor.view.help.staves.keys'), t('editor.view.help.staves.desc')],
  [t('editor.view.help.measures.keys'), t('editor.view.help.measures.desc')],
  [t('editor.view.help.voices.keys'), t('editor.view.help.voices.desc')],
  [t('editor.view.help.dynamics.keys'), t('editor.view.help.dynamics.desc')],
  [t('editor.view.help.repeats.keys'), t('editor.view.help.repeats.desc')],
  ['T', t('editor.view.help.tie.desc')],
  ['S', t('editor.view.help.slur.desc')],
  ['Delete', t('editor.view.help.delete.desc')],
];

/** Phím tắt xếp cuối hộp thoại, sau các phím tắt Góp ý: dựng lúc hiển thị để đổi ngôn ngữ có hiệu lực ngay. */
export const endShortcuts = (): [string, string][] => [
  ['Esc', t('editor.view.help.esc.desc')],
  ['+  /  -  /  0', t('editor.view.help.zoom.desc')],
  ['?', t('editor.view.help.help.desc')],
];

/** Phím tắt Góp ý (mục 4.2): dựng lúc hiển thị để đổi ngôn ngữ có hiệu lực ngay. */
export const commentShortcuts = (): [string, string][] => [
  [t('scores.comments.helpSelectKeys'), t('scores.comments.helpSelectText')],
  [t('scores.comments.helpContextKeys'), t('scores.comments.helpContextText')],
  [`${MOD} + ${ALT} + M`, t('scores.comments.helpPanelText')],
];
