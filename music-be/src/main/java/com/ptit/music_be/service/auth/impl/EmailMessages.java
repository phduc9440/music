package com.ptit.music_be.service.auth.impl;

import java.util.Map;

import com.ptit.music_be.dto.enums.auth.AppLocale;
import com.ptit.music_be.dto.enums.notification.NotificationCategory;
import com.ptit.music_be.dto.enums.team.TeamRole;

/**
 * Nội dung email theo ngôn ngữ của người nhận (mục 6.2). Tiếng Việt là bản dự phòng khi chưa chọn ngôn ngữ. Chuỗi dùng
 * {@code %s} cho phần ghép vào; giá trị do người dùng nhập phải được escape HTML trước khi truyền vào.
 */
final class EmailMessages {

    private EmailMessages() {}

    enum Key {
        SIGNOFF,
        WELCOME_SUBJECT,
        WELCOME_HEADING,
        WELCOME_BODY,
        FORGOT_SUBJECT,
        FORGOT_HEADING,
        FORGOT_INTRO,
        FORGOT_CODE_LABEL,
        FORGOT_VALIDITY,
        FORGOT_IGNORE,
        CHANGED_SUBJECT,
        CHANGED_HEADING,
        CHANGED_HELLO,
        CHANGED_VIA_RESET,
        CHANGED_VIA_SETTINGS,
        CHANGED_BODY,
        CHANGED_WARNING,
        INVITE_SUBJECT,
        INVITE_HEADING,
        INVITE_BODY,
        INVITE_BUTTON,
        INVITE_FOOTER,
        DIGEST_SUBJECT,
        DIGEST_HEADING,
        DIGEST_INTRO,
        DIGEST_BUTTON,
        DIGEST_FOOTER
    }

    private static final Map<Key, String> VI = Map.ofEntries(
            Map.entry(Key.SIGNOFF, "Trân trọng,<br><strong>Đội ngũ Scorewise</strong>"),
            Map.entry(Key.WELCOME_SUBJECT, "Chào mừng bạn đến với Scorewise"),
            Map.entry(Key.WELCOME_HEADING, "Xin chào %s,"),
            Map.entry(
                    Key.WELCOME_BODY,
                    "<p>Cảm ơn bạn đã đăng ký tài khoản Scorewise.</p><p>Chúc bạn có những giờ luyện tập thật vui!</p>"),
            Map.entry(Key.FORGOT_SUBJECT, "Mã đặt lại mật khẩu Scorewise"),
            Map.entry(Key.FORGOT_HEADING, "Đặt lại mật khẩu"),
            Map.entry(Key.FORGOT_INTRO, "<p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản Scorewise.</p>"),
            Map.entry(Key.FORGOT_CODE_LABEL, "<p>Mã xác nhận (OTP) của bạn:</p>"),
            Map.entry(
                    Key.FORGOT_VALIDITY,
                    "<p>Mã có hiệu lực trong <strong>5 phút</strong> và chỉ dùng được một lần. Không chia sẻ mã này"
                            + " với bất kỳ ai, kể cả người tự xưng là nhân viên Scorewise.</p>"),
            Map.entry(
                    Key.FORGOT_IGNORE,
                    "<p style=\"color:#475569\">Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu của bạn vẫn"
                            + " giữ nguyên.</p>"),
            Map.entry(Key.CHANGED_SUBJECT, "Mật khẩu Scorewise của bạn vừa được thay đổi"),
            Map.entry(Key.CHANGED_HEADING, "Mật khẩu đã được thay đổi"),
            Map.entry(Key.CHANGED_HELLO, "<p>Xin chào %s,</p>"),
            Map.entry(Key.CHANGED_VIA_RESET, "đặt lại bằng mã OTP"),
            Map.entry(Key.CHANGED_VIA_SETTINGS, "đổi trong phần cài đặt tài khoản"),
            Map.entry(
                    Key.CHANGED_BODY,
                    "<p>Mật khẩu tài khoản Scorewise của bạn vừa được %s lúc <strong>%s</strong>. Các thiết bị đang"
                            + " đăng nhập khác đã bị đăng xuất.</p>"),
            Map.entry(
                    Key.CHANGED_WARNING,
                    "<p style=\"color:#b91c1c\"><strong>Nếu không phải bạn thực hiện</strong>, hãy dùng chức năng"
                            + " “Quên mật khẩu” để đặt lại ngay và liên hệ quản trị viên.</p>"),
            Map.entry(Key.INVITE_SUBJECT, "Lời mời tham gia nhóm %s trên Scorewise"),
            Map.entry(Key.INVITE_HEADING, "Bạn được mời vào nhóm %s"),
            Map.entry(
                    Key.INVITE_BODY,
                    "<p><strong>%s</strong> mời bạn tham gia nhóm <strong>%s</strong> với vai trò <strong>%s</strong>.</p>"),
            Map.entry(Key.INVITE_BUTTON, "Xem lời mời"),
            Map.entry(
                    Key.INVITE_FOOTER,
                    "<p style=\"color:#475569\">Lời mời có hạn 7 ngày và chỉ dùng được một lần. Nếu chưa có tài"
                            + " khoản, hãy đăng ký bằng chính email này rồi mở lại link.</p>"),
            Map.entry(Key.DIGEST_SUBJECT, "Bạn có %s thông báo chưa đọc trên Scorewise"),
            Map.entry(Key.DIGEST_HEADING, "Tóm tắt thông báo hôm nay"),
            Map.entry(Key.DIGEST_INTRO, "<p>Trong 24 giờ qua bạn có <strong>%s</strong> thông báo chưa đọc:</p>"),
            Map.entry(Key.DIGEST_BUTTON, "Mở thông báo"),
            Map.entry(
                    Key.DIGEST_FOOTER,
                    "<p style=\"color:#475569\">Bạn nhận email này vì đã bật email tóm tắt hằng ngày. Có thể tắt trong"
                            + " Cài đặt thông báo.</p>"));

    private static final Map<Key, String> EN = Map.ofEntries(
            Map.entry(Key.SIGNOFF, "Best regards,<br><strong>The Scorewise team</strong>"),
            Map.entry(Key.WELCOME_SUBJECT, "Welcome to Scorewise"),
            Map.entry(Key.WELCOME_HEADING, "Hello %s,"),
            Map.entry(
                    Key.WELCOME_BODY, "<p>Thanks for creating your Scorewise account.</p><p>Enjoy your practice!</p>"),
            Map.entry(Key.FORGOT_SUBJECT, "Your Scorewise password reset code"),
            Map.entry(Key.FORGOT_HEADING, "Reset your password"),
            Map.entry(Key.FORGOT_INTRO, "<p>You asked to reset the password of your Scorewise account.</p>"),
            Map.entry(Key.FORGOT_CODE_LABEL, "<p>Your verification code (OTP):</p>"),
            Map.entry(
                    Key.FORGOT_VALIDITY,
                    "<p>The code is valid for <strong>5 minutes</strong> and can be used once. Never share it with"
                            + " anyone, even someone claiming to be Scorewise staff.</p>"),
            Map.entry(
                    Key.FORGOT_IGNORE,
                    "<p style=\"color:#475569\">If you did not ask for this, ignore this email. Your password stays"
                            + " the same.</p>"),
            Map.entry(Key.CHANGED_SUBJECT, "Your Scorewise password was changed"),
            Map.entry(Key.CHANGED_HEADING, "Your password was changed"),
            Map.entry(Key.CHANGED_HELLO, "<p>Hello %s,</p>"),
            Map.entry(Key.CHANGED_VIA_RESET, "reset with an OTP code"),
            Map.entry(Key.CHANGED_VIA_SETTINGS, "changed in your account settings"),
            Map.entry(
                    Key.CHANGED_BODY,
                    "<p>The password of your Scorewise account was just %s at <strong>%s</strong>. Other signed-in"
                            + " devices have been signed out.</p>"),
            Map.entry(
                    Key.CHANGED_WARNING,
                    "<p style=\"color:#b91c1c\"><strong>If this wasn't you</strong>, use “Forgot password” to reset it"
                            + " right away and contact an administrator.</p>"),
            Map.entry(Key.INVITE_SUBJECT, "Invitation to join the team %s on Scorewise"),
            Map.entry(Key.INVITE_HEADING, "You're invited to the team %s"),
            Map.entry(
                    Key.INVITE_BODY,
                    "<p><strong>%s</strong> invited you to join the team <strong>%s</strong> as <strong>%s</strong>.</p>"),
            Map.entry(Key.INVITE_BUTTON, "View invitation"),
            Map.entry(
                    Key.INVITE_FOOTER,
                    "<p style=\"color:#475569\">The invitation expires in 7 days and can be used once. If you don't"
                            + " have an account yet, sign up with this same email and open the link again.</p>"),
            Map.entry(Key.DIGEST_SUBJECT, "You have %s unread notifications on Scorewise"),
            Map.entry(Key.DIGEST_HEADING, "Today's notification summary"),
            Map.entry(
                    Key.DIGEST_INTRO, "<p>In the last 24 hours you got <strong>%s</strong> unread notifications:</p>"),
            Map.entry(Key.DIGEST_BUTTON, "Open notifications"),
            Map.entry(
                    Key.DIGEST_FOOTER,
                    "<p style=\"color:#475569\">You get this email because the daily email digest is on. You can turn"
                            + " it off in Notification settings.</p>"));

    private static final Map<TeamRole, String> ROLE_VI = Map.of(
            TeamRole.OWNER, "Chủ nhóm",
            TeamRole.MANAGER, "Quản lý",
            TeamRole.ARRANGER, "Người phối",
            TeamRole.VIEWER, "Người xem");

    private static final Map<TeamRole, String> ROLE_EN = Map.of(
            TeamRole.OWNER, "Owner",
            TeamRole.MANAGER, "Manager",
            TeamRole.ARRANGER, "Arranger",
            TeamRole.VIEWER, "Viewer");

    /** Chuỗi theo ngôn ngữ (null được hiểu là tiếng Việt), thay các {@code %s} bằng {@code args}. */
    static String text(AppLocale locale, Key key, Object... args) {
        String template = (locale == AppLocale.EN ? EN : VI).get(key);
        return args.length == 0 ? template : String.format(template, args);
    }

    private static final Map<NotificationCategory, String> CATEGORY_VI = Map.of(
            NotificationCategory.SCORES, "Bản nhạc",
            NotificationCategory.COMMENTS, "Góp ý và đề xuất",
            NotificationCategory.TEAMS, "Nhóm và buổi diễn",
            NotificationCategory.FORUM, "Diễn đàn",
            NotificationCategory.BILLING, "Gói dịch vụ",
            NotificationCategory.SYSTEM, "Thông báo chung");

    private static final Map<NotificationCategory, String> CATEGORY_EN = Map.of(
            NotificationCategory.SCORES, "Scores",
            NotificationCategory.COMMENTS, "Comments and suggestions",
            NotificationCategory.TEAMS, "Teams and shows",
            NotificationCategory.FORUM, "Forum",
            NotificationCategory.BILLING, "Plan",
            NotificationCategory.SYSTEM, "Announcements");

    static String category(AppLocale locale, NotificationCategory category) {
        return (locale == AppLocale.EN ? CATEGORY_EN : CATEGORY_VI).get(category);
    }

    static String role(AppLocale locale, TeamRole role) {
        return (locale == AppLocale.EN ? ROLE_EN : ROLE_VI).get(role);
    }
}
