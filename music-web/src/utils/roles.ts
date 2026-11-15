import { hasKey, t } from '../i18n/core';
import type { RoleItem } from '../types';

/** Tên hiển thị của vai trò tài khoản: vai trò có sẵn dùng nhãn dịch, vai trò tự tạo dùng tên người tạo đặt. */
export const roleName = (r: Pick<RoleItem, 'name' | 'label'>) =>
  r.label || (hasKey(`admin.roles.builtIn.${r.name}`) ? t(`admin.roles.builtIn.${r.name}`) : r.name);
