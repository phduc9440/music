package com.ptit.music_be.dto.enums.team;

/**
 * Vai trò trong team (mục 4.1). Vai trò làm được gì do bảng quyền của từng team quyết định ({@link TeamPermission}, chủ nhóm
 * tích / bỏ tích); mặc định:
 *
 * <ul>
 *   <li>OWNER (chủ nhóm): toàn quyền, không chỉnh được. Riêng chủ nhóm xóa / khôi phục team, cấp vai trò chủ nhóm, chỉnh
 *       bảng quyền.
 *   <li>MANAGER (quản lý): điều phối buổi diễn, phân công, mời / đổi vai trò / xóa người phối và người xem, sửa mọi bản
 *       nhạc của team; không sửa thông tin nhóm, không quản lý quản lý khác, không duyệt thay người duyệt, không xóa /
 *       công khai / chia sẻ bản của người khác.
 *   <li>ARRANGER (người phối): sửa được bài được giao phối, nhận xét bài khác, chuyển bản của mình vào team.
 *   <li>VIEWER: chỉ xem.
 * </ul>
 */
public enum TeamRole {
    OWNER,
    MANAGER,
    ARRANGER,
    VIEWER
}
