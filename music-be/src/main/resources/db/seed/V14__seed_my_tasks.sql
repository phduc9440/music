-- V14: dữ liệu mẫu cho "Việc của tôi" (mục 4.1) của user@music.com (Demo User): bài được giao phối / duyệt ở hai nhóm, đủ các
-- mức hạn (quá hạn, sắp tới hạn, trong tuần, còn xa, chưa có hạn), bài bị trả lại, bài đã duyệt (không tính là việc) và
-- thông báo giao việc / nhắc hạn. File riêng, không sửa V10, để DB đã chạy V10 vẫn migrate được (không lệch checksum).
-- Id cố định (seed-...) và INSERT IGNORE nên chạy lại không bị trùng. Hạn tính từ ngày chạy seed (CURDATE).
--   Nhóm 1 "Ban nhạc Sao Mai" (user là QUẢN LÝ), buổi diễn mới seed-show-6 "Tiệc cuối năm công ty" với 7 bài:
--     item-10 Canon in D        user phối      hạn -3 ngày (QUÁ HẠN)   đang phối
--     item-11 Swan Lake         user phối      hạn +1 ngày (SẮP TỚI HẠN) chưa làm
--     item-12 Tình ca           user duyệt     hạn +2 ngày (SẮP TỚI HẠN) chờ duyệt
--     item-13 Hungarian Rhapsody user phối     chưa có hạn              chưa làm
--     item-14 Diễm xưa          user phối      hạn +5 ngày (TRONG TUẦN)  đang phối, đã bị trả lại kèm góp ý
--     item-15 Thiên Thai        user duyệt     hạn +15 ngày (CÒN XA)     chưa làm
--     item-16 Prelude in C      user phối      đã duyệt (không hiện ở Việc của tôi, vẫn hiện khi lọc "chỉ bài của tôi")
--   Nhóm 2 "Hợp xướng Thanh Xuân" (user mới vào, vai trò NGƯỜI PHỐI), buổi diễn có sẵn seed-show-4:
--     item-17 Eine kleine Nachtmusik user phối +4 ngày; item-18 Minuet in G user duyệt +12 ngày.
-- Cùng với bài duyệt sẵn ở V10 (seed-item-1..3, 5), user có 11 việc đang mở (và 2 bài đã duyệt) trải trên hai nhóm và ba buổi diễn.

-- user@music.com vào nhóm 2 với vai trò người phối
INSERT IGNORE INTO team_members (id, team_id, kind, member_id, role, joined_at, created_at)
VALUES
    ('seed-tm-2-4', 'seed-team-2', 'MEMBER', (SELECT id FROM members WHERE email = 'user@music.com'), 'ARRANGER', NOW(6) - INTERVAL 12 DAY, NOW(6) - INTERVAL 12 DAY);

-- Bản nhạc đưa vào nhóm để có bài cho buổi diễn (chủ giữ nguyên, chỉ gắn team_id)
UPDATE scores SET team_id = 'seed-team-1' WHERE member_id = (SELECT id FROM members WHERE email = 'an.vo@music.com') AND title = 'Diễm xưa' AND team_id IS NULL;
UPDATE scores SET team_id = 'seed-team-1' WHERE member_id = (SELECT id FROM members WHERE email = 'huong.le@music.com') AND title = 'Thiên Thai' AND team_id IS NULL;
UPDATE scores SET team_id = 'seed-team-1' WHERE member_id = (SELECT id FROM members WHERE email = 'duy.pham@music.com') AND title = 'Prelude in C major (BWV 846)' AND team_id IS NULL;
UPDATE scores SET team_id = 'seed-team-2' WHERE member_id = (SELECT id FROM members WHERE email = 'trang.dang@music.com') AND title = 'Eine kleine Nachtmusik (K. 525)' AND team_id IS NULL;
UPDATE scores SET team_id = 'seed-team-2' WHERE member_id = (SELECT id FROM members WHERE email = 'bao.hoang@music.com') AND title = 'Minuet in G major' AND team_id IS NULL;

INSERT IGNORE INTO shows (id, team_id, name, show_date, venue, notes, status, created_by, created_at, updated_at, deleted_at, deleted_by)
VALUES
    ('seed-show-6', 'seed-team-1', 'Tiệc cuối năm công ty', CURDATE() + INTERVAL 9 DAY, 'Khách sạn Thăng Long, Hà Nội', 'Set 30 phút, nhạc nhẹ cho khách đến sớm.', 'PREPARING', (SELECT id FROM members WHERE email = 'huong.le@music.com'), NOW(6) - INTERVAL 8 DAY, NOW(6) - INTERVAL 1 DAY, NULL, NULL);

INSERT IGNORE INTO show_items (id, show_id, score_id, position, arranger_id, reviewer_id, due_date, status, notes, review_note, created_at, updated_at)
VALUES
    ('seed-item-10', 'seed-show-6', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'huong.le@music.com') AND title = 'Canon in D' AND deleted_at IS NULL LIMIT 1), 1,
        (SELECT id FROM members WHERE email = 'user@music.com'), (SELECT id FROM members WHERE email = 'huong.le@music.com'), CURDATE() - INTERVAL 3 DAY, 'ARRANGING', 'Đoạn giữa viết lại cho guitar solo.', NULL, NOW(6) - INTERVAL 7 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-11', 'seed-show-6', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'huong.le@music.com') AND title = 'Swan Lake - Theme' AND deleted_at IS NULL LIMIT 1), 2,
        (SELECT id FROM members WHERE email = 'user@music.com'), (SELECT id FROM members WHERE email = 'an.vo@music.com'), CURDATE() + INTERVAL 1 DAY, 'TODO', NULL, NULL, NOW(6) - INTERVAL 7 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-12', 'seed-show-6', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'duy.pham@music.com') AND title = 'Tình ca' AND deleted_at IS NULL LIMIT 1), 3,
        (SELECT id FROM members WHERE email = 'an.vo@music.com'), (SELECT id FROM members WHERE email = 'user@music.com'), CURDATE() + INTERVAL 2 DAY, 'IN_REVIEW', 'Bản piano solo, nhịp chậm.', NULL, NOW(6) - INTERVAL 7 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-13', 'seed-show-6', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'an.vo@music.com') AND title = 'Hungarian Rhapsody No. 2' AND deleted_at IS NULL LIMIT 1), 4,
        (SELECT id FROM members WHERE email = 'user@music.com'), (SELECT id FROM members WHERE email = 'huong.le@music.com'), NULL, 'TODO', 'Chưa chốt hạn, rút gọn còn 3 phút.', NULL, NOW(6) - INTERVAL 6 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-14', 'seed-show-6', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'an.vo@music.com') AND title = 'Diễm xưa' AND deleted_at IS NULL LIMIT 1), 5,
        (SELECT id FROM members WHERE email = 'user@music.com'), (SELECT id FROM members WHERE email = 'huong.le@music.com'), CURDATE() + INTERVAL 5 DAY, 'ARRANGING', NULL, 'Điệp khúc cần giữ nhịp 3/4, đừng chuyển sang 4/4. Phối lại đoạn nối giữa hai khổ.', NOW(6) - INTERVAL 6 DAY, NOW(6) - INTERVAL 2 DAY),
    ('seed-item-15', 'seed-show-6', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'huong.le@music.com') AND title = 'Thiên Thai' AND deleted_at IS NULL LIMIT 1), 6,
        (SELECT id FROM members WHERE email = 'duy.pham@music.com'), (SELECT id FROM members WHERE email = 'user@music.com'), CURDATE() + INTERVAL 15 DAY, 'TODO', NULL, NULL, NOW(6) - INTERVAL 5 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-16', 'seed-show-6', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'duy.pham@music.com') AND title = 'Prelude in C major (BWV 846)' AND deleted_at IS NULL LIMIT 1), 7,
        (SELECT id FROM members WHERE email = 'user@music.com'), (SELECT id FROM members WHERE email = 'huong.le@music.com'), CURDATE() - INTERVAL 1 DAY, 'APPROVED', 'Mở màn, đã chốt.', NULL, NOW(6) - INTERVAL 7 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-17', 'seed-show-4', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'trang.dang@music.com') AND title = 'Eine kleine Nachtmusik (K. 525)' AND deleted_at IS NULL LIMIT 1), 3,
        (SELECT id FROM members WHERE email = 'user@music.com'), (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), CURDATE() + INTERVAL 4 DAY, 'ARRANGING', 'Chuyển cho hợp xướng nữ.', NULL, NOW(6) - INTERVAL 6 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-18', 'seed-show-4', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'bao.hoang@music.com') AND title = 'Minuet in G major' AND deleted_at IS NULL LIMIT 1), 4,
        (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), (SELECT id FROM members WHERE email = 'user@music.com'), CURDATE() + INTERVAL 12 DAY, 'IN_REVIEW', NULL, NULL, NOW(6) - INTERVAL 5 DAY, NOW(6) - INTERVAL 1 DAY);

-- Nhật ký hoạt động của hai nhóm (tab Hoạt động)
INSERT IGNORE INTO team_members (id, team_id, kind, member_id, type, params, created_at)
VALUES
    ('seed-act-11', 'seed-team-1', 'ACTIVITY', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'SHOW_CREATED', '{"show":"Tiệc cuối năm công ty","showId":"seed-show-6"}', NOW(6) - INTERVAL 8 DAY),
    ('seed-act-12', 'seed-team-1', 'ACTIVITY', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'ITEM_ADDED', '{"score":"Canon in D","show":"Tiệc cuối năm công ty","showId":"seed-show-6"}', NOW(6) - INTERVAL 7 DAY),
    ('seed-act-13', 'seed-team-1', 'ACTIVITY', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'ITEM_ASSIGNED', '{"score":"Canon in D","arranger":"Demo User","reviewer":"Lê Thu Hương","show":"Tiệc cuối năm công ty","showId":"seed-show-6"}', NOW(6) - INTERVAL 7 DAY),
    ('seed-act-14', 'seed-team-1', 'ACTIVITY', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'ITEM_ASSIGNED', '{"score":"Swan Lake - Theme","arranger":"Demo User","reviewer":"Võ Hoài An","show":"Tiệc cuối năm công ty","showId":"seed-show-6"}', NOW(6) - INTERVAL 6 DAY),
    ('seed-act-15', 'seed-team-1', 'ACTIVITY', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'ITEM_STATUS_CHANGED', '{"score":"Diễm xưa","from":"IN_REVIEW","status":"ARRANGING","show":"Tiệc cuối năm công ty","showId":"seed-show-6"}', NOW(6) - INTERVAL 2 DAY),
    ('seed-act-16', 'seed-team-1', 'ACTIVITY', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'ITEM_STATUS_CHANGED', '{"score":"Prelude in C major (BWV 846)","from":"IN_REVIEW","status":"APPROVED","show":"Tiệc cuối năm công ty","showId":"seed-show-6"}', NOW(6) - INTERVAL 1 DAY),
    ('seed-act-17', 'seed-team-2', 'ACTIVITY', (SELECT id FROM members WHERE email = 'user@music.com'), 'MEMBER_JOINED', '{"name":"Demo User","role":"ARRANGER"}', NOW(6) - INTERVAL 12 DAY),
    ('seed-act-18', 'seed-team-2', 'ACTIVITY', (SELECT id FROM members WHERE email = 'trang.dang@music.com'), 'ITEM_ASSIGNED', '{"score":"Eine kleine Nachtmusik (K. 525)","arranger":"Demo User","reviewer":"Ngô Thị Mai","show":"Giáng sinh 2026","showId":"seed-show-4"}', NOW(6) - INTERVAL 6 DAY);

-- Thông báo của user@music.com: giao việc (phối / duyệt), nhắc hạn, bài bị trả lại. Bấm vào mở đúng buổi diễn (teamId + showId).
INSERT IGNORE INTO notifications (id, recipient_id, type, message, params, is_read, created_at)
VALUES
    ('seed-notif-mt-1', (SELECT id FROM members WHERE email = 'user@music.com'), 'SHOW_ITEM_ASSIGNED', 'Bạn được giao phối bài “Canon in D” trong buổi diễn Tiệc cuối năm công ty',
        '{"variant":"arranger","title":"Canon in D","show":"Tiệc cuối năm công ty","teamId":"seed-team-1","showId":"seed-show-6"}', 0, NOW(6) - INTERVAL 7 DAY),
    ('seed-notif-mt-2', (SELECT id FROM members WHERE email = 'user@music.com'), 'SHOW_ITEM_ASSIGNED', 'Bạn được giao duyệt bài “Tình ca” trong buổi diễn Tiệc cuối năm công ty',
        '{"variant":"reviewer","title":"Tình ca","show":"Tiệc cuối năm công ty","teamId":"seed-team-1","showId":"seed-show-6"}', 0, NOW(6) - INTERVAL 6 DAY),
    ('seed-notif-mt-3', (SELECT id FROM members WHERE email = 'user@music.com'), 'SHOW_ITEM_RETURNED', 'Bài “Diễm xưa” (buổi diễn Tiệc cuối năm công ty) bị trả lại',
        '{"title":"Diễm xưa","show":"Tiệc cuối năm công ty","teamId":"seed-team-1","showId":"seed-show-6"}', 0, NOW(6) - INTERVAL 2 DAY),
    ('seed-notif-mt-4', (SELECT id FROM members WHERE email = 'user@music.com'), 'SHOW_ITEM_DUE', 'Bài “Swan Lake - Theme” (buổi diễn Tiệc cuối năm công ty) tới hạn sau 1 ngày',
        '{"variant":"soon","title":"Swan Lake - Theme","show":"Tiệc cuối năm công ty","days":"1","teamId":"seed-team-1","showId":"seed-show-6"}', 0, NOW(6) - INTERVAL 3 HOUR),
    ('seed-notif-mt-5', (SELECT id FROM members WHERE email = 'user@music.com'), 'SHOW_ITEM_ASSIGNED', 'Bạn được giao phối bài “Eine kleine Nachtmusik (K. 525)” trong buổi diễn Giáng sinh 2026',
        '{"variant":"arranger","title":"Eine kleine Nachtmusik (K. 525)","show":"Giáng sinh 2026","teamId":"seed-team-2","showId":"seed-show-4"}', 1, NOW(6) - INTERVAL 6 DAY);
