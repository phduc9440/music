import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Badge, Button, Card, PageHeader, Table, TableState } from '../../components/ui';
import { errorMessage } from '../../components/ui/helpers';
import { adminApi } from '../../services';
import type { AdminTag } from '../../types';
import { useDialog } from '../../components/ui/dialog-context';
import { t, t as tr } from '../../i18n/core';

const MAX_NAME = 50;

/** Admin (mục 4.6): thêm, đổi tên, xóa thể loại (tag) của bản nhạc. */
export default function AdminTags() {
  const { confirm } = useDialog();
  const [tags, setTags] = useState<AdminTag[] | null>(null);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi
      .getTags()
      .then((res) => setTags(res.data.result))
      .catch(() => toast.error(t('admin.tags.loadFailed')));
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
    if (await run(() => adminApi.createTag(name), t('admin.tags.added'), t('admin.tags.addFailed'))) {
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
    if (await run(() => adminApi.updateTag(tag.id, name), t('admin.tags.renamed'), t('admin.tags.renameFailed'))) {
      setEditingId(null);
      load();
    }
  };

  const remove = async (tag: AdminTag) => {
    const ok = await confirm({
      title: t('admin.tags.deleteTitle', { name: tag.name }),
      message: tag.scoreCount > 0 ? t('admin.tags.deleteMessage', { count: tag.scoreCount }) : undefined,
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    if (await run(() => adminApi.deleteTag(tag.id), t('admin.tags.deleted'), t('admin.tags.deleteFailed'))) load();
  };

  return (
    <>
      <PageHeader
        title={t('scores.explore.tag')}
        description={tags ? t('admin.tags.count', { count: tags.length }) : t('admin.tags.subtitle')}
        actions={
          <form onSubmit={add} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              className="adm-input"
              style={{ minWidth: 240 }}
              placeholder={t('admin.tags.newName')}
              aria-label={t('admin.tags.newName')}
              maxLength={MAX_NAME}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button type="submit" variant="primary" icon="plus" disabled={busy || !newName.trim()}>
              {t('scores.playlistPicker.add')}
            </Button>
          </form>
        }
      />

      <Card flush>
        <Table minWidth={640}>
          <thead>
            <tr>
              <th>{t('admin.tags.name')}</th>
              <th>Slug</th>
              <th className="adm-table__num">{t('admin.tags.scoreCount')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
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
                      aria-label={tr('admin.tags.newNameFor', { name: t.name })}
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
                          {tr('common.save')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          {tr('common.cancel')}
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
                          {tr('admin.tags.rename')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="trash"
                          aria-label={tr('admin.tags.deleteOne', { name: t.name })}
                          title={tr('common.delete')}
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
              <TableState
                colSpan={4}
                icon="tag"
                title={t('admin.tags.emptyTitle')}
                description={t('admin.tags.emptyHint')}
              />
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
