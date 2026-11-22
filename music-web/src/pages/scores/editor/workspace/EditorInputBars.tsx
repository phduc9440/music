import ChordBar from '../../../../components/scores/toolbar/ChordBar';
import LyricBar from '../../../../components/scores/toolbar/LyricBar';
import NotationModal from '../../../../components/scores/toolbar/NotationModal';
import { readNotation } from '../../../../components/editor/structure/staves';
import type { ScoreDocument } from '../../../../components/editor/core/ScoreDocument';
import type { ScoreEditor } from '../../../../components/editor/core/useScoreEditor';

interface Props {
  doc: ScoreDocument;
  editor: ScoreEditor;
  notationOpen: boolean;
  onCloseNotation: () => void;
}

/** Thanh nhập hợp âm, thanh nhập lời và hộp thoại khóa nhạc / dấu hóa / nhịp tại vùng chọn (chỉ người sửa được). */
export default function EditorInputBars({ doc, editor, notationOpen, onCloseNotation }: Props) {
  const selectedId = [...editor.selection][0] ?? null;
  // Đọc đầu khuông tại vùng chọn; chưa chọn nốt nào thì không hiện hộp thoại
  const notation = notationOpen ? readNotation(doc, [...editor.selection]) : null;
  return (
    <>
      {notation && (
        <NotationModal
          info={notation}
          onApply={(change) => {
            editor.editNotation(change);
            onCloseNotation();
          }}
          onClose={onCloseNotation}
        />
      )}
      {editor.chordMode && (
        <ChordBar
          doc={doc}
          revision={editor.revision}
          selectedId={selectedId}
          onEnter={editor.enterChord}
          onMove={editor.moveChord}
          onPaste={editor.pasteChordText}
          onExit={() => editor.setInputMode(false)}
        />
      )}
      {editor.lyricMode && (
        <LyricBar
          doc={doc}
          revision={editor.revision}
          selectedId={selectedId}
          verse={editor.lyricVerse}
          onVerseChange={editor.setLyricVerse}
          onEnter={editor.enterLyric}
          onMove={editor.moveLyric}
          onPaste={editor.pasteLyricsText}
          onExit={() => editor.setInputMode(false)}
        />
      )}
    </>
  );
}
