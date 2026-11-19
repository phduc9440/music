import { useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'react-toastify';
import Modal from '../scores/common/Modal';
import { errorMessage } from '../ui/helpers';
import { adminApi } from '../../services';
import type { Member, RoleItem } from '../../types';
import { roleName } from '../../utils/roles';
import { t } from '../../i18n/core';

const MIN_PASSWORD = 8;

interface Props {
  /** Người đang tạo: để biết vai trò nào vượt quyền của họ (SUPER_ADMIN gán được mọi vai trò trừ SUPER_ADMIN). */
  creator: Member;
  creatorIsSuper: boolean;
  /** Danh sách vai trò (đã bỏ SUPER_ADMIN); null khi chưa tải được, khi đó chỉ tạo được tài khoản USER. */
  roles: RoleItem[] | null;
  onClose: () => void;
  onCreated: (member: Member) => void;
}

/** Hộp thoại admin tạo tài khoản: tự đặt mật khẩu ban đầu và gán vai trò. */
export default function CreateMemberModal({ creator, creatorIsSuper, roles, onClose, onCreated }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const mine = new Set(creator.permissions ?? []);
  // Không phải SUPER_ADMIN thì chỉ gán vai trò có quyền nằm trọn trong quyền của mình (BE cũng chặn)
  const canAssign = (role: RoleItem) => creatorIsSuper || role.permissions.every((p) => mine.has(p));
  const assignable = (roles ?? []).filter((r) => r.name !== 'USER' && r.name !== 'SUPER_ADMIN');

  const toggle = (name: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const valid = email.trim().length > 0 && password.length >= MIN_PASSWORD;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError('');
    try {
      const res = await adminApi.createMember({
        email: email.trim(),
        password,
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        roles: [...chosen],
      });
      toast.success(t('admin.members.create.created', { email: res.data.result.email }));
      onCreated(res.data.result);
    } catch (err) {
      setError(errorMessage(err, t('admin.members.create.failed')));
      setSaving(false);
    }
  };

  return (
    <Modal title={t('admin.members.create.title')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="sc-label" htmlFor="cm-email">
          {t('admin.members.create.email')} *
        </label>
        <input
          id="cm-email"
          type="email"
          className="sc-input"
          value={email}
          maxLength={255}
          autoComplete="off"
          autoFocus
          required
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="sc-label" htmlFor="cm-password">
          {t('admin.members.create.password')} *
        </label>
        <div className="adm-password">
          <input
            id="cm-password"
            type={showPassword ? 'text' : 'password'}
            className="sc-input"
            value={password}
            autoComplete="new-password"
            required
            aria-describedby="cm-password-hint"
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="sc-btn"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? t('admin.members.create.hide') : t('admin.members.create.show')}
          </button>
        </div>
        <p id="cm-password-hint" className="tm-muted">
          {t('admin.members.create.passwordHint', { min: MIN_PASSWORD })}
        </p>

        <label className="sc-label" htmlFor="cm-name">
          {t('admin.members.create.fullName')}
        </label>
        <input
          id="cm-name"
          className="sc-input"
          value={fullName}
          maxLength={255}
          onChange={(e) => setFullName(e.target.value)}
        />

        <label className="sc-label" htmlFor="cm-phone">
          {t('admin.members.create.phone')}
        </label>
        <input
          id="cm-phone"
          type="tel"
          className="sc-input"
          value={phone}
          maxLength={30}
          onChange={(e) => setPhone(e.target.value)}
        />

        <fieldset className="adm-role-pick">
          <legend className="sc-label">{t('admin.members.create.roles')}</legend>
          <label className="sc-check">
            <input type="checkbox" checked disabled />
            <span>{t('admin.members.create.userAlways')}</span>
          </label>
          {assignable.map((role) => {
            const allowed = canAssign(role);
            return (
              <label
                key={role.id}
                className={`sc-check${allowed ? '' : ' is-disabled'}`}
                title={allowed ? undefined : t('admin.members.create.beyondYou')}
              >
                <input
                  type="checkbox"
                  checked={chosen.has(role.name)}
                  disabled={!allowed || saving}
                  onChange={() => toggle(role.name)}
                />
                <span>
                  {roleName(role)}
                  {!allowed && <span className="tm-muted"> · {t('admin.members.create.beyondYou')}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>

        {error && (
          <div className="sc-error" role="alert">
            {error}
          </div>
        )}
        <div className="sc-modal__actions">
          <button type="button" className="sc-btn" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="sc-btn sc-btn--primary" disabled={saving || !valid}>
            {t('admin.members.create.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
