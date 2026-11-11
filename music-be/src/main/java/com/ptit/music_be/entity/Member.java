package com.ptit.music_be.entity;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.*;

import org.hibernate.annotations.CreationTimestamp;

import com.ptit.music_be.converter.AuthProviderConverter;
import com.ptit.music_be.converter.MemberStatusConverter;
import com.ptit.music_be.dto.enums.AppLocale;
import com.ptit.music_be.dto.enums.AuthProvider;
import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.dto.enums.UiTheme;

import lombok.*;
import lombok.experimental.FieldDefaults;

@Entity
@Table(name = "members")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE)
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    String id;

    @Column(nullable = false, unique = true)
    String email;

    @Column(name = "password_hash")
    String passwordHash;

    @Column(name = "full_name")
    String fullName;

    @Column(length = 30)
    String phone;

    String address;

    /** Public Cloudinary URL of the avatar (public id = avatars/{memberId}). */
    @Column(name = "avatar_url", length = 512)
    String avatarUrl;

    @Convert(converter = MemberStatusConverter.class)
    @Column(name = "status")
    MemberStatus status;

    @Column(name = "email_verified")
    Boolean emailVerified;

    @Convert(converter = AuthProviderConverter.class)
    @Column(name = "auth_provider")
    AuthProvider authProvider;

    /** Giao diện đã chọn (sáng/tối/theo hệ thống); null là chưa chọn, hiểu là theo hệ thống. */
    @Enumerated(EnumType.STRING)
    @Column(name = "ui_theme", length = 10)
    UiTheme uiTheme;

    /** Ngôn ngữ đã chọn (VI / EN); null là chưa chọn, hiểu là tiếng Việt. Dùng cho giao diện và email. */
    @Enumerated(EnumType.STRING)
    @Column(name = "locale", length = 5)
    AppLocale locale;

    /** Ngày đăng ký; null với tài khoản tạo trước khi có cột này. */
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    LocalDateTime createdAt;

    /** Lần đăng nhập gần nhất (đăng nhập thường hoặc Google). */
    @Column(name = "last_login_at")
    LocalDateTime lastLoginAt;

    /** Lần đổi/đặt lại mật khẩu gần nhất (làm tròn xuống giây); mọi token cấp trước mốc này bị từ chối. */
    @Column(name = "password_changed_at")
    LocalDateTime passwordChangedAt;

    /** Mã giới thiệu của chính thành viên (7.5), sinh khi cần. */
    @Column(name = "referral_code", length = 12, unique = true)
    String referralCode;

    /** Id người đã mời (nhập mã lúc đăng ký), null nếu tự đăng ký. */
    @Column(name = "referred_by", length = 36)
    String referredBy;

    /** Đã thưởng cho lời mời lúc nào (khi số hóa xong bản đầu tiên); null = chưa. */
    @Column(name = "referral_rewarded_at")
    LocalDateTime referralRewardedAt;

    @OneToMany(mappedBy = "member", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<MemberRole> memberRoles = new ArrayList<>();

    @OneToMany(mappedBy = "member", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<Playlist> playlists = new ArrayList<>();

    @OneToMany(mappedBy = "member", cascade = CascadeType.ALL)
    @Builder.Default
    List<Score> scores = new ArrayList<>();

    @OneToMany(mappedBy = "member", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<MemberScore> memberScores = new ArrayList<>();

    @OneToMany(mappedBy = "member", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    List<PracticeSession> practiceSessions = new ArrayList<>();
}
