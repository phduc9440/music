-- V2: vai trò. Tài khoản admin@music.com (SUPER_ADMIN) do ApplicationInitConfig tạo khi backend khởi động (cần mã hóa
-- mật khẩu bằng BCrypt), nên không seed ở đây.
INSERT IGNORE INTO roles (id, name) VALUES (UUID(), 'ADMIN');
INSERT IGNORE INTO roles (id, name) VALUES (UUID(), 'USER');
INSERT IGNORE INTO roles (id, name) VALUES (UUID(), 'SUPER_ADMIN');

-- Quyền mặc định của ADMIN (AdminPermission.adminDefaults): mọi quyền quản trị trừ cấp / cấm gói và sửa gói dịch vụ
INSERT IGNORE INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
CROSS JOIN (
    SELECT 'DASHBOARD_VIEW' AS permission
    UNION ALL SELECT 'MEMBERS_VIEW'
    UNION ALL SELECT 'MEMBERS_LOCK'
    UNION ALL SELECT 'TEAMS_MANAGE'
    UNION ALL SELECT 'ANNOUNCEMENTS_SEND'
    UNION ALL SELECT 'SCORES_MODERATE'
    UNION ALL SELECT 'SCORES_APPROVE'
    UNION ALL SELECT 'OFFICIAL_LIBRARY'
    UNION ALL SELECT 'TAGS_MANAGE'
    UNION ALL SELECT 'COMPOSERS_MANAGE'
    UNION ALL SELECT 'REVENUE_VIEW'
    UNION ALL SELECT 'PAYMENTS_REFUND'
    UNION ALL SELECT 'AI_TASKS_MANAGE'
    UNION ALL SELECT 'SYSTEM_MONITOR'
    UNION ALL SELECT 'REPORTS_MODERATE'
    UNION ALL SELECT 'AUDIT_VIEW'
) p
WHERE r.name = 'ADMIN';
