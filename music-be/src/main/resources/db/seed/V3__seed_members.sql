-- V3: seed member. Tai khoan admin@music.com do ApplicationInitConfig tao khi app khoi dong, nen khong seed o day.
-- Mat khau mac dinh la 12345678 (BCrypt) - hay doi sau khi deploy!
INSERT IGNORE INTO members (id, email, password_hash, full_name, status, email_verified, auth_provider)
VALUES
    (UUID(), 'user@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Demo User', 1, 1, 1);

INSERT IGNORE INTO member_roles (id, member_id, role_id)
SELECT UUID(), m.id, r.id
FROM members m
JOIN roles r ON r.name = 'USER'
WHERE m.email = 'user@music.com';
