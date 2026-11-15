import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import Icon from '../../components/ui/Icon';
import Skeleton from '../../components/ui/Skeleton';
import { teamApi } from '../../services';
import { CONFIGURABLE_TEAM_ROLES, TEAM_PERMISSION_REQUIRES, TEAM_PERMISSIONS } from '../../types';
import type { ConfigurableTeamRole, Team, TeamPermission, TeamPermissionTable, TeamRole } from '../../types';
import { t } from '../../i18n/core';
import { getErrorMessage } from '../../utils/score';

type Draft = Record<ConfigurableTeamRole, TeamPermission[]>;

const COLUMNS: TeamRole[] = ['OWNER', ...CONFIGURABLE_TEAM_ROLES];

/** Các quyền cần `p` (trực tiếp hoặc gián tiếp): bỏ tích `p` thì bỏ luôn các quyền này. */
function dependentsOf(p: TeamPermission): TeamPermission[] {
  const out = new Set<TeamPermission>();
  const visit = (x: TeamPermission) => {
    for (const q of TEAM_PERMISSIONS) {
      if (TEAM_PERMISSION_REQUIRES[q]?.includes(x) && !out.has(q)) {
        out.add(q);
        visit(q);
      }
    }
  };
  visit(p);
  return [...out];
}

/** `p` cùng các quyền nó cần (đệ quy): tích `p` thì tích luôn các quyền này. */
function withRequired(p: TeamPermission): TeamPermission[] {
  const out = new Set<TeamPermission>([p]);
  const visit = (x: TeamPermission) => {
    for (const r of TEAM_PERMISSION_REQUIRES[x] ?? []) {
      if (!out.has(r)) {
        out.add(r);
        visit(r);
      }
    }
  };
  visit(p);
  return [...out];
}

const sameSet = (a: TeamPermission[], b: TeamPermission[]) => a.length === b.length && a.every((p) => b.includes(p));

/**
 * Bảng "Mỗi vai trò làm được gì" của team (thu gọn sẵn, tô cột vai trò của người đang xem). Chủ nhóm tích / bỏ tích quyền
 * của Quản lý, Người phối, Người xem rồi bấm Lưu; người khác chỉ xem. Cột chủ nhóm và hai hàng cố định không chỉnh được.
 */
export default function RolePermissions({ team, onSaved }: { team: Team; onSaved?: () => void }) {
  const [table, setTable] = useState<TeamPermissionTable | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    teamApi
      .permissions(team.id)
      .then((res) => {
        setTable(res.data.result);
        setDraft(res.data.result.roles);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [team.id]);
  useEffect(load, [load]);

  const editable = !!table?.editable;
  const dirty = useMemo(
    () => !!table && !!draft && CONFIGURABLE_TEAM_ROLES.some((r) => !sameSet(draft[r], table.roles[r])),
    [table, draft],
  );
  const isDefault = useMemo(
    () => !!table && !!draft && CONFIGURABLE_TEAM_ROLES.every((r) => sameSet(draft[r], table.defaults[r])),
    [table, draft],
  );

  const toggle = (role: ConfigurableTeamRole, p: TeamPermission) => {
    setDraft((d) => {
      if (!d) return d;
      const current = new Set(d[role]);
      if (current.has(p)) {
        current.delete(p);
        dependentsOf(p).forEach((q) => current.delete(q));
      } else {
        withRequired(p).forEach((q) => current.add(q));
      }
      return { ...d, [role]: TEAM_PERMISSIONS.filter((x) => current.has(x)) };
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await teamApi.updatePermissions(team.id, draft);
      setTable(res.data.result);
      setDraft(res.data.result.roles);
      toast.success(t('teams.permissions.saved'));
      onSaved?.();
    } catch (err) {
      toast.error(getErrorMessage(err, t('teams.permissions.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const yes = (label: string) => (
    <span className="tm-perms__yes" role="img" aria-label={label}>
      <Icon name="check" size={16} />
    </span>
  );
  const no = (
    <span className="tm-perms__no" role="img" aria-label={t('teams.permissions.no')}>
      —
    </span>
  );
  const mine = (r: TeamRole) => (r === team.myRole ? 'is-mine' : undefined);

  /** Hàng cố định (không chỉnh được): `who` = các vai trò luôn được. */
  const fixedRow = (key: string, who: TeamRole[]) => (
    <tr key={key} className="tm-perms__fixed">
      <th scope="row">{t(`teams.permissions.rows.${key}`)}</th>
      {COLUMNS.map((r) => (
        <td key={r} className={mine(r)}>
          {who.includes(r) ? yes(t('teams.permissions.always')) : no}
        </td>
      ))}
    </tr>
  );

  return (
    <details className="tm-perms">
      <summary>{editable ? t('teams.permissions.titleEditable') : t('teams.permissions.title')}</summary>
      {failed && <p className="tm-muted tm-perms__msg">{t('teams.permissions.loadFailed')}</p>}
      {!failed && (!table || !draft) && (
        <div className="tm-perms__msg">
          <Skeleton lines={3} />
        </div>
      )}
      {table && draft && (
        <>
          {editable && <p className="tm-muted tm-perms__msg">{t('teams.permissions.ownerHint')}</p>}
          <div className="tm-perms__scroll">
            <table className="tm-perms__table">
              <thead>
                <tr>
                  <th scope="col">{t('teams.permissions.action')}</th>
                  {COLUMNS.map((r) => (
                    <th key={r} scope="col" className={mine(r)}>
                      {t(`teams.roles.${r}`)}
                      {r === team.myRole && <span className="tm-perms__mine">{t('teams.permissions.yourRole')}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fixedRow('ownerOnly', ['OWNER'])}
                {TEAM_PERMISSIONS.map((p) => {
                  const label = t(`teams.permissions.rows.${p}`);
                  return (
                    <tr key={p}>
                      <th scope="row">{label}</th>
                      <td className={mine('OWNER')}>{yes(t('teams.permissions.always'))}</td>
                      {CONFIGURABLE_TEAM_ROLES.map((r) => {
                        const on = draft[r].includes(p);
                        const changed = on !== table.roles[r].includes(p);
                        return (
                          <td key={r} className={[mine(r), changed ? 'is-changed' : ''].filter(Boolean).join(' ')}>
                            {editable ? (
                              <input
                                type="checkbox"
                                className="tm-perms__check"
                                checked={on}
                                disabled={saving}
                                aria-label={t('teams.permissions.toggle', { role: t(`teams.roles.${r}`), permission: label })}
                                onChange={() => toggle(r, p)}
                              />
                            ) : on ? (
                              yes(t('teams.permissions.yes'))
                            ) : (
                              no
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {fixedRow('view', COLUMNS)}
              </tbody>
            </table>
          </div>
          {editable && (
            <div className="tm-perms__actions">
              <button
                type="button"
                className="sc-btn sc-btn--sm"
                disabled={saving || isDefault}
                onClick={() => setDraft(table.defaults)}
              >
                {t('teams.permissions.reset')}
              </button>
              {dirty && <span className="tm-muted tm-perms__unsaved">{t('teams.permissions.unsaved')}</span>}
              <button
                type="button"
                className="sc-btn sc-btn--sm"
                disabled={saving || !dirty}
                onClick={() => setDraft(table.roles)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="sc-btn sc-btn--sm sc-btn--primary"
                disabled={saving || !dirty}
                onClick={save}
              >
                {t('teams.permissions.save')}
              </button>
            </div>
          )}
          <p className="tm-muted tm-perms__msg">{t('teams.permissions.note')}</p>
        </>
      )}
    </details>
  );
}
