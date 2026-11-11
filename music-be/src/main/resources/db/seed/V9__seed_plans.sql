-- V9: các gói mặc định, chia hai nhóm (mục 7.2). INSERT IGNORE theo code nên chạy lại không bị trùng; giá và hạn mức
-- sửa trong bảng plans, không viết cứng trong code. Số null trong limits = không giới hạn.
--   Cá nhân (PERSONAL): FREE < PRO < PREMIUM
--   Team    (TEAM):     TEAM_PRO < TEAM_PREMIUM (hạn mức dùng chung cho cả team)
-- Quản trị viên (ADMIN) luôn có quyền lợi gói PRO không thời hạn; SUPER_ADMIN không giới hạn và không cần mua gói
-- (xử lý trong SubscriptionServiceImpl, không cần dòng nào ở đây).
INSERT IGNORE INTO plans (id, code, name, audience, price_month, price_year, limits, sort_order)
VALUES
    (UUID(), 'FREE', 'Free', 'PERSONAL', 0, 0,
     '{"omrPagesPerMonth":20,"omrConcurrent":1,"storageMb":200,"keptVersions":5,"exportsPerMonth":10,"collab":false,"team":false,"omrPriority":false}', 1),
    (UUID(), 'PRO', 'Pro', 'PERSONAL', 99000, 990000,
     '{"omrPagesPerMonth":300,"omrConcurrent":3,"storageMb":5120,"keptVersions":20,"exportsPerMonth":null,"collab":true,"team":false,"omrPriority":true}', 2),
    (UUID(), 'PREMIUM', 'Premium', 'PERSONAL', 199000, 1990000,
     '{"omrPagesPerMonth":1000,"omrConcurrent":5,"storageMb":20480,"keptVersions":50,"exportsPerMonth":null,"collab":true,"team":false,"omrPriority":true}', 3),
    (UUID(), 'TEAM_PRO', 'Team Pro', 'TEAM', 299000, 2990000,
     '{"omrPagesPerMonth":1000,"omrConcurrent":5,"storageMb":20480,"keptVersions":50,"exportsPerMonth":null,"collab":true,"team":true,"omrPriority":true}', 4),
    (UUID(), 'TEAM_PREMIUM', 'Team Premium', 'TEAM', 599000, 5990000,
     '{"omrPagesPerMonth":3000,"omrConcurrent":8,"storageMb":51200,"keptVersions":100,"exportsPerMonth":null,"collab":true,"team":true,"omrPriority":true}', 5);
