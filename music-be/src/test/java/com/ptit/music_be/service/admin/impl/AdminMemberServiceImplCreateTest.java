package com.ptit.music_be.service.admin.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.ptit.music_be.dto.enums.auth.AuthProvider;
import com.ptit.music_be.dto.enums.auth.MemberStatus;
import com.ptit.music_be.dto.request.admin.AdminCreateMemberRequest;
import com.ptit.music_be.dto.response.auth.MemberResponse;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberRole;
import com.ptit.music_be.entity.Role;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.mapper.MemberMapper;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.auth.RoleRepository;

/**
 * Admin tạo tài khoản: tự đặt mật khẩu, tài khoản coi như đã xác thực email, luôn có USER; không ai gán SUPER_ADMIN và
 * người không phải SUPER_ADMIN không gán được vai trò vượt quyền của mình.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AdminMemberServiceImplCreateTest {

    @Mock
    MemberRepository memberRepository;

    @Mock
    RoleRepository roleRepository;

    @Mock
    MemberMapper memberMapper;

    @Mock
    PasswordEncoder passwordEncoder;

    @InjectMocks
    AdminMemberServiceImpl service;

    @BeforeEach
    void setUp() {
        for (String name : List.of("USER", "ADMIN", "SUPER_ADMIN")) {
            when(roleRepository.findByName(name))
                    .thenReturn(Optional.of(
                            Role.builder().id("r-" + name).name(name).build()));
        }
        when(memberRepository.existsByEmail(anyString())).thenReturn(false);
        when(memberRepository.findByEmail("boss@x.com"))
                .thenReturn(Optional.of(
                        Member.builder().id("boss").email("boss@x.com").build()));
        when(memberRepository.save(any(Member.class))).thenAnswer(inv -> inv.getArgument(0));
        when(memberMapper.toMemberResponse(any())).thenReturn(new MemberResponse());
        when(passwordEncoder.encode(anyString())).thenAnswer(inv -> "hash:" + inv.getArgument(0));
        as("ROLE_SUPER_ADMIN");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static void as(String role) {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("boss@x.com", "x", role));
    }

    private static AdminCreateMemberRequest request(String email, String password, List<String> roles) {
        return AdminCreateMemberRequest.builder()
                .email(email)
                .password(password)
                .fullName("Nguyễn Văn Mới")
                .phone("0900000000")
                .roles(roles)
                .build();
    }

    private Member saved() {
        ArgumentCaptor<Member> captor = ArgumentCaptor.forClass(Member.class);
        verify(memberRepository).save(captor.capture());
        return captor.getValue();
    }

    private static List<String> roleNames(Member member) {
        return member.getMemberRoles().stream()
                .map(MemberRole::getRole)
                .map(Role::getName)
                .sorted()
                .toList();
    }

    private ErrorCode errorOf(Runnable action) {
        return catchThrowableOfType(AppException.class, action::run).getErrorCode();
    }

    @Test
    void superAdminCreatesVerifiedAccountWithChosenRoles() {
        service.createMember(request("  New.Admin@X.com ", "matkhau123", List.of("ADMIN")));

        Member member = saved();
        assertThat(member.getEmail()).isEqualTo("new.admin@x.com");
        assertThat(member.getPasswordHash()).isEqualTo("hash:matkhau123");
        assertThat(member.getEmailVerified()).isTrue();
        assertThat(member.getStatus()).isEqualTo(MemberStatus.ACTIVE);
        assertThat(member.getAuthProvider()).isEqualTo(AuthProvider.LOCAL);
        assertThat(member.getFullName()).isEqualTo("Nguyễn Văn Mới");
        assertThat(roleNames(member)).containsExactly("ADMIN", "USER");
        assertThat(member.getMemberRoles()).allSatisfy(mr -> {
            assertThat(mr.getMember()).isSameAs(member);
            assertThat(mr.getGrantedBy().getId()).isEqualTo("boss");
        });
    }

    @Test
    void noRolesMeansPlainUser() {
        service.createMember(request("user2@x.com", "matkhau123", null));

        assertThat(roleNames(saved())).containsExactly("USER");
    }

    @Test
    void duplicateEmailIsRejected() {
        when(memberRepository.existsByEmail("taken@x.com")).thenReturn(true);

        assertThat(errorOf(() -> service.createMember(request("taken@x.com", "matkhau123", null))))
                .isEqualTo(ErrorCode.USER_EXISTED);
        verify(memberRepository, never()).save(any());
    }

    @Test
    void invalidEmailAndShortPasswordAreRejected() {
        assertThat(errorOf(() -> service.createMember(request("not-an-email", "matkhau123", null))))
                .isEqualTo(ErrorCode.MEMBER_EMAIL_INVALID);
        assertThat(errorOf(() -> service.createMember(request("ok@x.com", "short", null))))
                .isEqualTo(ErrorCode.PASSWORD_INVALID);
        verify(memberRepository, never()).save(any());
    }

    @Test
    void nobodyCanCreateASuperAdmin() {
        assertThat(errorOf(() -> service.createMember(request("root@x.com", "matkhau123", List.of("SUPER_ADMIN")))))
                .isEqualTo(ErrorCode.ROLE_ASSIGN_FORBIDDEN);
        verify(memberRepository, never()).save(any());
    }

    @Test
    void creatorWithoutAdminPowersCannotHandOutAdmin() {
        // Vai trò tự tạo chỉ được tích quyền tạo tài khoản: quyền của nó nhỏ hơn quyền của ADMIN
        as("ROLE_HR");

        assertThat(errorOf(() -> service.createMember(request("x@x.com", "matkhau123", List.of("ADMIN")))))
                .isEqualTo(ErrorCode.ROLE_ASSIGN_FORBIDDEN);
        verify(memberRepository, never()).save(any());
    }

    @Test
    void adminCanHandOutRolesWithinOwnPermissions() {
        as("ROLE_ADMIN");

        service.createMember(request("helper@x.com", "matkhau123", List.of("ADMIN")));

        assertThat(roleNames(saved())).containsExactly("ADMIN", "USER");
    }

    @Test
    void unknownRoleIsRejected() {
        assertThat(errorOf(() -> service.createMember(request("x@x.com", "matkhau123", List.of("GHOST")))))
                .isEqualTo(ErrorCode.ROLE_NOT_EXISTED);
    }
}
