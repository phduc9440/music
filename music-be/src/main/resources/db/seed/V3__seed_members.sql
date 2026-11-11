-- V3: thành viên mẫu. Mật khẩu mặc định của mọi tài khoản là 12345678 (BCrypt), hãy đổi sau khi deploy!
-- Có sẵn: 1 admin thường (admin2), 1 tài khoản bị khóa (khoa.bui), 1 tài khoản Google (mai.ngo), 1 tài khoản chưa
-- xác thực email (nam.do). Ngày đăng ký rải trong 70 ngày gần nhất để biểu đồ tăng trưởng của admin có dữ liệu.
INSERT IGNORE INTO members
    (id, email, password_hash, full_name, phone, address, status, email_verified, auth_provider, created_at, last_login_at, ui_theme)
SELECT UUID(), t.email, t.password_hash, t.full_name, t.phone, t.address, t.status, t.email_verified, t.auth_provider,
       t.created_at, t.last_login_at, t.ui_theme
FROM (
    SELECT 'user@music.com' AS email, '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2' AS password_hash, 'Demo User' AS full_name, '0901234567' AS phone, 'Cầu Giấy, Hà Nội' AS address, 1 AS status, 1 AS email_verified, 1 AS auth_provider, NOW(6) - INTERVAL 62 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE AS created_at, NOW(6) - INTERVAL 0 DAY - INTERVAL 0 HOUR - INTERVAL 20 MINUTE AS last_login_at, 'LIGHT' AS ui_theme
    UNION ALL SELECT 'admin2@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Demo Admin', '0902345678', 'Đống Đa, Hà Nội', 1, 1, 1, NOW(6) - INTERVAL 70 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE, NOW(6) - INTERVAL 0 DAY - INTERVAL 0 HOUR - INTERVAL 20 MINUTE, 'DARK'
    UNION ALL SELECT 'lan.nguyen@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Nguyễn Thị Lan', '0912345001', 'Hai Bà Trưng, Hà Nội', 1, 1, 1, NOW(6) - INTERVAL 58 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE, NOW(6) - INTERVAL 0 DAY - INTERVAL 0 HOUR - INTERVAL 20 MINUTE, 'LIGHT'
    UNION ALL SELECT 'minh.tran@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Trần Quang Minh', '0912345002', 'Quận 1, TP. Hồ Chí Minh', 1, 1, 1, NOW(6) - INTERVAL 51 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE, NOW(6) - INTERVAL 1 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, 'DARK'
    UNION ALL SELECT 'huong.le@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Lê Thu Hương', '0912345003', 'Hải Châu, Đà Nẵng', 1, 1, 1, NOW(6) - INTERVAL 44 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE, NOW(6) - INTERVAL 2 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, NULL
    UNION ALL SELECT 'duy.pham@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Phạm Khánh Duy', '0912345004', 'Ninh Kiều, Cần Thơ', 1, 1, 1, NOW(6) - INTERVAL 37 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE, NOW(6) - INTERVAL 0 DAY - INTERVAL 0 HOUR - INTERVAL 20 MINUTE, 'SYSTEM'
    UNION ALL SELECT 'an.vo@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Võ Hoài An', '0912345005', 'Thanh Xuân, Hà Nội', 1, 1, 1, NOW(6) - INTERVAL 29 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE, NOW(6) - INTERVAL 3 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, 'LIGHT'
    UNION ALL SELECT 'bao.hoang@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Hoàng Gia Bảo', '0912345006', 'Thủ Đức, TP. Hồ Chí Minh', 1, 1, 1, NOW(6) - INTERVAL 21 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE, NOW(6) - INTERVAL 1 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, 'DARK'
    UNION ALL SELECT 'trang.dang@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Đặng Thùy Trang', '0912345007', 'Lê Chân, Hải Phòng', 1, 1, 1, NOW(6) - INTERVAL 14 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE, NOW(6) - INTERVAL 0 DAY - INTERVAL 0 HOUR - INTERVAL 20 MINUTE, NULL
    UNION ALL SELECT 'khoa.bui@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Bùi Anh Khoa', '0912345008', 'Biên Hòa, Đồng Nai', 2, 1, 1, NOW(6) - INTERVAL 40 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE, NOW(6) - INTERVAL 12 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, NULL
    UNION ALL SELECT 'mai.ngo@music.com', NULL, 'Ngô Thanh Mai', NULL, NULL, 1, 1, 2, NOW(6) - INTERVAL 9 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE, NOW(6) - INTERVAL 2 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, 'LIGHT'
    UNION ALL SELECT 'nam.do@music.com', '$2a$10$IOqk9vtmlQg2V9Ywx3Tjw.9GV4iSotLNntxVZdr6ly6agGU.E9EC2', 'Đỗ Hoàng Nam', NULL, NULL, 1, 0, 1, NOW(6) - INTERVAL 4 DAY - INTERVAL 3 HOUR - INTERVAL 10 MINUTE, NOW(6) - INTERVAL 4 DAY - INTERVAL 1 HOUR - INTERVAL 5 MINUTE, NULL
) t;

INSERT IGNORE INTO member_roles (id, member_id, role_id)
SELECT UUID(), m.id, r.id
FROM (
    SELECT 'user@music.com' AS email, 'USER' AS role
    UNION ALL SELECT 'admin2@music.com', 'ADMIN'
    UNION ALL SELECT 'admin2@music.com', 'USER'
    UNION ALL SELECT 'lan.nguyen@music.com', 'USER'
    UNION ALL SELECT 'minh.tran@music.com', 'USER'
    UNION ALL SELECT 'huong.le@music.com', 'USER'
    UNION ALL SELECT 'duy.pham@music.com', 'USER'
    UNION ALL SELECT 'an.vo@music.com', 'USER'
    UNION ALL SELECT 'bao.hoang@music.com', 'USER'
    UNION ALL SELECT 'trang.dang@music.com', 'USER'
    UNION ALL SELECT 'khoa.bui@music.com', 'USER'
    UNION ALL SELECT 'mai.ngo@music.com', 'USER'
    UNION ALL SELECT 'nam.do@music.com', 'USER'
) t
JOIN members m ON m.email = t.email
JOIN roles r ON r.name = t.role;
