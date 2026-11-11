-- V1: toan bo schema (tuong ung cac entity trong com.ptit.music_be.entity). Day la file init duy nhat: thay doi schema
-- thi sua truc tiep o day roi xoa DB local de dung lai (khong them migration ALTER rieng le).

CREATE TABLE IF NOT EXISTS roles (
    id   VARCHAR(36)  NOT NULL,
    name VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_roles_name (name)
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
    PRIMARY KEY (id),
    UNIQUE KEY uk_members_email (email)
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
    PRIMARY KEY (id),
    KEY idx_scores_member_deleted (member_id, deleted_at),
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
    code        VARCHAR(16)  NOT NULL COMMENT 'FREE / PRO / TEAM',
    name        VARCHAR(100) NOT NULL,
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

-- Bộ đếm hạn mức theo tháng (period = yyyy-MM), ví dụ số trang OMR đã dùng.
CREATE TABLE IF NOT EXISTS usage_counters (
    id        VARCHAR(36) NOT NULL,
    member_id VARCHAR(36) NOT NULL,
    metric    VARCHAR(32) NOT NULL,
    period    VARCHAR(7)  NOT NULL,
    used      INT         NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_usage_counters (member_id, metric, period),
    CONSTRAINT fk_usage_counters_member FOREIGN KEY (member_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Đơn thanh toán gói (mục 7.4). Số tiền là VND nguyên. provider_txn_id là mã giao dịch phía cổng (duy nhất) để chống xử
-- lý trùng IPN; raw_payload giữ dữ liệu thô cổng gửi về để đối soát.
CREATE TABLE IF NOT EXISTS payment_orders (
    id              VARCHAR(36)  NOT NULL,
    order_code      VARCHAR(40)  NOT NULL COMMENT 'Mã đơn do mình sinh, gửi cho cổng làm mã tham chiếu',
    member_id       VARCHAR(36)  NOT NULL,
    plan_id         VARCHAR(36)  NOT NULL,
    period          VARCHAR(8)   NOT NULL COMMENT 'MONTH / YEAR',
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
