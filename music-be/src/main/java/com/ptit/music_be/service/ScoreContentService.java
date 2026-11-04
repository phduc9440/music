package com.ptit.music_be.service;

/** Đọc nội dung các file kết quả của bản nhạc (kern, về sau MusicXML và MIDI; đặc tả mục 7.1). */
public interface ScoreContentService {

    /**
     * Trả chuỗi kern đã ghép của bản nhạc ({@code kern/merged.krn} hiện hành), mã hóa UTF-8.
     *
     * <p>Cần quyền xem bản nhạc (UNAUTHORIZED). Lỗi: SCORE_NOT_EXISTED (2001) nếu không có bản nhạc,
     * FILE_NOT_EXISTED (2002) nếu chưa có kern hoặc file đã mất trên đĩa.
     */
    String getKern(String scoreId);
}
