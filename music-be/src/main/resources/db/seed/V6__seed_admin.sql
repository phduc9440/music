-- V6: seed them 1 tai khoan ADMIN (khong phai SUPER_ADMIN: SUPER_ADMIN chi la admin@music.com do ApplicationInitConfig tao).
-- Mat khau mac dinh la 12345678 (BCrypt, giong V3) - hay doi sau khi deploy!
INSERT IGNORE INTO members (id, email, password_hash, full_name, status, email_verified, auth_provider)
VALUES
    (UUID(), 'admin2@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Demo Admin', 1, 1, 1);

INSERT IGNORE INTO member_roles (id, member_id, role_id)
SELECT UUID(), m.id, r.id
FROM members m
JOIN roles r ON r.name IN ('ADMIN', 'USER')
WHERE m.email = 'admin2@music.com';
