-- V2: seed data. Tai khoan admin van duoc ApplicationInitConfig tao (can ma hoa mat khau bang BCrypt).
INSERT IGNORE INTO roles (id, name) VALUES (UUID(), 'ADMIN');
INSERT IGNORE INTO roles (id, name) VALUES (UUID(), 'USER');
