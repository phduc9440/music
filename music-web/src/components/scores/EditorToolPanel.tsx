interface Props {
  /** Chỉ dùng cho Mobile: bảng công cụ đang mở dạng bottom sheet. */
  open: boolean;
  onClose: () => void;
}

interface ToolDef {
  icon: string;
  label: string;
}

interface ToolGroup {
  title: string;
  /** Nhánh sẽ làm công cụ này, hiện trong tooltip. */
  branch: string;
  tools: ToolDef[];
}

const GROUPS: ToolGroup[] = [
  {
    title: 'Chế độ',
    branch: 'editor-pitch / editor-note-input',
    tools: [
      { icon: '↖', label: 'Chọn' },
      { icon: '✎', label: 'Nhập nốt' },
    ],
  },
  {
    title: 'Trường độ',
    branch: 'editor-duration',
    tools: [
      { icon: '𝅝', label: 'Tròn' },
      { icon: '𝅗𝅥', label: 'Trắng' },
      { icon: '♩', label: 'Đen' },
      { icon: '♪', label: 'Móc đơn' },
      { icon: '𝅘𝅥𝅯', label: 'Móc kép' },
    ],
  },
  {
    title: 'Ký hiệu',
    branch: 'editor-symbols',
    tools: [
      { icon: '♯', label: 'Thăng' },
      { icon: '♭', label: 'Giáng' },
      { icon: '♮', label: 'Bình' },
      { icon: '·', label: 'Chấm dôi' },
      { icon: '𝄽', label: 'Dấu lặng' },
      { icon: '⌫', label: 'Xóa' },
    ],
  },
];

/**
 * Bảng công cụ chỉnh sửa (đặc tả 1.17): Desktop ở bên trái, iPad thu thành thanh dưới đáy, Mobile mở dạng
 * bottom sheet. Bản này chỉ xem nên mọi công cụ bị khóa; các nhánh editor-* sẽ bật dần. Chỉ hiện khi canEdit.
 */
export default function EditorToolPanel({ open, onClose }: Props) {
  return (
    <>
      {open && <div className="sv-sheet-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={`sv-tools${open ? ' is-open' : ''}`} aria-label="Công cụ chỉnh sửa">
        <div className="sv-tools__head">
          <strong>Công cụ chỉnh sửa</strong>
          <button className="sc-btn sc-btn--sm sv-tools__close" onClick={onClose}>
            Đóng
          </button>
        </div>
        <p className="sv-tools__note">Sẽ có ở các bản sau. Hiện bạn chỉ xem được bản nhạc.</p>
        {GROUPS.map((group) => (
          <div key={group.title} className="sv-tools__group">
            <div className="sv-tools__title">{group.title}</div>
            <div className="sv-tools__row">
              {group.tools.map((tool) => (
                <button
                  key={tool.label}
                  className="sv-tool"
                  disabled
                  title={`${tool.label} (sẽ có ở nhánh ${group.branch})`}
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
        ))}
      </aside>
    </>
  );
}
