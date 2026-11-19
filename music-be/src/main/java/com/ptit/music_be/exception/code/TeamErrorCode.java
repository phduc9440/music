package com.ptit.music_be.exception.code;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

import com.ptit.music_be.exception.ErrorCode;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.experimental.FieldDefaults;

/** Team và Show (38xx). */
@Getter
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public enum TeamErrorCode implements ErrorCode {
    // ---- 38xx: Team và Show (mục 4.1)
    TEAM_NOT_EXISTED(3801, "Không tìm thấy nhóm hoặc bạn không ở trong nhóm này", HttpStatus.NOT_FOUND),
    TEAM_FORBIDDEN(3802, "Vai trò của bạn trong nhóm chưa được cấp quyền làm việc này", HttpStatus.FORBIDDEN),
    TEAM_PLAN_REQUIRED(3803, "Cần gói nhóm để tạo nhóm hoặc mời thêm thành viên", HttpStatus.PAYMENT_REQUIRED),
    TEAM_NAME_INVALID(3804, "Tên nhóm từ 1 đến 100 ký tự, mô tả tối đa 1000 ký tự", HttpStatus.BAD_REQUEST),
    TEAM_MEMBER_LIMIT(3805, "Nhóm đã đủ số thành viên theo gói (tính cả lời mời đang chờ)", HttpStatus.CONFLICT),
    TEAM_ROLE_INVALID(3806, "Vai trò không hợp lệ hoặc bạn không được gán vai trò này", HttpStatus.BAD_REQUEST),
    TEAM_LAST_OWNER(3807, "Nhóm phải còn ít nhất một chủ nhóm", HttpStatus.CONFLICT),
    TEAM_MEMBER_NOT_EXISTED(3808, "Người này không ở trong nhóm", HttpStatus.NOT_FOUND),
    TEAM_ALREADY_MEMBER(3809, "Người này đã ở trong nhóm", HttpStatus.CONFLICT),
    TEAM_INVITATION_INVALID(3810, "Lời mời không tồn tại, đã hết hạn hoặc đã được dùng", HttpStatus.GONE),
    TEAM_INVITATION_EMAIL_MISMATCH(
            3811, "Lời mời này gửi cho một email khác; hãy đăng nhập đúng tài khoản được mời", HttpStatus.FORBIDDEN),
    TEAM_INVITATION_DUPLICATED(3812, "Email này đang có lời mời chờ chấp nhận", HttpStatus.CONFLICT),
    TEAM_EMAIL_INVALID(3813, "Email không hợp lệ", HttpStatus.BAD_REQUEST),
    TEAM_SCORE_NOT_OWNER(3814, "Chỉ chủ bản nhạc mới chuyển được bản đó vào nhóm", HttpStatus.FORBIDDEN),
    TEAM_SCORE_IN_OTHER_TEAM(3815, "Bản nhạc đã thuộc một nhóm khác", HttpStatus.CONFLICT),
    TEAM_SCORE_NOT_IN_TEAM(3816, "Bản nhạc không thuộc nhóm này", HttpStatus.BAD_REQUEST),
    TEAM_SCORE_OFFICIAL(3817, "Bản trong kho bản nhạc mẫu không chuyển vào nhóm được", HttpStatus.BAD_REQUEST),
    TEAM_RESTORE_EXPIRED(3818, "Đã quá 30 ngày kể từ lúc xóa nên không khôi phục được nữa", HttpStatus.GONE),
    TEAM_RESTORE_BY_ADMIN_ONLY(
            3819, "Nhóm do quản trị viên xóa vì vi phạm; chỉ quản trị viên khôi phục được", HttpStatus.FORBIDDEN),
    SHOW_NOT_EXISTED(3820, "Không tìm thấy buổi diễn", HttpStatus.NOT_FOUND),
    SHOW_INVALID(
            3821,
            "Tên buổi diễn từ 1 đến 255 ký tự; địa điểm tối đa 255, ghi chú tối đa 2000 ký tự",
            HttpStatus.BAD_REQUEST),
    SHOW_ITEM_NOT_EXISTED(3822, "Không tìm thấy bài trong buổi diễn", HttpStatus.NOT_FOUND),
    SHOW_ITEM_DUPLICATED(3823, "Bài này đã có trong buổi diễn", HttpStatus.CONFLICT),
    SHOW_ITEM_ASSIGNEE_INVALID(
            3824,
            "Người phối và người duyệt phải là thành viên nhóm (không phải người chỉ xem)",
            HttpStatus.BAD_REQUEST),
    SHOW_ITEM_TRANSITION_INVALID(3825, "Bạn không chuyển được bài sang trạng thái này", HttpStatus.FORBIDDEN),
    SHOW_ITEM_NO_REVIEWER(
            3826, "Bài chưa có người duyệt; nhờ quản lý nhóm giao người duyệt trước khi gửi", HttpStatus.CONFLICT),
    SHOW_ITEM_NOTE_REQUIRED(3827, "Trả lại bài cần kèm góp ý (tối đa 500 ký tự)", HttpStatus.BAD_REQUEST),
    SHOW_ORDER_INVALID(3828, "Danh sách thứ tự phải gồm đủ và đúng các bài của buổi diễn", HttpStatus.BAD_REQUEST),
    SHOW_RESTORE_EXPIRED(3829, "Đã quá 30 ngày kể từ lúc xóa buổi diễn nên không khôi phục được nữa", HttpStatus.GONE),
    TEAM_OWNER_ONLY(3830, "Chỉ chủ nhóm mới làm được việc này", HttpStatus.FORBIDDEN),
    TEAM_ROLE_SCOPE(
            3831, "Vai trò của bạn không được mời, đổi vai trò hoặc xóa người có vai trò này", HttpStatus.FORBIDDEN),
    SHOW_ITEM_APPROVED_LOCKED(
            3832, "Bài đã duyệt: chỉ người duyệt của bài mới mở lại hoặc đổi người duyệt được", HttpStatus.FORBIDDEN),
    ;

    int code;
    String message;
    HttpStatusCode httpStatusCode;

    TeamErrorCode(int code, String message, HttpStatusCode httpStatusCode) {
        this.code = code;
        this.message = message;
        this.httpStatusCode = httpStatusCode;
    }
}
