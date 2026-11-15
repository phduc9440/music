import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import Modal from '../../components/scores/common/Modal';
import { Badge, Button, Card, Icon, PageHeader } from '../../components/ui';
import { errorMessage } from '../../components/ui/helpers';
import { useDialog } from '../../components/ui/dialog-context';
import { adminApi } from '../../services';
import { ADMIN_PERMISSION_GROUPS, ADMIN_PERMISSION_REQUIRES } from '../../types';
import type { AdminPermission, RoleItem } from '../../types';
import { t } from '../../i18n/core';
import { roleName } from '../../utils/roles';
import Skeleton from '../../components/ui/Skeleton';

type Draft = Record<string, AdminPermission[]>;

const ALL: AdminPermission[] = ADMIN_PERMISSION_GROUPS.flatMap((g) => g.permissions);

const sameSet = (a: AdminPermission[], b: AdminPermission[]) => a.length === b.length && a.every((p) => b.includes(p));

/** Quyền cần `p` (trực tiếp hoặc gián tiếp): bỏ tích `p` thì bỏ luôn các quyền này. */
function dependentsOf(p: AdminPermission): AdminPermission[] {
  const out = new Set<AdminPermission>();
  const visit = (x: AdminPermission) => {
    for (const q of ALL) {
      if (ADMIN_PERMISSION_REQUIRES[q]?.includes(x) && !out.has(q)) {
        out.add(q);
        visit(q);
      }
    }
  };
  visit(p);
  return [...out];
}

/** `p` cùng các quyền nó cần: tích `p` thì tích luôn các quyền này. */
function withRequired(p: AdminPermission): AdminPermission[] {
  const out = new Set<AdminPermission>([p]);
  const visit = (x: AdminPermission) => {
    for (const r of ADMIN_PERMISSION_REQUIRES[x] ?? []) {
      if (!out.has(r)) {
        out.add(r);
        visit(r);
      }
    }
  };
  visit(p);
  return [...out];
}

/** Quản trị > Vai trò (chỉ SUPER_ADMIN): thêm, sửa, xóa vai trò tài khoản và tích quyền quản trị cho từng vai trò. */
export default function AdminRoles() {
  const { confirm } = useDialog();
  const [roles, setRoles] = useState<RoleItem[] | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<RoleItem | 'new' | null>(null);

  const load = useCallback(() => {
    adminApi
      .getRoles()
      .then((res) => {
        setRoles(res.data.result);
        setDraft(Object.fromEntries(res.data.result.map((r) => [r.id, r.permissions])));
      })
      .catch((e) => toast.error(errorMessage(e, t('admin.roles.loadFailed'))));
  }, []);
  useEffect(load, [load]);

  const dirtyIds = useMemo(
    () => (roles ?? []).filter((r) => r.editable && draft[r.id] && !sameSet(draft[r.id], r.permissions)).map((r) => r.id),
    [roles, draft],
  );

  const toggle = (role: RoleItem, p: AdminPermission) => {
    setDraft((d) => {
      const current = new Set(d[role.id] ?? role.permissions);
      if (current.has(p)) {
        current.delete(p);
        dependentsOf(p).forEach((q) => current.delete(q));
      } else {
        withRequired(p).forEach((q) => current.add(q));
      }
      return { ...d, [role.id]: ALL.filter((x) => current.has(x)) };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const id of dirtyIds) {
        const role = roles!.find((r) => r.id === id)!;
        await adminApi.updateRole(id, {
          label: role.label ?? undefined,
          description: role.description,
          permissions: draft[id],
        });
      }
      toast.success(t('admin.roles.saved'));
      load();
    } catch (e) {
      toast.error(errorMessage(e, t('admin.roles.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (role: RoleItem) => {
    const ok = await confirm({
      title: t('admin.roles.deleteTitle', { name: roleName(role) }),
      message: role.memberCount > 0 ? t('admin.roles.deleteInUse', { count: role.memberCount }) : undefined,
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await adminApi.deleteRole(role.id);
      toast.success(t('admin.roles.deleted'));
      load();
    } catch (e) {
      toast.error(errorMessage(e, t('admin.roles.deleteFailed')));
    }
  };

  return (
    <>
      <PageHeader
        title={t('admin.menu.items.roles')}
        description={t('admin.roles.description')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            {t('admin.roles.add')}
          </Button>
        }
      />
      <Card flush>
        {!roles && <Skeleton lines={5} />}
        {roles && (
          <div className="adm-roles__scroll">
            <table className="adm-roles__table">
              <thead>
                <tr>
                  <th scope="col">{t('admin.roles.permission')}</th>
                  {roles.map((r) => (
                    <th key={r.id} scope="col">
                      <div className="adm-roles__head">
                        <strong>{roleName(r)}</strong>
                        {r.builtIn && <Badge tone="neutral">{t('admin.roles.builtInTag')}</Badge>}
                        <span className="adm-roles__count">{t('admin.roles.members', { count: r.memberCount })}</span>
                        {!r.builtIn && (
                          <span className="adm-roles__tools">
                            <Button size="sm" variant="ghost" icon="edit" title={t('admin.roles.editTitle')} onClick={() => setEditing(r)} />
                            <Button size="sm" variant="ghost" icon="trash" title={t('common.delete')} onClick={() => remove(r)} />
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ADMIN_PERMISSION_GROUPS.map((g) => (
                  <Fragment key={g.section}>
                    <tr className="adm-roles__section">
                      <th colSpan={roles.length + 1} scope="colgroup">
                        {t(`admin.menu.sections.${g.section}`)}
                      </th>
                    </tr>
                    {g.permissions.map((p) => {
                      const label = t(`admin.roles.permissions.${p}`);
                      return (
                        <tr key={p}>
                          <th scope="row">{label}</th>
                          {roles.map((r) => {
                            const on = (draft[r.id] ?? r.permissions).includes(p);
                            const changed = on !== r.permissions.includes(p);
                            return (
                              <td key={r.id} className={changed ? 'is-changed' : undefined}>
                                {r.editable ? (
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    disabled={saving}
                                    aria-label={`${roleName(r)}: ${label}`}
                                    onChange={() => toggle(r, p)}
                                  />
                                ) : on ? (
                                  <span className="adm-roles__yes" role="img" aria-label={t('admin.roles.always')}>
                                    <Icon name="check" size={16} />
                                  </span>
                                ) : (
                                  <span className="adm-roles__no" role="img" aria-label={t('admin.roles.no')}>
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {roles && (
          <div className="adm-roles__bar">
            <span className="adm-roles__note">{dirtyIds.length > 0 ? t('admin.roles.unsaved') : t('admin.roles.note')}</span>
            <Button disabled={saving || dirtyIds.length === 0} onClick={load}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={saving} disabled={dirtyIds.length === 0} onClick={save}>
              {t('admin.roles.save')}
            </Button>
          </div>
        )}
      </Card>
      {editing && (
        <RoleModal
          role={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function RoleModal({ role, onClose, onSaved }: { role?: RoleItem; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(role?.label ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (role) {
        await adminApi.updateRole(role.id, {
          label: label.trim(),
          description: description.trim() || null,
          permissions: role.permissions,
        });
      } else {
        await adminApi.createRole({ label: label.trim(), description: description.trim() || null, permissions: [] });
      }
      toast.success(role ? t('admin.roles.updated') : t('admin.roles.created'));
      onSaved();
    } catch (err) {
      setError(errorMessage(err, t('admin.roles.saveFailed')));
      setSaving(false);
    }
  };

  return (
    <Modal title={role ? t('admin.roles.editTitle') : t('admin.roles.addTitle')} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="sc-label" htmlFor="role-label">
          {t('admin.roles.nameLabel')}
        </label>
        <input
          id="role-label"
          className="sc-input"
          value={label}
          maxLength={100}
          autoFocus
          onChange={(e) => setLabel(e.target.value)}
        />
        <label className="sc-label" htmlFor="role-desc">
          {t('admin.roles.descriptionLabel')}
        </label>
        <input
          id="role-desc"
          className="sc-input"
          value={description}
          maxLength={255}
          onChange={(e) => setDescription(e.target.value)}
        />
        {!role && <p className="tm-muted">{t('admin.roles.createHint')}</p>}
        {error && <div className="sc-error">{error}</div>}
        <div className="sc-modal__actions">
          <button type="button" className="sc-btn" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={saving || label.trim().length < 2}>
            {t('admin.roles.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
