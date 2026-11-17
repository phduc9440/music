package com.ptit.music_be.exception;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.validation.Valid;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.ptit.music_be.dto.request.auth.LoginRequest;

/** Câu lỗi kiểm tra dữ liệu: chỉ điền {min} khi ràng buộc có độ dài tối thiểu, không bao giờ in ra "null". */
class GlobalExceptionHandlerValidationTest {

    @RestController
    static class LoginStub {
        @PostMapping("/login")
        String login(@Valid @RequestBody LoginRequest request) {
            return "ok";
        }
    }

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new LoginStub())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void blankUsername_hasMessageWithoutNull() throws Exception {
        mvc.perform(post("/login").contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"secret123\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(1006))
                .andExpect(jsonPath("$.message").value("Vui lòng nhập email"));
    }

    @Test
    void shortPassword_stillFillsMin() throws Exception {
        mvc.perform(post("/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"a@b.c\",\"password\":\"123\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(1007))
                .andExpect(jsonPath("$.message").value("Mật khẩu phải có ít nhất 6 ký tự"));
    }
}
