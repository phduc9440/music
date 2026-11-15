CREATE TABLE score_timeline (
    score_id     VARCHAR(36) NOT NULL,
    content_hash CHAR(64)    NOT NULL,
    timeline     JSON        NOT NULL,
    created_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (score_id),
    CONSTRAINT fk_score_timeline_score
        FOREIGN KEY (score_id) REFERENCES scores (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
