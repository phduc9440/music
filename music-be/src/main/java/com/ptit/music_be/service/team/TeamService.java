package com.ptit.music_be.service.team;

import java.util.List;

import com.ptit.music_be.dto.enums.team.TeamRole;
import com.ptit.music_be.dto.request.team.TeamInviteRequest;
import com.ptit.music_be.dto.request.team.TeamPermissionsRequest;
import com.ptit.music_be.dto.request.team.TeamRequest;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.team.RestorableItemResponse;
import com.ptit.music_be.dto.response.team.TeamActivityResponse;
import com.ptit.music_be.dto.response.team.TeamInvitationPreviewResponse;
import com.ptit.music_be.dto.response.team.TeamInvitationResponse;
import com.ptit.music_be.dto.response.team.TeamMemberResponse;
import com.ptit.music_be.dto.response.team.TeamPermissionsResponse;
import com.ptit.music_be.dto.response.team.TeamResponse;
import com.ptit.music_be.dto.response.team.TeamScoreResponse;
import com.ptit.music_be.dto.response.team.TeamTaskResponse;

/** Team (mục 4.1): team, thành viên, lời mời, bản nhạc của team, nhật ký hoạt động, việc của tôi trong Show. */
public interface TeamService {

    List<TeamResponse> myTeams();

    /** Tạo team (cần gói có quyền lợi team); người tạo là OWNER. */
    TeamResponse create(TeamRequest request);

    TeamResponse get(String teamId);

    /** Sửa tên, mô tả: cần quyền EDIT_TEAM (mặc định chỉ chủ nhóm). */
    TeamResponse update(String teamId, TeamRequest request);

    /** Chỉ OWNER: xóa mềm team (báo cho các thành viên); khôi phục được trong 30 ngày. Bản nhạc vẫn ở thư viện của chủ. */
    void delete(String teamId);

    /** Team tôi là chủ đã tự xóa, còn trong hạn 30 ngày khôi phục (không gồm team bị quản trị viên xóa). */
    List<RestorableItemResponse> deletedTeams();

    /** Chỉ OWNER khôi phục team mình đã xóa (trong 30 ngày, không phải team bị quản trị viên xóa). */
    TeamResponse restore(String teamId);

    List<TeamMemberResponse> members(String teamId);

    /**
     * Đổi vai trò theo bảng quyền: người phối / người xem cần MANAGE_MEMBERS, quản lý cần MANAGE_MANAGERS, chủ nhóm chỉ
     * OWNER (TEAM_ROLE_SCOPE nếu vượt); không tự đổi vai trò mình; team luôn còn ít nhất một OWNER.
     */
    TeamMemberResponse changeRole(String teamId, String memberId, TeamRole role);

    /** Xóa thành viên (theo cùng luật với đổi vai trò) hoặc tự rời team (memberId là chính mình). */
    void removeMember(String teamId, String memberId);

    /** Mọi thành viên xem bảng quyền của team; editable = người xem là chủ nhóm. */
    TeamPermissionsResponse permissions(String teamId);

    /** Chỉ OWNER: bật / tắt quyền của MANAGER, ARRANGER, VIEWER (ghi nhật ký PERMISSIONS_CHANGED cho vai trò có thay đổi). */
    TeamPermissionsResponse updatePermissions(String teamId, TeamPermissionsRequest request);

    /** Người có quyền mời (MANAGE_MEMBERS hoặc MANAGE_MANAGERS): các lời mời còn chờ. */
    List<TeamInvitationResponse> invitations(String teamId);

    /**
     * Mời theo email (gửi email + thông báo nếu đã có tài khoản) hoặc tạo link mời; mời làm MANAGER cần MANAGE_MANAGERS.
     */
    TeamInvitationResponse invite(String teamId, TeamInviteRequest request);

    void revokeInvitation(String teamId, String invitationId);

    /** Xem trước lời mời từ mã trong link. */
    TeamInvitationPreviewResponse preview(String token);

    /** Chấp nhận lời mời từ mã trong link. */
    TeamResponse accept(String token);

    /** Lời mời theo email gửi cho tài khoản đang đăng nhập (trang Team của tôi). */
    List<TeamInvitationResponse> myInvitations();

    TeamResponse acceptMine(String invitationId);

    void declineMine(String invitationId);

    List<TeamScoreResponse> scores(String teamId);

    /** Bản cá nhân của tôi chưa thuộc team nào, để chọn chuyển vào team. */
    List<TeamScoreResponse> myPersonalScores(String teamId);

    /** Chủ bản nhạc (và là thành viên team, không phải VIEWER) chuyển bản cá nhân vào team. */
    TeamScoreResponse addScore(String teamId, String scoreId);

    /** Chủ bản nhạc hoặc người có quyền REMOVE_SCORES đưa bản về bản cá nhân; bản rời mọi show của team. */
    void removeScore(String teamId, String scoreId);

    PageResponse<TeamActivityResponse> activities(String teamId, int page, int size);

    /** Bài tôi được giao phối hoặc duyệt, chưa xong, trong các show đang chuẩn bị. */
    List<TeamTaskResponse> myTasks();
}
