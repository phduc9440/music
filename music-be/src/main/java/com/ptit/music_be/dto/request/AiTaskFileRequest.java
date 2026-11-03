package com.ptit.music_be.dto.request;

import java.util.Map;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.ptit.music_be.dto.enums.FileType;

import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.experimental.FieldDefaults;

/** Body của {@code POST /internal/ai-tasks/{taskId}/files}: music-ai báo đã ghi xong một file kết quả. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class AiTaskFileRequest {

    /** Loại file (nhánh này chỉ PNG). Không nhận ORIGINAL_*: file gốc do Java tạo lúc upload. */
    @NotNull(message = "INVALID_REQUEST")
    FileType fileType;

    /** Đường dẫn tương đối trong storage, bắt buộc nằm trong scores/{scoreId}/ và file phải tồn tại. */
    @NotBlank(message = "INVALID_REQUEST")
    @Size(max = 512, message = "INVALID_REQUEST")
    String storagePath;

    @Min(value = 1, message = "INVALID_REQUEST")
    Integer pageNumber;

    @Size(max = 128, message = "INVALID_REQUEST")
    String contentType;

    @Min(value = 0, message = "INVALID_REQUEST")
    Long sizeBytes;

    /** Thông tin thêm, ví dụ {"width":1050,"height":1485,"deskewAngle":-1.8,"sourcePage":2}. */
    Map<String, Object> meta;
}
