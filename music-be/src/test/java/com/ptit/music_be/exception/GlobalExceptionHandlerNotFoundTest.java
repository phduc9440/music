package com.ptit.music_be.exception;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.ptit.music_be.exception.code.AccountErrorCode;

/** N-07: đường dẫn /api không tồn tại trả 404 mã 1027, không thành lỗi 500. */
class GlobalExceptionHandlerNotFoundTest {

    @Test
    void unknownPathIs404() {
        var response = new GlobalExceptionHandler()
                .handlingNotFound(new NoResourceFoundException(HttpMethod.GET, "api/khong-co"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().getCode()).isEqualTo(AccountErrorCode.API_NOT_FOUND.getCode());
    }
}
