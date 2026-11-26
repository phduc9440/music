-- X-02 (review 24/11): sổ điểm thưởng. RewardEarnedEvent được phát từ 6 nơi (công khai bản nhạc, kho mẫu, mời bạn,
-- diễn đàn, đề xuất được nhận, số hóa bản đầu) nhưng chưa có nơi nghe. Mỗi dòng là một lần cộng; (reason, ref_id) duy
-- nhất để một sự việc chỉ cộng một lần. Tạo bằng migration riêng (không sửa V1) để DB đang chạy không phải tạo lại.
CREATE TABLE IF NOT EXISTS points_ledger
(
    id         VARCHAR(36) NOT NULL PRIMARY KEY,
    member_id  VARCHAR(36) NOT NULL,
    reason     VARCHAR(40) NOT NULL COMMENT 'RewardReason: SCORE_PUBLISHED, SCORE_OFFICIAL, REFERRAL_DIGITIZED...',
    ref_id     VARCHAR(36) NOT NULL COMMENT 'Mã sự việc (bản nhạc, đề xuất, câu trả lời...)',
    xp         INT         NOT NULL,
    notes      INT         NOT NULL COMMENT 'Số "Nốt" (tiền tệ trong ứng dụng)',
    created_at DATETIME(6) NOT NULL,
    UNIQUE KEY uk_points_ledger_reason_ref (reason, ref_id),
    KEY idx_points_ledger_member (member_id, created_at),
    KEY idx_points_ledger_member_reason (member_id, reason, created_at),
    CONSTRAINT fk_points_ledger_member FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4;
