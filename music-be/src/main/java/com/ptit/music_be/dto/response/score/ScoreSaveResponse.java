package com.ptit.music_be.dto.response;

import java.time.LocalDateTime;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

/** Kết quả lưu MusicXML từ Editor (đặc tả mục 3.6). */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class ScoreSaveResponse {
    /** Version mới của MusicXML; cũng là giá trị ETag {@code "v{version}"} trả kèm. */
    int version;

    int measureCount;
    String keySignature;
    String timeSignature;
    int tempoBpm;
    LocalDateTime updatedAt;
}
