package com.ptit.music_be.service;

import com.ptit.music_be.dto.response.ScoreContent;

/** Đọc nội dung các file kết quả của bản nhạc: kern, MusicXML và MIDI (đặc tả mục 2.4 và 7.1). */
public interface ScoreContentService {

    /**
     * Trả chuỗi kern đã ghép của bản nhạc ({@code kern/merged.krn} hiện hành), mã hóa UTF-8.
     *
     * <p>Cần quyền xem bản nhạc (UNAUTHORIZED). Lỗi: SCORE_NOT_EXISTED (2001) nếu không có bản nhạc,
     * FILE_NOT_EXISTED (2002) nếu chưa có kern hoặc file đã mất trên đĩa.
     */
    String getKern(String scoreId);

    /**
     * Trả MusicXML hiện hành ({@code musicxml/v{n}.musicxml}) kèm version để dựng ETag.
     *
     * <p>Cần quyền xem bản nhạc. Lỗi: SCORE_NOT_EXISTED (2001), MUSICXML_NOT_READY (2012) nếu chưa có MusicXML,
     * FILE_NOT_EXISTED (2002) nếu file đã mất trên đĩa.
     */
    ScoreContent getMusicXml(String scoreId);

    /**
     * Trả MIDI hiện hành. Nếu chưa có MIDI hoặc MIDI cũ hơn MusicXML (Editor vừa lưu bản mới) thì gọi music-ai sinh lại
     * đồng bộ rồi mới trả, mỗi bản nhạc chỉ sinh một lần dù nhiều request cùng lúc.
     *
     * <p>Cần quyền xem bản nhạc. Lỗi: SCORE_NOT_EXISTED (2001), MUSICXML_NOT_READY (2012),
     * AI_SERVICE_UNAVAILABLE (2103) khi music-ai không sinh lại được, FILE_NOT_EXISTED (2002) nếu file không có.
     */
    ScoreContent getMidi(String scoreId);
}
