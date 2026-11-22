package com.ptit.music_be.service.ai.impl;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/** OMR-T01: dấu vân tay các file gốc để nhận ra upload gửi trùng. */
class OmrUploadFingerprintTest {

    private static MockMultipartFile file(String name, String content) {
        return new MockMultipartFile("files", name, "image/png", content.getBytes());
    }

    @Test
    void sameFilesGiveTheSameFingerprintWhateverTheirNames() {
        String first = OmrServiceImpl.fingerprint(List.of(file("a.png", "page-1"), file("b.png", "page-2")));
        String again = OmrServiceImpl.fingerprint(List.of(file("x.png", "page-1"), file("y.png", "page-2")));
        assertThat(first).isEqualTo(again).hasSize(64);
    }

    @Test
    void orderAndFileBoundariesMatter() {
        String ab = OmrServiceImpl.fingerprint(List.of(file("a.png", "page-1"), file("b.png", "page-2")));
        String ba = OmrServiceImpl.fingerprint(List.of(file("b.png", "page-2"), file("a.png", "page-1")));
        String joined = OmrServiceImpl.fingerprint(List.of(file("ab.png", "page-1page-2")));
        assertThat(ab).isNotEqualTo(ba).isNotEqualTo(joined);
    }
}
