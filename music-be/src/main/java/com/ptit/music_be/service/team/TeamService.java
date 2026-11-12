package com.ptit.music_be.service.team;

import java.util.List;

import com.ptit.music_be.dto.request.TeamInviteRequest;
import com.ptit.music_be.dto.request.TeamRequest;
import com.ptit.music_be.dto.response.PageResponse;
import com.ptit.music_be.dto.response.TeamActivityResponse;
import com.ptit.music_be.dto.response.TeamInvitationPreviewResponse;
import com.ptit.music_be.dto.response.TeamInvitationResponse;
import com.ptit.music_be.dto.response.TeamMemberResponse;
import com.ptit.music_be.dto.response.TeamResponse;
import com.ptit.music_be.dto.response.TeamScoreResponse;
import com.ptit.music_be.dto.response.TeamTaskResponse;
import com.ptit.music_be.dto.enums.TeamRole;

/** Team (mục 4.1): team, thành viên, lời mời, bản nhạc của team, nhật ký hoạt động, việc của tôi trong Show. */
public interface TeamService {

    List<TeamResponse> myTeams();

    /** Tạo team (cần gói có quyền lợi team); người tạo là OWNER. */
    TeamResponse create(TeamRequest request);

    TeamResponse get(String teamId);

    /** OWNER/MANAGER sửa tên, mô tả. */
    TeamResponse update(String teamId, TeamRequest request);

    /** Chỉ OWNER: xóa team, bản nhạc của team trở về bản cá nhân của chủ từng bản. */
    void delete(String teamId);

    List<TeamMemberResponse> members(String teamId);

    /** OWNER/MANAGER đổi vai trò; MANAGER không đụng tới OWNER; team luôn còn ít nhất một OWNER. */
    TeamMemberResponse changeRole(String teamId, String memberId, TeamRole role);

    /** Xóa thành viên (OWNER/MANAGER) hoặc tự rời team (memberId là chính mình). */
    void removeMember(String teamId, String memberId);

    /** OWNER/MANAGER: các lời mời còn chờ. */
    List<TeamInvitationResponse> invitations(String teamId);

    /** OWNER/MANAGER mời theo email (gửi email + thông báo nếu đã có tài khoản) hoặc tạo link mời. */
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

    /** Chủ bản nhạc hoặc OWNER/MANAGER đưa bản về bản cá nhân; bản rời mọi show của team. */
    void removeScore(String teamId, String scoreId);

    PageResponse<TeamActivityResponse> activities(String teamId, int page, int size);

    /** Bài tôi được giao phối hoặc duyệt, chưa xong, trong các show đang chuẩn bị. */
    List<TeamTaskResponse> myTasks();
}
