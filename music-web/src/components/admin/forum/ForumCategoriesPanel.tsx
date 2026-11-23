import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import Modal from '../../scores/common/Modal';
import { Badge, Button, Card, CellTitle, Table, TableState } from '../../ui';
import { useDialog } from '../../ui/dialog-context';
import { errorMessage } from '../../ui/helpers';
import { adminForumApi } from '../../../services';
import type { AdminForumCategory } from '../../../types';
import { t } from '../../../i18n/core';

const MAX_NAME = 100;
const MAX_DESCRIPTION = 300;

/** Tab Chuyên mục của trang quản lý diễn đàn: thêm, sửa, đổi thứ tự, xóa (chỉ xóa được chuyên mục trống). */
export default function ForumCategoriesPanel() {
  const { confirm } = useDialog();
  const [list, setList] = useState<AdminForumCategory[] | null>(null);
  const [editing, setEditing] = useState<AdminForumCategory | 'new' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList((await adminForumApi.categories()).data.result);
    } catch (err) {
      toast.error(errorMessage(err, t('admin.forum.loadFailed')));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const move = async (index: number, delta: -1 | 1) => {
    if (!list || busy) return;
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    setList(next); // hiện ngay, lỗi thì nạp lại
    setBusy(true);
    try {
      await adminForumApi.reorderCategories(next.map((c) => c.id));
    } catch (err) {
      toast.error(errorMessage(err, t('admin.forum.actionFailed')));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: AdminForumCategory) => {
    const ok = await confirm({
      title: t('admin.forum.categories.deleteTitle', { name: c.name }),
      message: t('admin.forum.categories.deleteText'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await adminForumApi.deleteCategory(c.id);
      toast.success(t('admin.forum.categories.deleted'));
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('admin.forum.actionFailed')));
    }
  };

  return (
    <>
      <div className="af-bar">
        <p className="adm-muted">{t('admin.forum.categories.hint')}</p>
        <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
          {t('admin.forum.categories.add')}
        </Button>
      </div>

      <Card flush>
        <Table minWidth={720}>
          <thead>
            <tr>
              <th style={{ width: 84 }}>{t('admin.forum.categories.order')}</th>
              <th>{t('admin.forum.categories.name')}</th>
              <th>{t('admin.forum.categories.threads')}</th>
              <th className="adm-table__actions">{t('scores.files.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {!list && <TableState colSpan={4} loading />}
            {list?.map((c, i) => (
              <tr key={c.id}>
                <td>
                  <span className="af-order">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="chevronUp"
                      aria-label={t('admin.forum.categories.up')}
                      disabled={busy || i === 0}
                      onClick={() => move(i, -1)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="chevronDown"
                      aria-label={t('admin.forum.categories.down')}
                      disabled={busy || i === list.length - 1}
                      onClick={() => move(i, 1)}
                    />
                  </span>
                </td>
                <td>
                  <CellTitle
                    sub={
                      c.description || <span className="adm-muted">{t('admin.forum.categories.noDescription')}</span>
                    }
                  >
                    {c.name}
                  </CellTitle>
                  <span className="adm-muted af-slug">/{c.slug}</span>
                </td>
                <td>
                  <strong>{c.threadCount}</strong>
                  {c.hiddenThreadCount > 0 && (
                    <>
                      {' '}
                      <Badge tone="neutral">
                        {t('admin.forum.categories.hiddenCount', { count: c.hiddenThreadCount })}
                      </Badge>
                    </>
                  )}
                </td>
                <td className="adm-table__actions">
                  <Button size="sm" icon="edit" onClick={() => setEditing(c)}>
                    {t('common.edit')}
                  </Button>{' '}
                  <Button
                    size="sm"
                    variant="danger"
                    icon="trash"
                    disabled={c.threadCount > 0}
                    title={c.threadCount > 0 ? t('admin.forum.categories.notEmpty') : undefined}
                    onClick={() => remove(c)}
                  >
                    {t('common.delete')}
                  </Button>
                </td>
              </tr>
            ))}
            {list && list.length === 0 && (
              <TableState
                colSpan={4}
                icon="inbox"
                title={t('admin.forum.categories.emptyTitle')}
                description={t('admin.forum.categories.emptyHint')}
              />
            )}
          </tbody>
        </Table>
      </Card>

      {editing && (
        <CategoryModal
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function CategoryModal({
  category,
  onClose,
  onSaved,
}: {
  category: AdminForumCategory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = name.trim().length >= 2;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = { name: name.trim(), description: description.trim() || undefined };
      if (category) await adminForumApi.updateCategory(category.id, payload);
      else await adminForumApi.createCategory(payload);
      toast.success(t(category ? 'admin.forum.categories.saved' : 'admin.forum.categories.created'));
      onSaved();
    } catch (err) {
      setError(errorMessage(err, t('admin.forum.actionFailed')));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t(category ? 'admin.forum.categories.editTitle' : 'admin.forum.categories.addTitle')}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="sc-label" htmlFor="fc-name">
          {t('admin.forum.categories.name')}
          <span className="sc-counter">
            {name.length}/{MAX_NAME}
          </span>
        </label>
        <input
          id="fc-name"
          className="sc-input"
          value={name}
          maxLength={MAX_NAME}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <label className="sc-label" htmlFor="fc-desc" style={{ marginTop: '0.75rem' }}>
          {t('admin.forum.categories.description')}
          <span className="sc-counter">
            {description.length}/{MAX_DESCRIPTION}
          </span>
        </label>
        <textarea
          id="fc-desc"
          className="sc-input"
          rows={3}
          value={description}
          maxLength={MAX_DESCRIPTION}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && <div className="sc-error">{error}</div>}
        <div className="sc-modal__actions">
          <button type="button" className="sc-btn" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={!valid || busy}>
            {t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
