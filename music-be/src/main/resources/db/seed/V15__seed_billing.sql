-- V15: dữ liệu mẫu cho thanh toán (7.4), gói đã mua (7.3), xử phạt gói và báo cáo vi phạm bản nhạc (R5).
-- Trang "Doanh thu" của admin tính theo paid_at của đơn PAID / REFUNDED: các đơn rải trong 85 ngày gần nhất để biểu đồ có
-- dữ liệu. Số tiền khớp giá trong V9 (STUDENT 49.000 / 490.000, PRO 99.000 / 990.000, PREMIUM 199.000 / 1.990.000).
-- user@music.com giữ gói Free để demo hạn mức và nâng gói. INSERT IGNORE theo id cố định nên chạy lại không trùng.

-- ---------------------------------------------------------------------------------------------------- gói đã mua
INSERT IGNORE INTO subscriptions (id, member_id, plan_id, status, source, starts_at, expires_at, created_at)
VALUES
    ('seed-sub-pay-lan', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), (SELECT id FROM plans WHERE code = 'PRO'), 'ACTIVE', 'PAYMENT', NOW(6) - INTERVAL 85 DAY, NOW(6) + INTERVAL 5 DAY, NOW(6) - INTERVAL 85 DAY),
    ('seed-sub-pay-minh', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), (SELECT id FROM plans WHERE code = 'STUDENT'), 'ACTIVE', 'PAYMENT', NOW(6) - INTERVAL 70 DAY, NOW(6) + INTERVAL 20 DAY, NOW(6) - INTERVAL 70 DAY),
    ('seed-sub-pay-duy', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), (SELECT id FROM plans WHERE code = 'PREMIUM'), 'ACTIVE', 'PAYMENT', NOW(6) - INTERVAL 60 DAY, NOW(6) + INTERVAL 305 DAY, NOW(6) - INTERVAL 60 DAY),
    ('seed-sub-pay-an', (SELECT id FROM members WHERE email = 'an.vo@music.com'), (SELECT id FROM plans WHERE code = 'PRO'), 'EXPIRED', 'PAYMENT', NOW(6) - INTERVAL 75 DAY, NOW(6) - INTERVAL 45 DAY, NOW(6) - INTERVAL 75 DAY),
    ('seed-sub-pay-bao', (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), (SELECT id FROM plans WHERE code = 'PRO'), 'CANCELED', 'PAYMENT', NOW(6) - INTERVAL 30 DAY, NOW(6) - INTERVAL 28 DAY, NOW(6) - INTERVAL 30 DAY),
    ('seed-sub-pay-trang', (SELECT id FROM members WHERE email = 'trang.dang@music.com'), (SELECT id FROM plans WHERE code = 'STUDENT'), 'ACTIVE', 'PAYMENT', NOW(6) - INTERVAL 20 DAY, NOW(6) + INTERVAL 345 DAY, NOW(6) - INTERVAL 20 DAY),
    ('seed-sub-pay-huong', (SELECT id FROM members WHERE email = 'huong.le@music.com'), (SELECT id FROM plans WHERE code = 'PREMIUM'), 'ACTIVE', 'PAYMENT', NOW(6) - INTERVAL 5 DAY, NOW(6) + INTERVAL 25 DAY, NOW(6) - INTERVAL 5 DAY);

-- ---------------------------------------------------------------------------------------------------- đơn thanh toán
INSERT IGNORE INTO payment_orders
    (id, order_code, member_id, plan_id, period, kind, amount, provider, status, provider_txn_id, raw_payload, created_at, expires_at, paid_at)
VALUES
    -- Pro tháng của Lan: mua mới rồi gia hạn hai lần
    ('seed-pay-01', 'SEEDPAY0000000001', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), (SELECT id FROM plans WHERE code = 'PRO'), 'MONTH', 'NEW', 99000, 'VNPAY', 'PAID', 'SEEDTXN0001', NULL, NOW(6) - INTERVAL 85 DAY, NOW(6) - INTERVAL 85 DAY + INTERVAL 15 MINUTE, NOW(6) - INTERVAL 85 DAY + INTERVAL 3 MINUTE),
    ('seed-pay-02', 'SEEDPAY0000000002', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), (SELECT id FROM plans WHERE code = 'PRO'), 'MONTH', 'RENEW', 99000, 'VNPAY', 'PAID', 'SEEDTXN0002', NULL, NOW(6) - INTERVAL 55 DAY, NOW(6) - INTERVAL 55 DAY + INTERVAL 15 MINUTE, NOW(6) - INTERVAL 55 DAY + INTERVAL 2 MINUTE),
    ('seed-pay-03', 'SEEDPAY0000000003', (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), (SELECT id FROM plans WHERE code = 'PRO'), 'MONTH', 'RENEW', 99000, 'VNPAY', 'PAID', 'SEEDTXN0003', NULL, NOW(6) - INTERVAL 25 DAY, NOW(6) - INTERVAL 25 DAY + INTERVAL 15 MINUTE, NOW(6) - INTERVAL 25 DAY + INTERVAL 4 MINUTE),
    -- Student tháng của Minh
    ('seed-pay-04', 'SEEDPAY0000000004', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), (SELECT id FROM plans WHERE code = 'STUDENT'), 'MONTH', 'NEW', 49000, 'VNPAY', 'PAID', 'SEEDTXN0004', NULL, NOW(6) - INTERVAL 70 DAY, NOW(6) - INTERVAL 70 DAY + INTERVAL 15 MINUTE, NOW(6) - INTERVAL 70 DAY + INTERVAL 5 MINUTE),
    ('seed-pay-05', 'SEEDPAY0000000005', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), (SELECT id FROM plans WHERE code = 'STUDENT'), 'MONTH', 'RENEW', 49000, 'VNPAY', 'PAID', 'SEEDTXN0005', NULL, NOW(6) - INTERVAL 40 DAY, NOW(6) - INTERVAL 40 DAY + INTERVAL 15 MINUTE, NOW(6) - INTERVAL 40 DAY + INTERVAL 1 MINUTE),
    ('seed-pay-06', 'SEEDPAY0000000006', (SELECT id FROM members WHERE email = 'minh.tran@music.com'), (SELECT id FROM plans WHERE code = 'STUDENT'), 'MONTH', 'RENEW', 49000, 'VNPAY', 'PAID', 'SEEDTXN0006', NULL, NOW(6) - INTERVAL 10 DAY, NOW(6) - INTERVAL 10 DAY + INTERVAL 15 MINUTE, NOW(6) - INTERVAL 10 DAY + INTERVAL 3 MINUTE),
    -- Premium năm của Duy
    ('seed-pay-07', 'SEEDPAY0000000007', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), (SELECT id FROM plans WHERE code = 'PREMIUM'), 'YEAR', 'NEW', 1990000, 'VNPAY', 'PAID', 'SEEDTXN0007', NULL, NOW(6) - INTERVAL 60 DAY, NOW(6) - INTERVAL 60 DAY + INTERVAL 15 MINUTE, NOW(6) - INTERVAL 60 DAY + INTERVAL 6 MINUTE),
    -- An mua Pro một tháng, lần gia hạn bị lỗi nên gói đã hết hạn
    ('seed-pay-08', 'SEEDPAY0000000008', (SELECT id FROM members WHERE email = 'an.vo@music.com'), (SELECT id FROM plans WHERE code = 'PRO'), 'MONTH', 'NEW', 99000, 'VNPAY', 'PAID', 'SEEDTXN0008', NULL, NOW(6) - INTERVAL 75 DAY, NOW(6) - INTERVAL 75 DAY + INTERVAL 15 MINUTE, NOW(6) - INTERVAL 75 DAY + INTERVAL 2 MINUTE),
    ('seed-pay-09', 'SEEDPAY0000000009', (SELECT id FROM members WHERE email = 'an.vo@music.com'), (SELECT id FROM plans WHERE code = 'PRO'), 'MONTH', 'RENEW', 99000, 'VNPAY', 'FAILED', NULL, NULL, NOW(6) - INTERVAL 44 DAY, NOW(6) - INTERVAL 44 DAY + INTERVAL 15 MINUTE, NULL),
    -- Bảo mua Pro rồi được hoàn tiền (gói bị thu hồi, xem plan_sanctions)
    ('seed-pay-10', 'SEEDPAY0000000010', (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), (SELECT id FROM plans WHERE code = 'PRO'), 'MONTH', 'NEW', 99000, 'VNPAY', 'REFUNDED', 'SEEDTXN0010', NULL, NOW(6) - INTERVAL 30 DAY, NOW(6) - INTERVAL 30 DAY + INTERVAL 15 MINUTE, NOW(6) - INTERVAL 30 DAY + INTERVAL 2 MINUTE),
    -- Student năm của Trang (có thêm gói team ở V10)
    ('seed-pay-11', 'SEEDPAY0000000011', (SELECT id FROM members WHERE email = 'trang.dang@music.com'), (SELECT id FROM plans WHERE code = 'STUDENT'), 'YEAR', 'NEW', 490000, 'VNPAY', 'PAID', 'SEEDTXN0011', NULL, NOW(6) - INTERVAL 20 DAY, NOW(6) - INTERVAL 20 DAY + INTERVAL 15 MINUTE, NOW(6) - INTERVAL 20 DAY + INTERVAL 7 MINUTE),
    -- Premium tháng của Hương, mới mua tuần này
    ('seed-pay-12', 'SEEDPAY0000000012', (SELECT id FROM members WHERE email = 'huong.le@music.com'), (SELECT id FROM plans WHERE code = 'PREMIUM'), 'MONTH', 'NEW', 199000, 'VNPAY', 'PAID', 'SEEDTXN0012', NULL, NOW(6) - INTERVAL 5 DAY, NOW(6) - INTERVAL 5 DAY + INTERVAL 15 MINUTE, NOW(6) - INTERVAL 5 DAY + INTERVAL 2 MINUTE),
    -- Đơn bỏ dở (quá 15 phút chưa trả)
    ('seed-pay-13', 'SEEDPAY0000000013', (SELECT id FROM members WHERE email = 'nam.do@music.com'), (SELECT id FROM plans WHERE code = 'PRO'), 'MONTH', 'NEW', 99000, 'VNPAY', 'EXPIRED', NULL, NULL, NOW(6) - INTERVAL 15 DAY, NOW(6) - INTERVAL 15 DAY + INTERVAL 15 MINUTE, NULL),
    ('seed-pay-14', 'SEEDPAY0000000014', (SELECT id FROM members WHERE email = 'user@music.com'), (SELECT id FROM plans WHERE code = 'PRO'), 'MONTH', 'NEW', 99000, 'VNPAY', 'EXPIRED', NULL, NULL, NOW(6) - INTERVAL 3 DAY, NOW(6) - INTERVAL 3 DAY + INTERVAL 15 MINUTE, NULL);

-- ---------------------------------------------------------------------------------------------------- xử phạt gói
-- created_by để NULL được: SUPER_ADMIN (admin@music.com) do ứng dụng tạo lúc khởi động, có thể chưa có khi seed chạy
INSERT IGNORE INTO plan_sanctions (id, member_id, type, plan_id, subscription_id, starts_at, ends_at, reason, created_by, lifted_at, created_at)
VALUES
    ('seed-sanction-revoke-bao', (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), 'REVOKE', (SELECT id FROM plans WHERE code = 'PRO'), 'seed-sub-pay-bao', NOW(6) - INTERVAL 28 DAY, NULL, 'Hoàn tiền theo yêu cầu của khách', (SELECT id FROM members WHERE email = 'admin@music.com'), NULL, NOW(6) - INTERVAL 28 DAY),
    ('seed-sanction-ban-khoa', (SELECT id FROM members WHERE email = 'khoa.bui@music.com'), 'BAN', (SELECT id FROM plans WHERE code = 'PRO'), NULL, NOW(6) - INTERVAL 2 DAY, NOW(6) + INTERVAL 28 DAY, 'Chia sẻ tài khoản trả phí cho nhiều người', (SELECT id FROM members WHERE email = 'admin@music.com'), NULL, NOW(6) - INTERVAL 2 DAY);

-- ---------------------------------------------------------------------------------------------------- báo cáo bản nhạc
INSERT IGNORE INTO content_reports (id, target_type, score_id, reporter_id, reason, details, status, action, resolution_note, resolved_by, resolved_at, created_at)
VALUES
    ('seed-report-score-1', 'SCORE', (SELECT id FROM scores WHERE title = 'Turkish March' AND deleted_at IS NULL LIMIT 1), (SELECT id FROM members WHERE email = 'lan.nguyen@music.com'), 'COPYRIGHT', 'Bản này giống hệt bản in của một nhà xuất bản, có ghi bản quyền ở chân trang.', 'PENDING', NULL, NULL, NULL, NULL, NOW(6) - INTERVAL 9 HOUR),
    ('seed-report-score-2', 'SCORE', (SELECT id FROM scores WHERE title = 'Canon in D' AND deleted_at IS NULL LIMIT 1), (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), 'INAPPROPRIATE', 'Tiêu đề không đúng nội dung.', 'DISMISSED', 'DISMISS', 'Đã kiểm tra: tiêu đề và nội dung khớp nhau.', (SELECT id FROM members WHERE email = 'admin2@music.com'), NOW(6) - INTERVAL 3 DAY, NOW(6) - INTERVAL 4 DAY);
