package com.ptit.music_be.exception;

import org.springframework.http.HttpStatusCode;

import com.ptit.music_be.exception.code.AccountErrorCode;
import com.ptit.music_be.exception.code.AiErrorCode;
import com.ptit.music_be.exception.code.BillingErrorCode;
import com.ptit.music_be.exception.code.CollabErrorCode;
import com.ptit.music_be.exception.code.CommunityErrorCode;
import com.ptit.music_be.exception.code.LibraryErrorCode;
import com.ptit.music_be.exception.code.ScoreErrorCode;
import com.ptit.music_be.exception.code.TeamErrorCode;

/**
 * Mã lỗi nghiệp vụ. Được chia thành nhiều enum theo nhóm trong package {@code exception.code}
 * (mỗi nhóm một dải mã số); mọi enum đều implement interface này.
 */
public interface ErrorCode {
    ErrorCode[][] ALL = {
        AccountErrorCode.values(),
        ScoreErrorCode.values(),
        AiErrorCode.values(),
        LibraryErrorCode.values(),
        CollabErrorCode.values(),
        BillingErrorCode.values(),
        TeamErrorCode.values(),
        CommunityErrorCode.values()
    };

    int getCode();

    String getMessage();

    HttpStatusCode getHttpStatusCode();

    String name();

    /** Tìm mã lỗi theo tên ở mọi nhóm; ném {@link IllegalArgumentException} nếu không có. */
    static ErrorCode valueOf(String name) {
        for (ErrorCode[] group : ALL) {
            for (ErrorCode code : group) {
                if (code.name().equals(name)) {
                    return code;
                }
            }
        }
        throw new IllegalArgumentException("No error code named " + name);
    }
}
