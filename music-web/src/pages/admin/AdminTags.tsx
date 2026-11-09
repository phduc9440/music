import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { adminApi } from '../../services';
import type { AdminTag } from '../../types';

const MAX_NAME = 50;

const errMsg = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;

/** Admin (mục 4.6): thêm, đổi tên, xóa thể loại (tag) của bản nhạc. */
export default function AdminTags() {
  const [tags, setTags] = useState<AdminTag[] | null>(null);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi
      .getTags()
      .then((res) => setTags(res.data.result))
      .catch(() => toast.error('Không tải được danh sách thể loại'));
  }, []);

  useEffect(load, [load]);

  const run = async (action: () => Promise<unknown>, okMsg: string, failMsg: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(okMsg);
      return true;
    } catch (error) {
      toast.error(errMsg(error, failMsg));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (await run(() => adminApi.createTag(name), 'Đã thêm thể loại', 'Không thêm được thể loại')) {
      setNewName('');
      load();
    }
  };

  const saveEdit = async (tag: AdminTag) => {
    const name = editName.trim();
    if (!name || name === tag.name) {
      setEditingId(null);
      return;
    }
    if (await run(() => adminApi.updateTag(tag.id, name), 'Đã đổi tên thể loại', 'Không đổi được tên')) {
      setEditingId(null);
      load();
    }
  };

  const remove = async (tag: AdminTag) => {
    const message =
      tag.scoreCount > 0
        ? `Xóa thể loại "${tag.name}"? Thể loại sẽ bị gỡ khỏi ${tag.scoreCount} bản nhạc đang dùng (bản nhạc vẫn được giữ).`
        : `Xóa thể loại "${tag.name}"?`;
    if (!window.confirm(message)) return;
    if (await run(() => adminApi.deleteTag(tag.id), 'Đã xóa thể loại', 'Không xóa được thể loại')) load();
  };

  const btn = { padding: '0.25rem 0.75rem', fontSize: '0.75rem' };

  return (
    <>
      <div className="adm-page-head">
        <div>
          <h1>Quản lý thể loại</h1>
          <p>{tags ? `${tags.length} thể loại` : 'Thể loại dùng để gắn nhãn và lọc bản nhạc'}</p>
        </div>
        <form onSubmit={add} className="d-flex gap-2">
          <input
            className="form-control"
            placeholder="Tên thể loại mới"
            maxLength={MAX_NAME}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !newName.trim()}>
            Thêm
          </button>
        </form>
      </div>

      <div className="adm-card">
        <div className="table-responsive">
          <table className="table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Tên thể loại</th>
                <th>Slug</th>
                <th>Số bản nhạc</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {tags?.map((t) => (
                <tr key={t.id}>
                  <td>
                    {editingId === t.id ? (
                      <input
                        className="form-control"
                        value={editName}
                        maxLength={MAX_NAME}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(t);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    ) : (
                      t.name
                    )}
                  </td>
                  <td>{t.slug}</td>
                  <td>{t.scoreCount}</td>
                  <td>
                    <div className="d-flex gap-2">
                      {editingId === t.id ? (
                        <>
                          <button className="btn btn-primary" style={btn} disabled={busy} onClick={() => saveEdit(t)}>
                            Lưu
                          </button>
                          <button className="btn" style={btn} onClick={() => setEditingId(null)}>
                            Hủy
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btn-primary"
                            style={btn}
                            disabled={busy}
                            onClick={() => {
                              setEditingId(t.id);
                              setEditName(t.name);
                            }}
                          >
                            Đổi tên
                          </button>
                          <button className="btn btn-danger" style={btn} disabled={busy} onClick={() => remove(t)}>
                            Xóa
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {tags && tags.length === 0 && (
                <tr>
                  <td colSpan={4}>Chưa có thể loại nào.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
