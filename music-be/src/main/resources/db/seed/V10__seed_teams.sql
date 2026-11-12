-- V10: team và show mẫu (mục 4.1) để các trang Team, Show và admin Team có dữ liệu, kể cả team đã xóa mềm.
-- Id cố định (seed-...) và INSERT IGNORE nên chạy lại không bị trùng. Link mời trong seed dùng mã băm không ai biết nên không
-- dùng được; muốn thử lời mời thì tạo mới trên web. Lời mời theo email gửi tới trang.dang@music.com cho team đầu tiên.
--   seed-team-1  Ban nhạc Sao Mai           chủ huong.le     đang hoạt động, show đang chuẩn bị + đã diễn + 1 show đã xóa mềm
--   seed-team-2  Hợp xướng Thanh Xuân       chủ trang.dang   đang hoạt động, có bài quá hạn chưa duyệt
--   seed-team-3  Lớp piano cô Mai           chủ mai.ngo     chủ tự xóa 6 ngày trước: còn khôi phục được (chủ hoặc admin)
--   seed-team-4  Nhóm bản phối nhạc phim    chủ khoa.bui     admin xóa 3 ngày trước (vi phạm): chỉ admin khôi phục được
--   seed-team-5  Nhóm thử nghiệm cũ         chủ user@music.comchủ xóa 45 ngày trước: quá hạn 30 ngày, không khôi phục được nữa
-- Không dùng lan.nguyen và minh.tran (các test TeamShowFlowTest, AdminTeamServiceImplTest cần hai tài khoản này chưa có gói team và chưa có việc nào).
-- Gói team cấp cho chủ team (ADMIN_GRANT) để cột "quyền tạo nhóm" ở trang admin có cả hai trạng thái: khoa.bui và user@music.com không có.

INSERT IGNORE INTO subscriptions (id, member_id, plan_id, status, source, starts_at, expires_at, created_at)
VALUES

    ('seed-sub-team-1', (SELECT id FROM members WHERE email = 'huong.le@music.com'), (SELECT id FROM plans WHERE code = 'TEAM_PRO'), 'ACTIVE', 'ADMIN_GRANT', NOW(6) - INTERVAL 20 DAY, NOW(6) + INTERVAL 340 DAY, NOW(6) - INTERVAL 20 DAY),
    ('seed-sub-team-2', (SELECT id FROM members WHERE email = 'trang.dang@music.com'), (SELECT id FROM plans WHERE code = 'TEAM_PREMIUM'), 'ACTIVE', 'ADMIN_GRANT', NOW(6) - INTERVAL 20 DAY, NOW(6) + INTERVAL 340 DAY, NOW(6) - INTERVAL 20 DAY),
    ('seed-sub-team-3', (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), (SELECT id FROM plans WHERE code = 'TEAM_PRO'), 'ACTIVE', 'ADMIN_GRANT', NOW(6) - INTERVAL 20 DAY, NOW(6) + INTERVAL 340 DAY, NOW(6) - INTERVAL 20 DAY);

INSERT IGNORE INTO teams (id, name, description, avatar_url, created_by, created_at, updated_at, deleted_at, deleted_by, deleted_by_admin, deleted_reason)
VALUES
    ('seed-team-1', 'Ban nhạc Sao Mai', 'Ban nhạc acoustic chơi ở quán cà phê và đám cưới cuối tuần.', NULL, (SELECT id FROM members WHERE email = 'huong.le@music.com'), NOW(6) - INTERVAL 40 DAY, NOW(6) - INTERVAL 1 DAY, NULL, NULL, 0, NULL),
    ('seed-team-2', 'Hợp xướng Thanh Xuân', 'Dàn hợp xướng nhà thờ, tập mỗi tối thứ Năm.', NULL, (SELECT id FROM members WHERE email = 'trang.dang@music.com'), NOW(6) - INTERVAL 33 DAY, NOW(6) - INTERVAL 2 DAY, NULL, NULL, 0, NULL),
    ('seed-team-3', 'Lớp piano cô Mai', 'Giáo án và bài tập cho học viên piano cơ bản.', NULL, (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), NOW(6) - INTERVAL 28 DAY, NOW(6) - INTERVAL 6 DAY, NOW(6) - INTERVAL 6 DAY, (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), 0, NULL),
    ('seed-team-4', 'Nhóm bản phối nhạc phim', 'Chia sẻ bản phối lại nhạc phim.', NULL, (SELECT id FROM members WHERE email = 'khoa.bui@music.com'), NOW(6) - INTERVAL 15 DAY, NOW(6) - INTERVAL 3 DAY, NOW(6) - INTERVAL 3 DAY, (SELECT id FROM members WHERE email = 'admin2@music.com'), 1, 'Chia sẻ bản phối nhạc phim chưa xin phép bản quyền'),
    ('seed-team-5', 'Nhóm thử nghiệm cũ', 'Nhóm tạo để thử, không còn dùng.', NULL, (SELECT id FROM members WHERE email = 'user@music.com'), NOW(6) - INTERVAL 60 DAY, NOW(6) - INTERVAL 45 DAY, NOW(6) - INTERVAL 45 DAY, (SELECT id FROM members WHERE email = 'user@music.com'), 0, NULL);

INSERT IGNORE INTO team_members (id, team_id, kind, member_id, role, joined_at, created_at)
VALUES
    ('seed-tm-1-1', 'seed-team-1', 'MEMBER', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'OWNER', NOW(6) - INTERVAL 40 DAY, NOW(6) - INTERVAL 40 DAY),
    ('seed-tm-1-2', 'seed-team-1', 'MEMBER', (SELECT id FROM members WHERE email = 'user@music.com'), 'MANAGER', NOW(6) - INTERVAL 38 DAY, NOW(6) - INTERVAL 38 DAY),
    ('seed-tm-1-3', 'seed-team-1', 'MEMBER', (SELECT id FROM members WHERE email = 'an.vo@music.com'), 'ARRANGER', NOW(6) - INTERVAL 36 DAY, NOW(6) - INTERVAL 36 DAY),
    ('seed-tm-1-4', 'seed-team-1', 'MEMBER', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'ARRANGER', NOW(6) - INTERVAL 35 DAY, NOW(6) - INTERVAL 35 DAY),
    ('seed-tm-1-5', 'seed-team-1', 'MEMBER', (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), 'VIEWER', NOW(6) - INTERVAL 30 DAY, NOW(6) - INTERVAL 30 DAY),
    ('seed-tm-2-1', 'seed-team-2', 'MEMBER', (SELECT id FROM members WHERE email = 'trang.dang@music.com'), 'OWNER', NOW(6) - INTERVAL 33 DAY, NOW(6) - INTERVAL 33 DAY),
    ('seed-tm-2-2', 'seed-team-2', 'MEMBER', (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), 'MANAGER', NOW(6) - INTERVAL 31 DAY, NOW(6) - INTERVAL 31 DAY),
    ('seed-tm-2-3', 'seed-team-2', 'MEMBER', (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), 'ARRANGER', NOW(6) - INTERVAL 29 DAY, NOW(6) - INTERVAL 29 DAY),
    ('seed-tm-3-1', 'seed-team-3', 'MEMBER', (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), 'OWNER', NOW(6) - INTERVAL 28 DAY, NOW(6) - INTERVAL 28 DAY),
    ('seed-tm-3-2', 'seed-team-3', 'MEMBER', (SELECT id FROM members WHERE email = 'duy.pham@music.com'), 'VIEWER', NOW(6) - INTERVAL 26 DAY, NOW(6) - INTERVAL 26 DAY),
    ('seed-tm-4-1', 'seed-team-4', 'MEMBER', (SELECT id FROM members WHERE email = 'khoa.bui@music.com'), 'OWNER', NOW(6) - INTERVAL 15 DAY, NOW(6) - INTERVAL 15 DAY),
    ('seed-tm-5-1', 'seed-team-5', 'MEMBER', (SELECT id FROM members WHERE email = 'user@music.com'), 'OWNER', NOW(6) - INTERVAL 60 DAY, NOW(6) - INTERVAL 60 DAY);

-- Lời mời đang chờ: một theo email (trang.dang vào Ban nhạc Sao Mai), một link mời (email NULL), hết hạn sau 7 ngày kể từ lúc mời.
INSERT IGNORE INTO team_members (id, team_id, kind, email, role, status, token_hash, invited_by, expires_at, created_at)
VALUES
    ('seed-inv-1', 'seed-team-1', 'INVITATION', 'trang.dang@music.com', 'ARRANGER', 'PENDING', SHA2('seed-invitation-1', 256),
     (SELECT id FROM members WHERE email = 'huong.le@music.com'), NOW(6) + INTERVAL 5 DAY, NOW(6) - INTERVAL 2 DAY),
    ('seed-inv-2', 'seed-team-1', 'INVITATION', NULL, 'VIEWER', 'PENDING', SHA2('seed-invitation-2', 256),
     (SELECT id FROM members WHERE email = 'user@music.com'), NOW(6) + INTERVAL 6 DAY, NOW(6) - INTERVAL 1 DAY);

-- Bản nhạc vào team (scores.team_id). Team đã xóa mềm vẫn giữ team_id; bản nhạc vẫn hiện như bản cá nhân của chủ.
UPDATE scores SET team_id = 'seed-team-1' WHERE member_id = (SELECT id FROM members WHERE email = 'huong.le@music.com') AND title = 'Canon in D' AND team_id IS NULL;
UPDATE scores SET team_id = 'seed-team-1' WHERE member_id = (SELECT id FROM members WHERE email = 'huong.le@music.com') AND title = 'Swan Lake - Theme' AND team_id IS NULL;
UPDATE scores SET team_id = 'seed-team-1' WHERE member_id = (SELECT id FROM members WHERE email = 'duy.pham@music.com') AND title = 'Tình ca' AND team_id IS NULL;
UPDATE scores SET team_id = 'seed-team-1' WHERE member_id = (SELECT id FROM members WHERE email = 'an.vo@music.com') AND title = 'Hungarian Rhapsody No. 2' AND team_id IS NULL;
UPDATE scores SET team_id = 'seed-team-2' WHERE member_id = (SELECT id FROM members WHERE email = 'trang.dang@music.com') AND title = 'Hallelujah (Messiah)' AND team_id IS NULL;
UPDATE scores SET team_id = 'seed-team-2' WHERE member_id = (SELECT id FROM members WHERE email = 'bao.hoang@music.com') AND title = 'Sao Mai (hợp xướng)' AND team_id IS NULL;
UPDATE scores SET team_id = 'seed-team-3' WHERE member_id = (SELECT id FROM members WHERE email = 'mai.ngo@music.com') AND title = 'Hà Nội mùa vắng những cơn mưa' AND team_id IS NULL;
UPDATE scores SET team_id = 'seed-team-4' WHERE member_id = (SELECT id FROM members WHERE email = 'khoa.bui@music.com') AND title = 'Bản phối lại nhạc phim (chưa xin phép)' AND team_id IS NULL;

INSERT IGNORE INTO shows (id, team_id, name, show_date, venue, notes, status, created_by, created_at, updated_at, deleted_at, deleted_by)
VALUES
    ('seed-show-1', 'seed-team-1', 'Đêm nhạc mùa thu', CURDATE() + INTERVAL 20 DAY, 'Cà phê Sao Mai, Hà Nội', 'Set 45 phút, 4 bài.', 'PREPARING', (SELECT id FROM members WHERE email = 'huong.le@music.com'), NOW(6) - INTERVAL 25 DAY, NOW(6) - INTERVAL 1 DAY, NULL, NULL),
    ('seed-show-2', 'seed-team-1', 'Tiệc cưới Hương & Nam', CURDATE() - INTERVAL 10 DAY, 'Nhà hàng Hoa Sen', 'Đã diễn xong.', 'DONE', (SELECT id FROM members WHERE email = 'huong.le@music.com'), NOW(6) - INTERVAL 35 DAY, NOW(6) - INTERVAL 1 DAY, NULL, NULL),
    ('seed-show-3', 'seed-team-1', 'Show thử nghiệm (đã xóa)', NULL, NULL, 'Xóa nhầm để thử khôi phục.', 'PREPARING', (SELECT id FROM members WHERE email = 'user@music.com'), NOW(6) - INTERVAL 12 DAY, NOW(6) - INTERVAL 1 DAY, NOW(6) - INTERVAL 5 DAY, (SELECT id FROM members WHERE email = 'user@music.com')),
    ('seed-show-4', 'seed-team-2', 'Giáng sinh 2026', CURDATE() + INTERVAL 40 DAY, 'Nhà thờ Lớn', 'Hợp xướng 4 bè.', 'PREPARING', (SELECT id FROM members WHERE email = 'trang.dang@music.com'), NOW(6) - INTERVAL 20 DAY, NOW(6) - INTERVAL 1 DAY, NULL, NULL),
    ('seed-show-5', 'seed-team-3', 'Buổi biểu diễn cuối khóa', CURDATE() + INTERVAL 30 DAY, 'Phòng học số 2', 'Học viên tự chọn bài.', 'PREPARING', (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), NOW(6) - INTERVAL 20 DAY, NOW(6) - INTERVAL 1 DAY, NULL, NULL);

INSERT IGNORE INTO show_items (id, show_id, score_id, position, arranger_id, reviewer_id, due_date, status, notes, review_note, created_at, updated_at)
VALUES
    ('seed-item-1', 'seed-show-1', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'huong.le@music.com') AND title = 'Canon in D' AND deleted_at IS NULL LIMIT 1), 1, (SELECT id FROM members WHERE email = 'an.vo@music.com'), (SELECT id FROM members WHERE email = 'user@music.com'), CURDATE() + INTERVAL 10 DAY, 'ARRANGING', 'Tone D, bản cho guitar và violin', NULL, NOW(6) - INTERVAL 10 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-2', 'seed-show-1', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'huong.le@music.com') AND title = 'Swan Lake - Theme' AND deleted_at IS NULL LIMIT 1), 2, (SELECT id FROM members WHERE email = 'duy.pham@music.com'), (SELECT id FROM members WHERE email = 'user@music.com'), CURDATE() + INTERVAL 12 DAY, 'IN_REVIEW', NULL, NULL, NOW(6) - INTERVAL 10 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-3', 'seed-show-1', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'duy.pham@music.com') AND title = 'Tình ca' AND deleted_at IS NULL LIMIT 1), 3, (SELECT id FROM members WHERE email = 'an.vo@music.com'), (SELECT id FROM members WHERE email = 'user@music.com'), CURDATE() + INTERVAL 5 DAY, 'TODO', NULL, NULL, NOW(6) - INTERVAL 10 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-4', 'seed-show-1', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'an.vo@music.com') AND title = 'Hungarian Rhapsody No. 2' AND deleted_at IS NULL LIMIT 1), 4, (SELECT id FROM members WHERE email = 'an.vo@music.com'), (SELECT id FROM members WHERE email = 'huong.le@music.com'), CURDATE() - INTERVAL 1 DAY, 'APPROVED', NULL, 'Ổn, giữ nguyên tempo.', NOW(6) - INTERVAL 10 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-5', 'seed-show-2', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'huong.le@music.com') AND title = 'Canon in D' AND deleted_at IS NULL LIMIT 1), 1, (SELECT id FROM members WHERE email = 'an.vo@music.com'), (SELECT id FROM members WHERE email = 'user@music.com'), CURDATE() - INTERVAL 15 DAY, 'APPROVED', NULL, NULL, NOW(6) - INTERVAL 10 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-6', 'seed-show-3', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'duy.pham@music.com') AND title = 'Tình ca' AND deleted_at IS NULL LIMIT 1), 1, NULL, NULL, NULL, 'TODO', NULL, NULL, NOW(6) - INTERVAL 10 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-7', 'seed-show-4', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'trang.dang@music.com') AND title = 'Hallelujah (Messiah)' AND deleted_at IS NULL LIMIT 1), 1, (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), CURDATE() - INTERVAL 3 DAY, 'ARRANGING', 'Bè nữ cần hạ tông', NULL, NOW(6) - INTERVAL 10 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-8', 'seed-show-4', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'bao.hoang@music.com') AND title = 'Sao Mai (hợp xướng)' AND deleted_at IS NULL LIMIT 1), 2, (SELECT id FROM members WHERE email = 'bao.hoang@music.com'), (SELECT id FROM members WHERE email = 'trang.dang@music.com'), CURDATE() + INTERVAL 15 DAY, 'TODO', NULL, NULL, NOW(6) - INTERVAL 10 DAY, NOW(6) - INTERVAL 1 DAY),
    ('seed-item-9', 'seed-show-5', (SELECT id FROM scores WHERE member_id = (SELECT id FROM members WHERE email = 'mai.ngo@music.com') AND title = 'Hà Nội mùa vắng những cơn mưa' AND deleted_at IS NULL LIMIT 1), 1, NULL, NULL, CURDATE() + INTERVAL 20 DAY, 'TODO', NULL, NULL, NOW(6) - INTERVAL 10 DAY, NOW(6) - INTERVAL 1 DAY);

-- Nhật ký hoạt động (kind = ACTIVITY): params là JSON để web dựng câu theo ngôn ngữ người xem.
INSERT IGNORE INTO team_members (id, team_id, kind, member_id, type, params, created_at)
VALUES
    ('seed-act-1', 'seed-team-1', 'ACTIVITY', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'TEAM_CREATED', '{"team":"Ban nhạc Sao Mai"}', NOW(6) - INTERVAL 40 DAY),
    ('seed-act-2', 'seed-team-1', 'ACTIVITY', (SELECT id FROM members WHERE email = 'user@music.com'), 'MEMBER_JOINED', '{"name":"Demo User","role":"MANAGER"}', NOW(6) - INTERVAL 38 DAY),
    ('seed-act-3', 'seed-team-1', 'ACTIVITY', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'SHOW_CREATED', '{"show":"Đêm nhạc mùa thu","showId":"seed-show-1"}', NOW(6) - INTERVAL 25 DAY),
    ('seed-act-4', 'seed-team-1', 'ACTIVITY', (SELECT id FROM members WHERE email = 'huong.le@music.com'), 'ITEM_ADDED', '{"score":"Canon in D","show":"Đêm nhạc mùa thu"}', NOW(6) - INTERVAL 24 DAY),
    ('seed-act-5', 'seed-team-1', 'ACTIVITY', (SELECT id FROM members WHERE email = 'user@music.com'), 'SHOW_DELETED', '{"show":"Show thử nghiệm (đã xóa)","showId":"seed-show-3"}', NOW(6) - INTERVAL 5 DAY),
    ('seed-act-6', 'seed-team-2', 'ACTIVITY', (SELECT id FROM members WHERE email = 'trang.dang@music.com'), 'TEAM_CREATED', '{"team":"Hợp xướng Thanh Xuân"}', NOW(6) - INTERVAL 33 DAY),
    ('seed-act-7', 'seed-team-2', 'ACTIVITY', (SELECT id FROM members WHERE email = 'trang.dang@music.com'), 'SHOW_CREATED', '{"show":"Giáng sinh 2026","showId":"seed-show-4"}', NOW(6) - INTERVAL 20 DAY),
    ('seed-act-8', 'seed-team-3', 'ACTIVITY', (SELECT id FROM members WHERE email = 'mai.ngo@music.com'), 'TEAM_CREATED', '{"team":"Lớp piano cô Mai"}', NOW(6) - INTERVAL 28 DAY),
    ('seed-act-9', 'seed-team-4', 'ACTIVITY', (SELECT id FROM members WHERE email = 'khoa.bui@music.com'), 'TEAM_CREATED', '{"team":"Nhóm bản phối nhạc phim"}', NOW(6) - INTERVAL 15 DAY),
    ('seed-act-10', 'seed-team-5', 'ACTIVITY', (SELECT id FROM members WHERE email = 'user@music.com'), 'TEAM_CREATED', '{"team":"Nhóm thử nghiệm cũ"}', NOW(6) - INTERVAL 60 DAY);
