-- V2: vai trò. Tài khoản admin@music.com (SUPER_ADMIN) do ApplicationInitConfig tạo khi backend khởi động (cần mã hóa
-- mật khẩu bằng BCrypt), nên không seed ở đây.
INSERT IGNORE INTO roles (id, name) VALUES (UUID(), 'ADMIN');
INSERT IGNORE INTO roles (id, name) VALUES (UUID(), 'USER');
INSERT IGNORE INTO roles (id, name) VALUES (UUID(), 'SUPER_ADMIN');
