package com.ptit.music_be.entity;

import jakarta.persistence.*;

import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import com.ptit.music_be.dto.enums.score.SuggestionChangeStatus;

import lombok.*;
import lombok.experimental.FieldDefaults;

/** Một ô nhịp khác nhau trong {@link ScoreSuggestion}, kèm mã băm để phát hiện xung đột và lỗi thời. */
@Entity
@Table(name = "score_suggestion_changes")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreSuggestionChange {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "suggestion_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    ScoreSuggestion suggestion;

    /** Thứ tự part, từ 0. */
    @Column(name = "part_index", nullable = false)
    Integer partIndex;

    /** Thứ tự ô trong part, từ 0. */
    @Column(name = "measure_index", nullable = false)
    Integer measureIndex;

    /** Thuộc tính {@code number} của ô để hiển thị. */
    @Column(name = "measure_number", length = 16)
    String measureNumber;

    /** {@code MeasureHasher} của ô ở version gốc. */
    @Column(name = "base_hash", nullable = false, length = 64)
    String baseHash;

    /** Mã ngữ cảnh (divisions, khóa, nhịp, khóa nhạc) hiệu lực tại đầu ô lúc gửi. */
    @Column(name = "context_hash", nullable = false, length = 64)
    String contextHash;

    /** Phần tử {@code <measure>} do người đề xuất sửa. */
    @Column(name = "proposed_xml", nullable = false, columnDefinition = "MEDIUMTEXT")
    String proposedXml;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    SuggestionChangeStatus status;
}
