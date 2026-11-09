import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Badge, Button, Card, PageHeader, Table, TableState } from '../../components/ui';
import { errorMessage } from '../../components/ui/helpers';
import { adminApi } from '../../services';
import type { AdminTag } from '../../types';

const MAX_NAME = 50;

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
      toast.error(errorMessage(error, failMsg));
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

  return (
    <>
      <PageHeader
        title="Thể loại"
        description={tags ? `${tags.length} thể loại dùng để gắn nhãn và lọc bản nhạc` : 'Thể loại dùng để gắn nhãn và lọc bản nhạc'}
        actions={
          <form onSubmit={add} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className="adm-input"
              style={{ minWidth: 240 }}
              placeholder="Tên thể loại mới"
              aria-label="Tên thể loại mới"
              maxLength={MAX_NAME}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button type="submit" variant="primary" icon="plus" disabled={busy || !newName.trim()}>
              Thêm
            </Button>
          </form>
        }
      />

      <Card flush>
        <Table minWidth={640}>
          <thead>
            <tr>
              <th>Tên thể loại</th>
              <th>Slug</th>
              <th className="adm-table__num">Số bản nhạc</th>
              <th className="adm-table__actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {!tags && <TableState colSpan={4} loading />}
            {tags?.map((t) => (
              <tr key={t.id}>
                <td>
                  {editingId === t.id ? (
                    <input
                      className="adm-input"
                      value={editName}
                      maxLength={MAX_NAME}
                      aria-label={`Tên mới cho ${t.name}`}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(t);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <span style={{ fontWeight: 500 }}>{t.name}</span>
                  )}
                </td>
                <td>
                  <span className="adm-code">{t.slug}</span>
                </td>
                <td className="adm-table__num">
                  <Badge tone={t.scoreCount > 0 ? 'primary' : 'neutral'}>{t.scoreCount}</Badge>
                </td>
                <td className="adm-table__actions">
                  <div className="adm-table__actions-inner">
                    {editingId === t.id ? (
                      <>
                        <Button size="sm" variant="primary" icon="check" disabled={busy} onClick={() => saveEdit(t)}>
                          Lưu
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Hủy
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(t.id);
                            setEditName(t.name);
                          }}
                        >
                          Đổi tên
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="trash"
                          aria-label={`Xóa ${t.name}`}
                          title="Xóa"
                          disabled={busy}
                          onClick={() => remove(t)}
                        />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {tags && tags.length === 0 && (
              <TableState colSpan={4} icon="tag" title="Chưa có thể loại nào" description="Thêm thể loại đầu tiên ở ô phía trên." />
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
