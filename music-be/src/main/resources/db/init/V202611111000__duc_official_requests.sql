-- Kho score mẫu: thay vì gắn cờ lên bản của người dùng, quản trị viên xin phép chủ rồi sao chép bản đó
-- sang tài khoản hệ thống. Bản sao ghi lại bản gốc và tên người phối.
ALTER TABLE scores
    ADD COLUMN original_score_id VARCHAR(36)  NULL,
    ADD COLUMN arranger_name     VARCHAR(255) NULL,
    ADD KEY idx_scores_original (original_score_id);

CREATE TABLE IF NOT EXISTS official_requests (
    id            VARCHAR(36) NOT NULL,
    score_id      VARCHAR(36) NOT NULL,
    requested_by  VARCHAR(36) NOT NULL,
    owner_id      VARCHAR(36) NOT NULL,
    status        VARCHAR(16) NOT NULL,
    copy_score_id VARCHAR(36) NULL,
    created_at    DATETIME(6) NULL,
    resolved_at   DATETIME(6) NULL,
    PRIMARY KEY (id),
    KEY idx_official_requests_owner (owner_id, status),
    KEY idx_official_requests_score (score_id, status),
    CONSTRAINT fk_official_requests_score     FOREIGN KEY (score_id)     REFERENCES scores (id) ON DELETE CASCADE,
    CONSTRAINT fk_official_requests_requester FOREIGN KEY (requested_by) REFERENCES members (id),
    CONSTRAINT fk_official_requests_owner     FOREIGN KEY (owner_id)     REFERENCES members (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
