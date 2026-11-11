-- V9: ba gói mặc định (đề xuất ở mục 7.2). INSERT IGNORE theo code nên chạy lại không bị trùng; giá và hạn mức sửa trong
-- bảng plans, không viết cứng trong code.
INSERT IGNORE INTO plans (id, code, name, price_month, price_year, limits, sort_order)
VALUES
    (UUID(), 'FREE', 'Free', 0, 0,
     '{"omrPagesPerMonth":20,"omrConcurrent":1,"storageMb":200,"keptVersions":5,"exportsPerMonth":10,"collab":false,"team":false,"omrPriority":false}', 1),
    (UUID(), 'PRO', 'Pro', 99000, 990000,
     '{"omrPagesPerMonth":300,"omrConcurrent":3,"storageMb":5120,"keptVersions":20,"exportsPerMonth":null,"collab":true,"team":false,"omrPriority":true}', 2),
    (UUID(), 'TEAM', 'Team', 299000, 2990000,
     '{"omrPagesPerMonth":1000,"omrConcurrent":5,"storageMb":20480,"keptVersions":50,"exportsPerMonth":null,"collab":true,"team":true,"omrPriority":true}', 3);
