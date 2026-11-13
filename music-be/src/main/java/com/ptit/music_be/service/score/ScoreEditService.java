package com.ptit.music_be.service.score;

import java.util.List;
import java.util.Map;

import com.ptit.music_be.dto.response.score.ScoreContent;
import com.ptit.music_be.dto.response.score.ScoreSaveResponse;
import com.ptit.music_be.dto.response.score.ScoreVersionResponse;

/** Lưu chỉnh sửa của Editor: ghi MusicXML phiên bản mới cho bản nhạc (đặc tả mục 3.6). */
public interface ScoreEditService {

    /**
     * Lưu MusicXML mới thành version kế tiếp, trong một transaction và có khóa dòng {@code scores}. MIDI không sinh ở
     * đây mà được sinh lại lười ở lần tải MIDI kế tiếp.
     *
     * <p>Kiểm tra theo thứ tự, dừng ở lỗi đầu tiên: SCORE_NOT_EXISTED (2001); UNAUTHORIZED (1002) nếu không sửa được;
     * FILE_TOO_LARGE (2005) nếu body rỗng hoặc vượt giới hạn; MUSICXML_INVALID (2013) nếu Content-Type không phải
     * XML; SCORE_BUSY (2201) nếu đang có task OMR; MUSICXML_NOT_READY (2012) nếu chưa có MusicXML; MUSICXML_INVALID
     * (2013) nếu nội dung không hợp lệ; SCORE_VERSION_CONFLICT (2014) nếu If-Match thiếu, sai định dạng hoặc khác
     * version hiện hành (bỏ qua khi {@code force}); UNAUTHORIZED (1002) nếu {@code force} mà không phải chủ sở hữu hoặc
     * ADMIN.
     *
     * @param scoreId id bản nhạc
     * @param body nội dung MusicXML
     * @param contentType giá trị header Content-Type của request
     * @param ifMatch giá trị header If-Match, dạng {@code "v{currentVersion}"}
     * @param force true để ghi đè dù version đã thay đổi (chỉ chủ sở hữu hoặc ADMIN)
     * @return version mới và metadata đã cập nhật
     */
    ScoreSaveResponse saveMusicXml(String scoreId, byte[] body, String contentType, String ifMatch, boolean force);

    /**
     * Lưu nội dung do server dựng (nhận đề xuất sửa, sau này nhập đè và đồng chỉnh sửa) qua đúng luồng lưu của Editor:
     * khóa dòng {@code scores}, kiểm quyền sửa, task OMR, nội dung và If-Match, ghi file, dọn version cũ. Không có
     * {@code force}. Lỗi như {@link #saveMusicXml}; thêm LIVE_SESSION_ACTIVE (3122) khi bản nhạc đang có phiên cộng tác.
     *
     * @param extraMeta các khóa ghi thêm vào meta của version mới (ví dụ {@code suggestionId}); không được null
     */
    ScoreSaveResponse saveWithMeta(String scoreId, byte[] body, String ifMatch, Map<String, Object> extraMeta);

    /**
     * Lưu bản nhạc đang cùng chỉnh sửa trực tiếp thành version mới (mục 4.4). Giống {@link #saveWithMeta} nhưng được phép
     * lưu khi bản nhạc đang có phiên cộng tác; mọi đường lưu khác bị chặn bằng LIVE_SESSION_ACTIVE (3122) trong lúc đó.
     * Chỉ gọi từ dịch vụ cộng tác.
     */
    ScoreSaveResponse saveLiveSnapshot(String scoreId, byte[] body, String ifMatch, Map<String, Object> extraMeta);

    /**
     * Lịch sử các version MusicXML còn giữ (tối đa 20), mới nhất trước. Cần quyền xem bản nhạc. Lỗi:
     * SCORE_NOT_EXISTED (2001), UNAUTHORIZED (1002).
     */
    List<ScoreVersionResponse> listVersions(String scoreId);

    /**
     * Nội dung MusicXML của một version cũ (để xem trước). Cần quyền xem. Lỗi: SCORE_NOT_EXISTED (2001),
     * UNAUTHORIZED (1002), SCORE_VERSION_NOT_EXISTED (2801) nếu version không còn, FILE_NOT_EXISTED (2002) nếu file
     * đã mất trên đĩa.
     */
    ScoreContent getVersionContent(String scoreId, int version);

    /**
     * Khôi phục một version cũ: lưu nội dung của nó thành version mới ngay sau version hiện hành (không ghi đè lịch
     * sử), qua đúng luồng của {@link #saveMusicXml}. Cần quyền sửa. Ngoài các lỗi của saveMusicXml còn có
     * SCORE_VERSION_NOT_EXISTED (2801) và SCORE_VERSION_CONFLICT (2014) khi If-Match khác version hiện hành.
     */
    ScoreSaveResponse restoreVersion(String scoreId, int version, String ifMatch);
}
