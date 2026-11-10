-- Xóa mềm: bản nhạc bị xóa nằm trong thùng rác 30 ngày (deleted_at khác NULL) rồi mới bị xóa hẳn.
ALTER TABLE scores
    ADD COLUMN deleted_at    DATETIME(6)  NULL,
    ADD COLUMN deleted_by    VARCHAR(36)  NULL,
    ADD COLUMN delete_reason VARCHAR(500) NULL,
    ADD KEY idx_scores_member_deleted (member_id, deleted_at);
