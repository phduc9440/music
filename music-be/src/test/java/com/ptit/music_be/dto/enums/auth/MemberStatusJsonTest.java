package com.ptit.music_be.dto.enums.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

/** A-05: trạng thái thành viên nhận cả số lẫn tên, vẫn trả dạng số. */
class MemberStatusJsonTest {

    final ObjectMapper mapper = new ObjectMapper();

    @Test
    void readsNumbersAndNames() throws Exception {
        assertThat(mapper.readValue("2", MemberStatus.class)).isEqualTo(MemberStatus.INACTIVE);
        assertThat(mapper.readValue("\"1\"", MemberStatus.class)).isEqualTo(MemberStatus.ACTIVE);
        assertThat(mapper.readValue("\"LOCKED\"", MemberStatus.class)).isEqualTo(MemberStatus.INACTIVE);
        assertThat(mapper.readValue("\"active\"", MemberStatus.class)).isEqualTo(MemberStatus.ACTIVE);
        assertThat(mapper.writeValueAsString(MemberStatus.INACTIVE)).isEqualTo("2");
    }
}
