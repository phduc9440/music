CREATE TABLE practice_note_event (
    session_id      VARCHAR(36) NOT NULL,
    seq             INT         NOT NULL,
    note_id         VARCHAR(40) NULL,
    measure         INT         NULL,
    hand            VARCHAR(5)  NULL,
    expected_midi   SMALLINT    NULL,
    played_midi     SMALLINT    NULL,
    expected_ms     INT         NULL,
    played_ms       INT         NULL,
    delta_ms        INT         NULL,
    result          VARCHAR(12) NOT NULL,
    PRIMARY KEY (session_id, seq),
    KEY idx_practice_note_event_session_measure (session_id, measure),
    CONSTRAINT fk_practice_note_event_session
        FOREIGN KEY (session_id) REFERENCES practice_sessions (id) ON DELETE CASCADE,
    CONSTRAINT chk_practice_note_event_seq CHECK (seq >= 0),
    CONSTRAINT chk_practice_note_event_result
        CHECK (result IN ('PERFECT', 'EARLY', 'LATE', 'WRONG_PITCH', 'MISSED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
