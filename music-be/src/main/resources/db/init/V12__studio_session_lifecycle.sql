ALTER TABLE practice_sessions
    ADD COLUMN status VARCHAR(12) NOT NULL DEFAULT 'ABANDONED',
    ADD COLUMN input_source VARCHAR(10) NULL,
    ADD COLUMN hand_mode VARCHAR(12) NULL;

UPDATE practice_sessions
SET status = 'COMPLETED'
WHERE is_completed = 1;

ALTER TABLE practice_sessions
    ADD COLUMN active_member_id VARCHAR(36)
        GENERATED ALWAYS AS (CASE WHEN status = 'IN_PROGRESS' THEN member_id ELSE NULL END) STORED,
    ADD KEY idx_practice_sessions_member_score_started (member_id, score_id, started_at),
    ADD UNIQUE KEY ux_practice_sessions_active_member (active_member_id),
    ADD CONSTRAINT chk_practice_sessions_status
        CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
    ADD CONSTRAINT chk_practice_sessions_input_source
        CHECK (input_source IS NULL OR input_source IN ('MIDI', 'MIC', 'TOUCH', 'KEYBOARD')),
    ADD CONSTRAINT chk_practice_sessions_hand_mode
        CHECK (hand_mode IS NULL OR hand_mode IN ('BOTH', 'RIGHT_ONLY', 'LEFT_ONLY'));
