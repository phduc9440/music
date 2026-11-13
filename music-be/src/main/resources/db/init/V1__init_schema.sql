-- V1: toan bo schema (tuong ung cac entity trong com.ptit.music_be.entity). Day la file init duy nhat: thay doi schema
-- thi sua truc tiep o day roi xoa DB local de dung lai (khong them migration ALTER rieng le).

-- Vai trò tài khoản. Có sẵn USER (mọi tài khoản), ADMIN, SUPER_ADMIN (tài khoản gốc, mọi quyền); SUPER_ADMIN tạo thêm
-- vai trò khác ở trang "Vai trò". name là mã không dấu cách (quyền ROLE_<name>), label là tên hiển thị của vai trò tự tạo
-- (vai trò có sẵn dùng nhãn dịch sẵn ở web).
CREATE TABLE IF NOT EXISTS roles (
    id          VARCHAR(36)  NOT NULL,
    name        VARCHAR(255) NOT NULL COMMENT 'Mã vai trò: USER, ADMIN, SUPER_ADMIN hoặc mã sinh từ tên (chữ hoa, số, _)',
    label       VARCHAR(100) NULL COMMENT 'Tên hiển thị của vai trò tự tạo',
    description VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Quyền quản trị của từng vai trò (enum AdminPermission: DASHBOARD_VIEW, MEMBERS_VIEW, SCORES_APPROVE...). SUPER_ADMIN không
-- cần dòng nào (luôn đủ quyền), USER không có quyền quản trị.
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id    VARCHAR(36) NOT NULL,
    permission VARCHAR(40) NOT NULL,
    PRIMARY KEY (role_id, permission),
    CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS members (
    id             VARCHAR(36)  NOT NULL,
    email          VARCHAR(255) NOT NULL,
    password_hash  VARCHAR(255) NULL,
    full_name      VARCHAR(255) NULL,
    phone          VARCHAR(30)  NULL,
    address        VARCHAR(255) NULL,
    avatar_url     VARCHAR(512) NULL,
    status         INT          NULL COMMENT '1 = ACTIVE, 2 = INACTIVE',
    email_verified TINYINT(1)   NULL,
    auth_provider  INT          NULL COMMENT '1 = LOCAL, 2 = GOOGLE',
    created_at     DATETIME(6)  NULL COMMENT 'Ngày đăng ký (NULL với tài khoản tạo trước khi có cột này)',
    last_login_at  DATETIME(6)  NULL COMMENT 'Lần đăng nhập gần nhất (đăng nhập thường hoặc Google)',
    password_changed_at DATETIME(6) NULL COMMENT 'Lần đổi/đặt lại mật khẩu gần nhất; token cấp trước mốc này bị từ chối',
    ui_theme       VARCHAR(10)  NULL COMMENT 'Giao diện đã chọn: LIGHT / DARK / SYSTEM; NULL = theo hệ thống',
    locale         VARCHAR(5)   NULL COMMENT 'Ngôn ngữ đã chọn: VI / EN; NULL = tiếng Việt',
    referral_code  VARCHAR(12)  NULL COMMENT 'Mã giới thiệu của thành viên, sinh khi mở trang Mời bạn lần đầu',
    referred_by    VARCHAR(36)  NULL COMMENT 'Người đã mời thành viên này (nhập mã lúc đăng ký)',
    referral_rewarded_at DATETIME(6) NULL COMMENT 'Lúc đã thưởng cho lời mời (bản số hóa đầu tiên); NULL = chưa',
    PRIMARY KEY (id),
    UNIQUE KEY uk_members_email (email),
    UNIQUE KEY uk_members_referral_code (referral_code),
    KEY idx_members_referred_by (referred_by),
    CONSTRAINT fk_members_referred_by FOREIGN KEY (referred_by) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_roles (
    id        VARCHAR(36) NOT NULL,
    member_id VARCHAR(36) NOT NULL,
    role_id   VARCHAR(36) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_member_roles (member_id, role_id),
    CONSTRAINT fk_member_roles_member FOREIGN KEY (member_id) REFERENCES members (id),
    CONSTRAINT fk_member_roles_role   FOREIGN KEY (role_id)   REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS otps (
    id          VARCHAR(36)  NOT NULL,
    otp_code    VARCHAR(255) NOT NULL,
    expiry_time DATETIME(6)  NOT NULL,
    attempts    INT          NULL,
    reset_token_hash CHAR(64) NULL COMMENT 'Có sau khi xác minh đúng OTP: SHA-256 của mã phiên dùng một lần để đặt mật khẩu mới',
    member_id   VARCHAR(36)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_otps_member FOREIGN KEY (member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS composers (
    id            VARCHAR(36)   NOT NULL,
    name          VARCHAR(255)  NOT NULL,
    slug          VARCHAR(120)  NOT NULL,
    aliases       VARCHAR(500)  NULL COMMENT 'Tên khác, cách nhau bằng dấu phẩy (ví dụ "Bach, J.S. Bach"), dùng để tự gắn bản nhạc',
    birth_year    INT           NULL,
    death_year    INT           NULL,
    country       VARCHAR(100)  NULL,
    period        VARCHAR(16)   NULL COMMENT 'BAROQUE / CLASSICAL / ROMANTIC / MODERN / VIETNAM',
    bio           TEXT          NULL,
    image_url     VARCHAR(1000) NULL COMMENT 'Ảnh chân dung: chỉ dùng ảnh phạm vi công cộng hoặc có giấy phép, luôn kèm nguồn và giấy phép',
    image_source  VARCHAR(1000) NULL,
    image_license VARCHAR(100)  NULL,
    created_at    DATETIME(6)   NULL,
    updated_at    DATETIME(6)   NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_composers_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scores (
    id                VARCHAR(36)  NOT NULL,
    member_id         VARCHAR(36)  NULL,
    title             VARCHAR(255) NOT NULL,
    composer          VARCHAR(255) NULL,
    difficulty        VARCHAR(16)  NULL,
    study_notes       TEXT         NULL,
    processing_status VARCHAR(255) NULL,
    visibility        VARCHAR(255) NULL,
    is_official       TINYINT(1)   NULL,
    reject_reason     VARCHAR(255) NULL,
    original_score_id VARCHAR(36)  NULL COMMENT 'Bản trong kho mẫu: id bản gốc của người dùng mà nó được sao chép từ',
    arranger_name     VARCHAR(255) NULL COMMENT 'Bản trong kho mẫu: tên người phối (chủ bản gốc)',
    composer_id       VARCHAR(36)  NULL COMMENT 'Nhạc sĩ trong bảng composers ứng với chữ tác giả (backend tự gắn khi lưu)',
    tempo_bpm         INT          NULL,
    measure_count     INT          NULL,
    key_signature     VARCHAR(16)  NULL,
    time_signature    VARCHAR(8)   NULL,
    staff_count       INT          NULL DEFAULT 2,
    page_count        INT          NULL,
    source_type       VARCHAR(16)  NULL,
    current_version   INT          NULL DEFAULT 0,
    created_at        DATETIME(6)  NULL,
    updated_at        DATETIME(6)  NULL,
    view_count        BIGINT       NULL DEFAULT 0,
    allow_download    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Chủ cho phép người xem tải MusicXML, MIDI, âm thanh, PDF',
    deleted_at        DATETIME(6)  NULL COMMENT 'Xóa mềm: khác NULL là đang ở thùng rác (30 ngày rồi xóa hẳn)',
    deleted_by        VARCHAR(36)  NULL,
    delete_reason     VARCHAR(500) NULL,
    cover_url         VARCHAR(512) NULL COMMENT 'Ảnh bìa do người dùng tải lên (Cloudinary, public id score-covers/{id}); NULL = dùng ảnh trang 1',
    team_id           VARCHAR(36)  NULL COMMENT 'Team chứa bản nhạc (mục 4.1); NULL = bản cá nhân. Ràng buộc khóa ngoại thêm ở cuối file',
    PRIMARY KEY (id),
    KEY idx_scores_member_deleted (member_id, deleted_at),
    KEY idx_scores_team (team_id),
    KEY idx_scores_original (original_score_id),
    KEY idx_scores_composer (composer_id),
    CONSTRAINT fk_scores_member   FOREIGN KEY (member_id)   REFERENCES members (id),
    CONSTRAINT fk_scores_composer FOREIGN KEY (composer_id) REFERENCES composers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS score_files (
    id                 VARCHAR(36)  NOT NULL,
    score_id           VARCHAR(36)  NOT NULL,
    file_type          VARCHAR(32)  NOT NULL,
    original_file_name VARCHAR(255) NULL,
    storage_path       VARCHAR(512) NOT NULL,
    content_type       VARCHAR(128) NULL,
    size_bytes         BIGINT       NULL,
    page_number        INT          NULL,
    version            INT          NULL DEFAULT 1,
    is_current         TINYINT(1)   NULL DEFAULT 1,
    source_task_id     VARCHAR(36)  NULL,
    meta               JSON         NULL,
    created_at         DATETIME(6)  NULL,
    PRIMARY KEY (id),
    KEY idx_score_files_score_type (score_id, file_type),
    CONSTRAINT fk_score_files_score FOREIGN KEY (score_id) REFERENCES scores (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_tasks (
    id            VARCHAR(36) NOT NULL,
    member_id     VARCHAR(36) NOT NULL,
    score_id      VARCHAR(36) NULL,
    task_type     VARCHAR(32) NOT NULL,
    status        VARCHAR(16) NOT NULL,
    progress      INT         NULL DEFAULT 0,
    error_message TEXT        NULL,
    input_data    JSON        NULL,
    retry_count   INT         NULL DEFAULT 0,
    step          VARCHAR(32) NULL,
    result_data   JSON        NULL,
    created_at    DATETIME(6) NULL,
    updated_at    DATETIME(6) NULL,
    started_at    DATETIME(6) NULL,
    finished_at   DATETIME(6) NULL,
    PRIMARY KEY (id),
    KEY idx_ai_tasks_status (status),
    KEY idx_ai_tasks_score (score_id),
    CONSTRAINT fk_ai_tasks_member FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_tasks_score  FOREIGN KEY (score_id)  REFERENCES scores (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS member_scores (
    id         VARCHAR(36)  NOT NULL,
    member_id  VARCHAR(36)  NOT NULL,
    score_id   VARCHAR(36)  NOT NULL,
    permission INT          NULL COMMENT 'Cấp đã được cấp: 1 = VIEW, 2 = REVIEW, 3 = EDIT; NULL = mới chỉ xin, chưa có quyền',
    source     VARCHAR(16)  NOT NULL DEFAULT 'DIRECT' COMMENT 'DIRECT = chủ cấp/duyệt',
    requested_permission INT NULL COMMENT 'Cấp đang xin (1 xem, 2 nhận xét, 3 chỉnh sửa); NULL = không có yêu cầu chờ duyệt',
    request_message      VARCHAR(500) NULL,
    requested_at         DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_member_scores (member_id, score_id),
    CONSTRAINT fk_member_scores_member FOREIGN KEY (member_id) REFERENCES members (id),
    CONSTRAINT fk_member_scores_score  FOREIGN KEY (score_id)  REFERENCES scores (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS score_reviews (
    id         VARCHAR(36) NOT NULL,
    score_id   VARCHAR(36) NOT NULL,
    member_id  VARCHAR(36) NOT NULL,
    rating     INT         NULL COMMENT '1..5 sao, NULL = chỉ bình luận',
    comment    TEXT        NULL,
    created_at DATETIME(6) NULL,
    updated_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_score_reviews (score_id, member_id),
    CONSTRAINT fk_score_reviews_score  FOREIGN KEY (score_id)  REFERENCES scores (id) ON DELETE CASCADE,
    CONSTRAINT fk_score_reviews_member FOREIGN KEY (member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Góp ý gắn vào ô nhịp (mục 4.2), khác Đánh giá (score_reviews: sao + nhận xét chung cho cả bản). Góp ý gốc có vùng neo
-- (ô bắt đầu–kết thúc, bè và noteId nếu chọn nốt) và trạng thái OPEN / RESOLVED; trả lời (parent_id khác NULL) chỉ một cấp,
-- không có vùng neo và trạng thái riêng. Vị trí không tự dịch khi bản nhạc đổi: giữ version và số ô lúc viết để giao diện
-- báo "Viết trên phiên bản vN" khi số ô đã khác. Xóa góp ý gốc thì xóa theo trả lời và @nhắc tên (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS score_comments (
    id               VARCHAR(36)   NOT NULL,
    score_id         VARCHAR(36)   NOT NULL,
    parent_id        VARCHAR(36)   NULL COMMENT 'Góp ý gốc được trả lời; NULL = góp ý gốc',
    author_id        VARCHAR(36)   NOT NULL,
    content          VARCHAR(2000) NOT NULL,
    start_measure    INT           NULL COMMENT 'Góp ý gốc: ô bắt đầu (1..measure_count)',
    end_measure      INT           NULL COMMENT 'Góp ý gốc: ô kết thúc (>= ô bắt đầu)',
    part_id          VARCHAR(64)   NULL COMMENT 'Chỉ góp ý một bè: id part trong MusicXML',
    note_ids         JSON          NULL COMMENT 'Danh sách noteId nếu chọn nốt trong Editor',
    score_version    INT           NULL COMMENT 'scores.current_version lúc viết',
    measure_count_at INT           NULL COMMENT 'scores.measure_count lúc viết: khác số ô hiện tại thì vị trí có thể đã lệch',
    status           VARCHAR(10)   NULL COMMENT 'Góp ý gốc: OPEN / RESOLVED',
    resolved_by      VARCHAR(36)   NULL,
    resolved_at      DATETIME(6)   NULL,
    edited_at        DATETIME(6)   NULL COMMENT 'Lần sửa nội dung gần nhất (nhãn "đã sửa")',
    hidden_at        DATETIME(6)   NULL COMMENT 'Admin ẩn góp ý vi phạm (R5): khác NULL thì biến khỏi mọi truy vấn',
    hidden_by        VARCHAR(36)   NULL COMMENT 'Admin đã ẩn góp ý',
    created_at       DATETIME(6)   NULL,
    PRIMARY KEY (id),
    KEY idx_score_comments_score (score_id, parent_id, status),
    KEY idx_score_comments_parent (parent_id, created_at),
    CONSTRAINT fk_score_comments_score    FOREIGN KEY (score_id)    REFERENCES scores (id) ON DELETE CASCADE,
    CONSTRAINT fk_score_comments_parent   FOREIGN KEY (parent_id)   REFERENCES score_comments (id) ON DELETE CASCADE,
    CONSTRAINT fk_score_comments_author   FOREIGN KEY (author_id)   REFERENCES members (id),
    CONSTRAINT fk_score_comments_resolver FOREIGN KEY (resolved_by) REFERENCES members (id),
    CONSTRAINT fk_score_comments_hider    FOREIGN KEY (hidden_by)   REFERENCES members (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Báo cáo vi phạm (R5). Đối tượng bị báo cáo: bản nhạc (score_id) hoặc góp ý (comment_id). Tên bản nhạc, trích góp ý và chủ
-- nội dung không lưu lại ở đây mà tra từ scores / score_comments khi trả về.
CREATE TABLE IF NOT EXISTS content_reports (
    id            VARCHAR(36)   NOT NULL,
    target_type   VARCHAR(20)   NOT NULL COMMENT 'SCORE / COMMENT / FORUM_POST',
    score_id      VARCHAR(36)   NULL,
    comment_id    VARCHAR(36)   NULL,
    reporter_id   VARCHAR(36)   NOT NULL,
    reason        VARCHAR(20)   NOT NULL COMMENT 'COPYRIGHT / SPAM / INAPPROPRIATE / OTHER',
    details       VARCHAR(1000) NULL,
    status        VARCHAR(12)   NOT NULL COMMENT 'PENDING / RESOLVED / DISMISSED',
    action        VARCHAR(16)   NULL COMMENT 'Cách xử lý: DISMISS / UNPUBLISH / HIDE / SOFT_DELETE / LOCK_ACCOUNT',
    resolution_note VARCHAR(500) NULL,
    resolved_by   VARCHAR(36)   NULL,
    resolved_at   DATETIME(6)   NULL,
    created_at    DATETIME(6)   NULL,
    PRIMARY KEY (id),
    KEY idx_content_reports_status (status, created_at),
    KEY idx_content_reports_score (score_id, status),
    KEY idx_content_reports_comment (comment_id, status),
    KEY idx_content_reports_reporter (reporter_id, created_at),
    CONSTRAINT fk_content_reports_score    FOREIGN KEY (score_id)    REFERENCES scores (id) ON DELETE SET NULL,
    CONSTRAINT fk_content_reports_comment  FOREIGN KEY (comment_id)  REFERENCES score_comments (id) ON DELETE SET NULL,
    CONSTRAINT fk_content_reports_reporter FOREIGN KEY (reporter_id) REFERENCES members (id),
    CONSTRAINT fk_content_reports_resolver FOREIGN KEY (resolved_by) REFERENCES members (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- @nhắc tên trong góp ý (mục 4.2): người được nhắc nhận thông báo COMMENT_MENTION; dùng cho bộ lọc "Nhắc tới tôi".
CREATE TABLE IF NOT EXISTS score_comment_mentions (
    id         VARCHAR(36) NOT NULL,
    comment_id VARCHAR(36) NOT NULL,
    member_id  VARCHAR(36) NOT NULL,
    created_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_score_comment_mentions (comment_id, member_id),
    KEY idx_score_comment_mentions_member (member_id),
    CONSTRAINT fk_score_comment_mentions_comment FOREIGN KEY (comment_id) REFERENCES score_comments (id) ON DELETE CASCADE,
    CONSTRAINT fk_score_comment_mentions_member  FOREIGN KEY (member_id)  REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tags (
    id   VARCHAR(36)  NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tags_name (name),
    UNIQUE KEY uk_tags_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS score_tags (
    id       VARCHAR(36) NOT NULL,
    score_id VARCHAR(36) NOT NULL,
    tag_id   VARCHAR(36) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_score_tags (score_id, tag_id),
    CONSTRAINT fk_score_tags_score FOREIGN KEY (score_id) REFERENCES scores (id),
    CONSTRAINT fk_score_tags_tag   FOREIGN KEY (tag_id)   REFERENCES tags (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS playlists (
    id          VARCHAR(36)  NOT NULL,
    member_id   VARCHAR(36)  NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT         NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_playlists_member FOREIGN KEY (member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS playlist_items (
    id          VARCHAR(36) NOT NULL,
    playlist_id VARCHAR(36) NOT NULL,
    score_id    VARCHAR(36) NOT NULL,
    position    INT         NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_playlist_items_playlist FOREIGN KEY (playlist_id) REFERENCES playlists (id),
    CONSTRAINT fk_playlist_items_score    FOREIGN KEY (score_id)    REFERENCES scores (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
    id           VARCHAR(36)  NOT NULL,
    recipient_id VARCHAR(36)  NOT NULL,
    type         VARCHAR(32)  NOT NULL,
    score_id     VARCHAR(36)  NULL,
    message      VARCHAR(500) NOT NULL COMMENT 'Câu tiếng Việt dựng sẵn: dự phòng cho bản ghi cũ và loại thông báo chưa có params',
    params       JSON         NULL COMMENT 'Tham số của thông báo (title, name, level, reason...): web dựng câu theo ngôn ngữ của người đọc',
    is_read      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at   DATETIME(6)  NULL,
    PRIMARY KEY (id),
    KEY idx_notifications_recipient (recipient_id, is_read, created_at),
    CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS practice_sessions (
    id                  VARCHAR(36)  NOT NULL COMMENT 'Mã phiên tập (UUID)',
    member_id           VARCHAR(36)  NOT NULL COMMENT 'Người tập (members.id)',
    score_id            VARCHAR(36)  NOT NULL COMMENT 'Bản nhạc được tập (scores.id)',
    mode                INT          NULL COMMENT 'Chế độ tập: 1 = FREE (tự do, chơi hết bài), 2 = LOOP (lặp một đoạn), 3 = TEST (chơi chấm điểm)',
    tempo_percent       DOUBLE       NULL COMMENT 'Tốc độ so với bản gốc, 100 = nguyên tốc độ, 50 = chậm một nửa',
    loop_start_measure  INT          NULL COMMENT 'Ô nhịp bắt đầu của đoạn lặp (chỉ dùng ở chế độ LOOP)',
    loop_end_measure    INT          NULL COMMENT 'Ô nhịp kết thúc của đoạn lặp (chỉ dùng ở chế độ LOOP)',
    started_at          DATETIME(6)  NULL COMMENT 'Thời điểm bắt đầu tập',
    ended_at            DATETIME(6)  NULL COMMENT 'Thời điểm kết thúc tập',
    duration_seconds    INT          NULL COMMENT 'Thời gian tập thực tế, tính bằng giây',
    total_notes         INT          NULL COMMENT 'Tổng số nốt trong phần đã tập',
    perfect_count       INT          NULL COMMENT 'Số nốt đúng cao độ và đúng giờ',
    early_count         INT          NULL COMMENT 'Số nốt đúng cao độ nhưng chơi sớm',
    late_count          INT          NULL COMMENT 'Số nốt đúng cao độ nhưng chơi trễ',
    wrong_pitch_count   INT          NULL COMMENT 'Số nốt chơi sai cao độ',
    missed_count        INT          NULL COMMENT 'Số nốt bỏ lỡ, không chơi',
    accuracy_pct        DOUBLE       NULL COMMENT '% đúng = (đúng giờ + sớm + trễ) / tổng nốt x 100',
    timing_accuracy_pct DOUBLE       NULL COMMENT '% đúng nhịp = nốt đúng giờ / tổng nốt x 100',
    score_points        DOUBLE       NULL COMMENT 'Điểm số của phiên (chủ yếu ở chế độ TEST)',
    is_completed        TINYINT(1)   NULL COMMENT 'Có chơi hết phiên (1) hay bỏ giữa chừng (0)',
    error_log           JSON         NULL COMMENT 'Log lỗi chi tiết từng nốt (mảng JSON)',
    PRIMARY KEY (id),
    KEY idx_practice_sessions_member_started (member_id, started_at),
    CONSTRAINT fk_practice_sessions_member FOREIGN KEY (member_id) REFERENCES members (id),
    CONSTRAINT fk_practice_sessions_score  FOREIGN KEY (score_id)  REFERENCES scores (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS official_requests (
    id            VARCHAR(36) NOT NULL,
    score_id      VARCHAR(36) NOT NULL,
    requested_by  VARCHAR(36) NOT NULL,
    owner_id      VARCHAR(36) NOT NULL,
    status        VARCHAR(16) NOT NULL COMMENT 'PENDING / ACCEPTED / DECLINED / CANCELED',
    copy_score_id VARCHAR(36) NULL COMMENT 'Bản sao trong kho mẫu khi chủ đã đồng ý',
    created_at    DATETIME(6) NULL,
    resolved_at   DATETIME(6) NULL,
    PRIMARY KEY (id),
    KEY idx_official_requests_owner (owner_id, status),
    KEY idx_official_requests_score (score_id, status),
    CONSTRAINT fk_official_requests_score     FOREIGN KEY (score_id)     REFERENCES scores (id) ON DELETE CASCADE,
    CONSTRAINT fk_official_requests_requester FOREIGN KEY (requested_by) REFERENCES members (id),
    CONSTRAINT fk_official_requests_owner     FOREIGN KEY (owner_id)     REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Gói dịch vụ (mục 7.2/7.3). limits là JSON: omrPagesPerMonth, omrConcurrent, storageMb, keptVersions, exportsPerMonth,
-- collab, team, omrPriority; thiếu một khóa hoặc null = không giới hạn. Giá là số nguyên VND.
CREATE TABLE IF NOT EXISTS plans (
    id          VARCHAR(36)  NOT NULL,
    code        VARCHAR(16)  NOT NULL COMMENT 'FREE / STUDENT / PRO / PREMIUM / ULTIMATE / TEAM_PRO / TEAM_PREMIUM',
    name        VARCHAR(100) NOT NULL,
    audience    VARCHAR(10)  NOT NULL DEFAULT 'PERSONAL' COMMENT 'PERSONAL (cá nhân) / TEAM (nhóm)',
    price_month BIGINT       NOT NULL DEFAULT 0,
    price_year  BIGINT       NOT NULL DEFAULT 0,
    limits      JSON         NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Gói đang dùng của thành viên. Không có dòng ACTIVE còn hạn thì coi như gói FREE.
CREATE TABLE IF NOT EXISTS subscriptions (
    id         VARCHAR(36)  NOT NULL,
    member_id  VARCHAR(36)  NOT NULL,
    plan_id    VARCHAR(36)  NOT NULL,
    status     VARCHAR(16)  NOT NULL COMMENT 'ACTIVE / CANCELED / EXPIRED',
    source     VARCHAR(16)  NOT NULL COMMENT 'PAYMENT / POINTS_TRIAL / ADMIN_GRANT',
    starts_at  DATETIME(6)  NOT NULL,
    expires_at DATETIME(6)  NOT NULL,
    created_at DATETIME(6)  NULL,
    PRIMARY KEY (id),
    KEY idx_subscriptions_member (member_id, status, expires_at),
    CONSTRAINT fk_subscriptions_member FOREIGN KEY (member_id) REFERENCES members (id),
    CONSTRAINT fk_subscriptions_plan   FOREIGN KEY (plan_id)   REFERENCES plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Xử lý vi phạm về gói (SUPER_ADMIN thực hiện). REVOKE: thu hồi gói đang dùng (subscription bị hủy ngay, muốn dùng lại
-- phải mua lại; ends_at NULL). BAN: cấm dùng gói plan_id đến ends_at (không dùng, mua hay được cấp lại gói đó; vẫn dùng Free
-- hoặc mua gói khác; ADMIN bị cấm Pro thì mất Pro theo vai trò); hết hạn thì tự hết cấm, lifted_at là lúc gỡ cấm sớm.
CREATE TABLE IF NOT EXISTS plan_sanctions (
    id              VARCHAR(36)  NOT NULL,
    member_id       VARCHAR(36)  NOT NULL,
    type            VARCHAR(10)  NOT NULL COMMENT 'REVOKE / BAN',
    plan_id         VARCHAR(36)  NOT NULL COMMENT 'Gói bị thu hồi / bị cấm',
    subscription_id VARCHAR(36)  NULL COMMENT 'REVOKE: gói (subscription) bị thu hồi',
    starts_at       DATETIME(6)  NOT NULL,
    ends_at         DATETIME(6)  NULL COMMENT 'BAN: hết cấm lúc này',
    reason          VARCHAR(255) NULL,
    created_by      VARCHAR(36)  NULL COMMENT 'SUPER_ADMIN thực hiện',
    lifted_at       DATETIME(6)  NULL COMMENT 'BAN: gỡ cấm sớm lúc nào',
    created_at      DATETIME(6)  NULL,
    PRIMARY KEY (id),
    KEY idx_plan_sanctions_member (member_id, type, ends_at),
    CONSTRAINT fk_plan_sanctions_member       FOREIGN KEY (member_id)       REFERENCES members (id),
    CONSTRAINT fk_plan_sanctions_plan         FOREIGN KEY (plan_id)         REFERENCES plans (id),
    CONSTRAINT fk_plan_sanctions_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions (id),
    CONSTRAINT fk_plan_sanctions_created_by   FOREIGN KEY (created_by)      REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Đơn thanh toán gói (mục 7.4). Số tiền là VND nguyên. provider_txn_id là mã giao dịch phía cổng (duy nhất) để chống xử
-- lý trùng IPN; raw_payload giữ dữ liệu thô cổng gửi về để đối soát.
CREATE TABLE IF NOT EXISTS payment_orders (
    id              VARCHAR(36)  NOT NULL,
    order_code      VARCHAR(40)  NOT NULL COMMENT 'Mã đơn do mình sinh, gửi cho cổng làm mã tham chiếu',
    member_id       VARCHAR(36)  NOT NULL,
    plan_id         VARCHAR(36)  NOT NULL,
    period          VARCHAR(8)   NOT NULL COMMENT 'MONTH / YEAR',
    kind            VARCHAR(8)   NOT NULL DEFAULT 'NEW' COMMENT 'NEW mua mới/đổi gói, RENEW gia hạn',
    amount          BIGINT       NOT NULL,
    provider        VARCHAR(16)  NOT NULL COMMENT 'VNPAY',
    status          VARCHAR(16)  NOT NULL COMMENT 'PENDING / PAID / FAILED / EXPIRED / REFUNDED',
    provider_txn_id VARCHAR(64)  NULL,
    raw_payload     TEXT         NULL,
    created_at      DATETIME(6)  NULL,
    expires_at      DATETIME(6)  NOT NULL,
    paid_at         DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_payment_orders_code (order_code),
    UNIQUE KEY uk_payment_orders_txn (provider_txn_id),
    KEY idx_payment_orders_status (status, expires_at),
    KEY idx_payment_orders_paid (status, paid_at),
    KEY idx_payment_orders_member (member_id, created_at),
    CONSTRAINT fk_payment_orders_member FOREIGN KEY (member_id) REFERENCES members (id),
    CONSTRAINT fk_payment_orders_plan   FOREIGN KEY (plan_id)   REFERENCES plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Team và Show (mục 4.1). Quyền trên bản nhạc của team suy ra từ vai trò (TeamAccessResolverImpl): OWNER/MANAGER = chủ,
-- ARRANGER = sửa bài được giao + nhận xét bài khác, VIEWER = xem. Xóa team là xóa mềm (deleted_at): team biến mất với
-- mọi thành viên, mọi dữ liệu (thành viên, show, bản nhạc vẫn giữ team_id) nằm nguyên để khôi phục được trong 30 ngày;
-- quá 30 ngày thì không khôi phục được nữa nhưng cũng không xóa cứng. Bản nhạc vẫn ở thư viện của chủ từng bản suốt thời gian
-- đó. Các ON DELETE CASCADE bên dưới chỉ còn để giữ toàn vẹn dữ liệu, ứng dụng không xóa cứng team.
CREATE TABLE IF NOT EXISTS teams (
    id          VARCHAR(36)   NOT NULL,
    name        VARCHAR(100)  NOT NULL,
    description VARCHAR(1000) NULL,
    avatar_url  VARCHAR(512)  NULL,
    created_by  VARCHAR(36)   NOT NULL COMMENT 'Người tạo; hạn mức số thành viên lấy theo gói của người này',
    created_at  DATETIME(6)   NULL,
    updated_at  DATETIME(6)   NULL,
    deleted_at       DATETIME(6)  NULL COMMENT 'Xóa mềm: khác NULL = đã xóa, khôi phục được trong 30 ngày kể từ lúc này',
    deleted_by       VARCHAR(36)  NULL COMMENT 'Người xóa (chủ team hoặc quản trị viên)',
    deleted_by_admin BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'TRUE = quản trị viên xóa (vi phạm): chỉ quản trị viên khôi phục',
    deleted_reason   VARCHAR(500) NULL COMMENT 'Lý do quản trị viên ghi khi xóa',
    PRIMARY KEY (id),
    KEY idx_teams_deleted (deleted_at),
    CONSTRAINT fk_teams_created_by FOREIGN KEY (created_by) REFERENCES members (id),
    CONSTRAINT fk_teams_deleted_by FOREIGN KEY (deleted_by) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Mọi liên kết giữa team và người nằm chung một bảng (entity TeamMember), phân biệt bằng kind; truy vấn nào cũng phải
-- lọc theo kind (các truy vấn trong TeamMemberRepository đều đã lọc).
--   MEMBER     thành viên: member_id, role, joined_at.
--   INVITATION lời mời: email (NULL = link mời, ai có link cũng dùng được), role (không mời làm OWNER), token_hash (chỉ lưu
--              SHA-256, mã gốc hiện một lần lúc tạo), status, invited_by, expires_at (7 ngày, dùng một lần); khi chấp
--              nhận thì member_id = người chấp nhận, joined_at = lúc chấp nhận.
--   ACTIVITY   nhật ký hoạt động: member_id = người làm, type, params (JSON để web dựng câu).
-- Mỗi người chỉ có một dòng MEMBER trong một team: khóa trên cột sinh member_key (chỉ có giá trị khi kind = MEMBER, các
-- loại khác là NULL nên không vướng). Cột sinh không cho FK của cột gốc có ON DELETE SET NULL, nên member_id dùng FK thường
-- (tài khoản không bị xóa cứng, chỉ khóa).
CREATE TABLE IF NOT EXISTS team_members (
    id         VARCHAR(36)  NOT NULL,
    team_id    VARCHAR(36)  NOT NULL,
    kind       VARCHAR(12)  NOT NULL COMMENT 'MEMBER / INVITATION / ACTIVITY',
    member_id  VARCHAR(36)  NULL COMMENT 'MEMBER: thành viên; INVITATION: người đã chấp nhận; ACTIVITY: người làm',
    email      VARCHAR(255) NULL COMMENT 'INVITATION: email được mời, NULL = link mời',
    role       VARCHAR(10)  NULL COMMENT 'MEMBER, INVITATION: OWNER / MANAGER / ARRANGER / VIEWER',
    status     VARCHAR(10)  NULL COMMENT 'INVITATION: PENDING / ACCEPTED / REVOKED (hết hạn suy ra từ expires_at)',
    token_hash CHAR(64)     NULL COMMENT 'INVITATION: SHA-256 của mã mời',
    invited_by VARCHAR(36)  NULL COMMENT 'INVITATION: người mời',
    expires_at DATETIME(6)  NULL COMMENT 'INVITATION: hết hạn lúc này',
    type       VARCHAR(32)  NULL COMMENT 'ACTIVITY: loại hoạt động',
    params     JSON         NULL COMMENT 'ACTIVITY: tham số để dựng câu',
    joined_at  DATETIME(6)  NULL COMMENT 'MEMBER: lúc vào team; INVITATION: lúc được chấp nhận',
    created_at DATETIME(6)  NULL,
    member_key VARCHAR(36)  GENERATED ALWAYS AS (CASE WHEN kind = 'MEMBER' THEN member_id END) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uk_team_members_member (team_id, member_key),
    UNIQUE KEY uk_team_members_token (token_hash),
    KEY idx_team_members_team (team_id, kind, created_at),
    KEY idx_team_members_member (member_id, kind),
    KEY idx_team_members_email (email, kind),
    CONSTRAINT fk_team_members_team       FOREIGN KEY (team_id)    REFERENCES teams (id) ON DELETE CASCADE,
    CONSTRAINT fk_team_members_member     FOREIGN KEY (member_id)  REFERENCES members (id),
    CONSTRAINT fk_team_members_invited_by FOREIGN KEY (invited_by) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS shows (
    id         VARCHAR(36)   NOT NULL,
    team_id    VARCHAR(36)   NOT NULL,
    name       VARCHAR(255)  NOT NULL,
    show_date  DATE          NULL COMMENT 'Ngày diễn',
    venue      VARCHAR(255)  NULL,
    notes      VARCHAR(2000) NULL,
    status     VARCHAR(10)   NOT NULL COMMENT 'PREPARING (đang chuẩn bị) / DONE (đã diễn)',
    created_by VARCHAR(36)   NULL,
    created_at DATETIME(6)   NULL,
    updated_at DATETIME(6)   NULL,
    deleted_at DATETIME(6)   NULL COMMENT 'Xóa mềm: khác NULL = đã xóa, quản lý team khôi phục được trong 30 ngày (bài giữ nguyên)',
    deleted_by VARCHAR(36)   NULL COMMENT 'Người xóa',
    PRIMARY KEY (id),
    KEY idx_shows_team (team_id, show_date),
    CONSTRAINT fk_shows_team       FOREIGN KEY (team_id)    REFERENCES teams (id) ON DELETE CASCADE,
    CONSTRAINT fk_shows_created_by FOREIGN KEY (created_by) REFERENCES members (id),
    CONSTRAINT fk_shows_deleted_by FOREIGN KEY (deleted_by) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bài trong show. score_id ON DELETE CASCADE: bản nhạc bị xóa hẳn khỏi thùng rác thì bài cũng mất khỏi show.
CREATE TABLE IF NOT EXISTS show_items (
    id          VARCHAR(36)  NOT NULL,
    show_id     VARCHAR(36)  NOT NULL,
    score_id    VARCHAR(36)  NOT NULL,
    position    INT          NOT NULL,
    arranger_id VARCHAR(36)  NULL COMMENT 'Người phối (được sửa bản nhạc này)',
    reviewer_id VARCHAR(36)  NULL COMMENT 'Người duyệt (nhận thông báo khi bài gửi duyệt)',
    due_date    DATE         NULL COMMENT 'Hạn; job nhắc trước 2 ngày và đúng ngày',
    status      VARCHAR(10)  NOT NULL COMMENT 'TODO / ARRANGING / IN_REVIEW / APPROVED',
    notes       VARCHAR(500) NULL COMMENT 'Tone, ca sĩ, độ dài...',
    review_note VARCHAR(500) NULL COMMENT 'Góp ý lần trả lại gần nhất',
    created_at  DATETIME(6)  NULL,
    updated_at  DATETIME(6)  NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_show_items (show_id, score_id),
    KEY idx_show_items_arranger (arranger_id, status),
    KEY idx_show_items_reviewer (reviewer_id, status),
    KEY idx_show_items_due (due_date, status),
    CONSTRAINT fk_show_items_show     FOREIGN KEY (show_id)     REFERENCES shows (id) ON DELETE CASCADE,
    CONSTRAINT fk_show_items_score    FOREIGN KEY (score_id)    REFERENCES scores (id) ON DELETE CASCADE,
    CONSTRAINT fk_show_items_arranger FOREIGN KEY (arranger_id) REFERENCES members (id) ON DELETE SET NULL,
    CONSTRAINT fk_show_items_reviewer FOREIGN KEY (reviewer_id) REFERENCES members (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE scores
    ADD CONSTRAINT fk_scores_team FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL;
