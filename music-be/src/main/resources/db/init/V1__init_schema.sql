-- V1: schema ban dau (tuong ung cac entity trong com.ptit.music_be.entity).
-- Dung IF NOT EXISTS de chay an toan tren DB cu da duoc Hibernate tao truoc do.

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
    PRIMARY KEY (id),
    CONSTRAINT fk_scores_member FOREIGN KEY (member_id) REFERENCES members (id)
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
    message      VARCHAR(500) NOT NULL,
    is_read      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at   DATETIME(6)  NULL,
    PRIMARY KEY (id),
    KEY idx_notifications_recipient (recipient_id, is_read, created_at),
    CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS practice_sessions (
    id                  VARCHAR(36)  NOT NULL,
    member_id           VARCHAR(36)  NOT NULL,
    score_id            VARCHAR(36)  NOT NULL,
    mode                INT          NULL COMMENT '1 = FREE, 2 = LOOP, 3 = TEST',
    tempo_percent       DOUBLE       NULL,
    loop_start_measure  INT          NULL,
    loop_end_measure    INT          NULL,
    started_at          DATETIME(6)  NULL,
    ended_at            DATETIME(6)  NULL,
    duration_seconds    INT          NULL,
    total_notes         INT          NULL,
    perfect_count       INT          NULL,
    early_count         INT          NULL,
    late_count          INT          NULL,
    wrong_pitch_count   INT          NULL,
    missed_count        INT          NULL,
    accuracy_pct        DOUBLE       NULL,
    timing_accuracy_pct DOUBLE       NULL,
    score_points        DOUBLE       NULL,
    is_completed        TINYINT(1)   NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_practice_sessions_member FOREIGN KEY (member_id) REFERENCES members (id),
    CONSTRAINT fk_practice_sessions_score  FOREIGN KEY (score_id)  REFERENCES scores (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
