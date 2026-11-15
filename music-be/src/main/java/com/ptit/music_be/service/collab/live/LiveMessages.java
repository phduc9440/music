package com.ptit.music_be.service.collab.live;

import java.util.List;

/**
 * Các gói tin của kênh đồng chỉnh sửa. Client gửi lên {@code /app/scores/{id}/...}; server phát xuống
 * {@code /topic/scores/{id}/...} (cả phiên) hoặc {@code /user/queue/live-*} (riêng người gửi).
 */
public final class LiveMessages {

    private LiveMessages() {}

    // ---------------------------------------------------------------- client gửi lên

    /** Vùng chọn: các ô {@code from..to} của một part. */
    public record Selection(int partIndex, int from, int to) {}

    /** Vào phiên (hoặc vào lại sau khi mất mạng). {@code lastSeq = -1}: chưa có gì, cần nhận cả bài. */
    public record JoinRequest(boolean editing, long lastSeq, Selection selection) {}

    /** Nhịp tim 15 giây, kèm vùng chọn hiện tại (null nếu không chọn gì). */
    public record PresenceRequest(Selection selection) {}

    public record MeasureRef(int partIndex, int measureIndex) {}

    /** Xin hoặc nhả khóa: các ô hoặc cả bài. */
    public record LockRequest(List<MeasureRef> measures, boolean whole, boolean release) {}

    public record MeasureChange(int partIndex, int measureIndex, String beforeHash, String afterXml) {}

    /** Thao tác cấu trúc: thay cả bài; hợp lệ khi {@code baseSeq} đúng bằng seq của server. */
    public record StructuralChange(String afterXml) {}

    /** Gói thao tác: hoặc {@code measures} hoặc {@code structural}. */
    public record OpsRequest(String opId, long baseSeq, List<MeasureChange> measures, StructuralChange structural) {}

    // ---------------------------------------------------------------- server phát xuống

    public record Participant(
            String sessionId, String memberId, String name, int colorIndex, boolean editing, Selection selection) {}

    public record PresenceBroadcast(String scoreId, List<Participant> participants) {}

    public record LockEntry(int partIndex, int measureIndex, String sessionId) {}

    /** Toàn bộ khóa của bản nhạc; {@code wholeHolder} là sessionId đang giữ cả bài, null nếu không ai. */
    public record LocksBroadcast(String scoreId, String wholeHolder, List<LockEntry> locks) {}

    /** Kết quả xin khóa, gửi riêng người xin. */
    public record LockResult(
            String scoreId, String sessionId, boolean granted, boolean released, String heldBy, String heldByName) {}

    public record MeasureXml(int partIndex, int measureIndex, String xml, String hash) {}

    /**
     * Một thao tác đã được nhận. {@code structuralXml} khác null là thao tác cấu trúc (thay cả bài); khi đó
     * {@code structuralHashes} là mã băm mọi ô của bài mới.
     */
    public record OpBroadcast(
            String scoreId,
            long seq,
            String opId,
            String sessionId,
            String memberId,
            List<MeasureXml> measures,
            String structuralXml,
            List<List<String>> structuralHashes) {}

    /** Thao tác bị từ chối, gửi riêng người gửi, kèm nội dung hiện tại của các ô để họ tải lại. */
    public record OpRejected(
            String scoreId,
            String opId,
            String reason,
            long seq,
            List<MeasureXml> measures,
            String structuralXml) {}

    /**
     * Trả lời {@code join}. {@code xml} khác null khi client phải nạp lại cả bài (chưa có seq hoặc mất đồng bộ), khi đó
     * {@code hashes} là mã băm mọi ô; ngược lại {@code ops} là các thao tác client còn thiếu.
     */
    public record JoinResult(
            String scoreId,
            String sessionId,
            boolean editing,
            long seq,
            int baseVersion,
            String xml,
            List<List<String>> hashes,
            List<OpBroadcast> ops) {}

    /** Phiên bản mới vừa lưu từ phiên cộng tác; {@code closed} là phiên đã đóng. */
    public record VersionBroadcast(String scoreId, int version, long seqTo, boolean closed) {}

    /** Lỗi gửi riêng người gửi. */
    public record LiveError(int code, String message) {}
}
