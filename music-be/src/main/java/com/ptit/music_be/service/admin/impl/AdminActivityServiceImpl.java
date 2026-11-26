package com.ptit.music_be.service.admin.impl;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.dto.response.admin.AdminActivityResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.service.admin.AdminActivityService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class AdminActivityServiceImpl implements AdminActivityService {

    static final int MAX_PAGE_SIZE = 100;

    static final List<String> TYPES = List.of(
            "REPORT_CREATED",
            "REPORT_RESOLVED",
            "SCORE_DELETED_BY_ADMIN",
            "COMMENT_HIDDEN",
            "FORUM_THREAD_HIDDEN",
            "FORUM_POST_HIDDEN",
            "FORUM_THREAD_LOCKED",
            "TEAM_DELETED_BY_ADMIN",
            "PLAN_SANCTION",
            "MEMBER_LOCKED",
            "MEMBER_UNLOCKED",
            "ROLE_GRANTED",
            "SHARE_GRANTED");

    /**
     * Mỗi nhánh trả về cùng các cột: id, type, occurred_at, actor_id, target_type, target_id, target_label, detail.
     * Bản nhạc ở thùng rác và góp ý đã ẩn bị {@code @SQLRestriction} giấu khỏi JPQL nên đọc bằng SQL thuần. Khóa /
     * mở khóa và chia sẻ chỉ giữ lần đổi gần nhất (cột trên dòng gốc); vai trò hay chia sẻ bị thu hồi thì dòng mất nên
     * không hiện. Chia sẻ chỉ chủ bản nhạc hoặc quản lý nhóm cấp được (admin không có quyền này).
     */
    static final String SOURCES = """
			SELECT CONCAT('REPORT_CREATED:', r.id) AS id, 'REPORT_CREATED' AS type, r.created_at AS occurred_at,
				r.reporter_id AS actor_id, r.target_type AS target_type,
				COALESCE(r.score_id, r.comment_id, r.forum_thread_id, r.forum_post_id) AS target_id,
				COALESCE((SELECT s.title FROM scores s WHERE s.id = r.score_id), (SELECT LEFT(c.content, 100) FROM score_comments c WHERE c.id = r.comment_id), (SELECT ft.title FROM forum_threads ft WHERE ft.id = r.forum_thread_id), (SELECT LEFT(fp.body, 100) FROM forum_posts fp WHERE fp.id = r.forum_post_id)) AS target_label, r.reason AS detail
			FROM content_reports r
			UNION ALL
			SELECT CONCAT('REPORT_RESOLVED:', r.id), 'REPORT_RESOLVED', r.resolved_at, r.resolved_by, r.target_type,
				COALESCE(r.score_id, r.comment_id, r.forum_thread_id, r.forum_post_id),
				COALESCE((SELECT s.title FROM scores s WHERE s.id = r.score_id), (SELECT LEFT(c.content, 100) FROM score_comments c WHERE c.id = r.comment_id), (SELECT ft.title FROM forum_threads ft WHERE ft.id = r.forum_thread_id), (SELECT LEFT(fp.body, 100) FROM forum_posts fp WHERE fp.id = r.forum_post_id)),
				CONCAT(r.action, COALESCE(CONCAT(': ', r.resolution_note), ''))
			FROM content_reports r
			WHERE r.resolved_at IS NOT NULL
			UNION ALL
			SELECT CONCAT('SCORE_DELETED_BY_ADMIN:', s.id), 'SCORE_DELETED_BY_ADMIN', s.deleted_at, s.deleted_by, 'SCORE',
				s.id, s.title, s.delete_reason
			FROM scores s
			WHERE s.deleted_at IS NOT NULL AND s.deleted_by IS NOT NULL AND s.deleted_by <> COALESCE(s.member_id, '')
			UNION ALL
			SELECT CONCAT('COMMENT_HIDDEN:', c.id), 'COMMENT_HIDDEN', c.hidden_at, c.hidden_by, 'COMMENT', c.id,
				LEFT(c.content, 100), NULL
			FROM score_comments c
			WHERE c.hidden_at IS NOT NULL
			UNION ALL
			SELECT CONCAT('FORUM_THREAD_HIDDEN:', ft.id), 'FORUM_THREAD_HIDDEN', ft.hidden_at, ft.hidden_by, 'FORUM_THREAD', ft.id,
				ft.title, NULL
			FROM forum_threads ft
			WHERE ft.hidden_at IS NOT NULL
			UNION ALL
			SELECT CONCAT('FORUM_POST_HIDDEN:', fp.id), 'FORUM_POST_HIDDEN', fp.hidden_at, fp.hidden_by, 'FORUM_POST', fp.id,
				LEFT(fp.body, 100), NULL
			FROM forum_posts fp
			WHERE fp.hidden_at IS NOT NULL
			UNION ALL
			SELECT CONCAT('FORUM_THREAD_LOCKED:', ft2.id), 'FORUM_THREAD_LOCKED', ft2.locked_at, ft2.locked_by, 'FORUM_THREAD', ft2.id,
				ft2.title, NULL
			FROM forum_threads ft2
			WHERE ft2.locked_at IS NOT NULL AND ft2.locked_by IS NOT NULL
			UNION ALL
			SELECT CONCAT('TEAM_DELETED_BY_ADMIN:', t.id), 'TEAM_DELETED_BY_ADMIN', t.deleted_at, t.deleted_by, 'TEAM', t.id,
				t.name, t.deleted_reason
			FROM teams t
			WHERE t.deleted_at IS NOT NULL AND t.deleted_by_admin = TRUE
			UNION ALL
			SELECT CONCAT('PLAN_SANCTION:', ps.id), 'PLAN_SANCTION', ps.created_at, ps.created_by, 'MEMBER', ps.member_id,
				(SELECT m2.email FROM members m2 WHERE m2.id = ps.member_id),
				CONCAT(ps.type, COALESCE(CONCAT(': ', ps.reason), ''))
			FROM plan_sanctions ps
			UNION ALL
			SELECT CONCAT(IF(m.status = 2, 'MEMBER_LOCKED:', 'MEMBER_UNLOCKED:'), m.id),
				IF(m.status = 2, 'MEMBER_LOCKED', 'MEMBER_UNLOCKED'), m.status_changed_at, m.status_changed_by,
				'MEMBER', m.id, m.email, m.status_reason
			FROM members m
			WHERE m.status_changed_at IS NOT NULL AND m.status_changed_by IS NOT NULL
			UNION ALL
			SELECT CONCAT('ROLE_GRANTED:', mr.id), 'ROLE_GRANTED', mr.granted_at, mr.granted_by, 'MEMBER', mr.member_id,
				(SELECT m3.email FROM members m3 WHERE m3.id = mr.member_id),
				(SELECT COALESCE(ro.label, ro.name) FROM roles ro WHERE ro.id = mr.role_id)
			FROM member_roles mr
			WHERE mr.granted_at IS NOT NULL AND mr.granted_by IS NOT NULL
			UNION ALL
			SELECT CONCAT('SHARE_GRANTED:', ms.id), 'SHARE_GRANTED', ms.granted_at, ms.granted_by, 'SCORE',
				ms.score_id, s2.title,
				CONCAT((SELECT m4.email FROM members m4 WHERE m4.id = ms.member_id), ': ',
						CASE ms.permission WHEN 1 THEN 'VIEW' WHEN 2 THEN 'COMMENT' WHEN 3 THEN 'EDIT' ELSE '?' END)
			FROM member_scores ms
			JOIN scores s2 ON s2.id = ms.score_id
			WHERE ms.granted_at IS NOT NULL AND ms.granted_by IS NOT NULL AND ms.permission IS NOT NULL
			""";

    EntityManager entityManager;

    @Override
    public List<String> types() {
        SecurityUtils.requirePermission(AdminPermission.AUDIT_VIEW);
        return TYPES;
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<AdminActivityResponse> search(
            int page, int size, String actor, String type, String targetType, LocalDateTime from, LocalDateTime to) {
        SecurityUtils.requirePermission(AdminPermission.AUDIT_VIEW);
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);

        StringBuilder where = new StringBuilder(" WHERE e.occurred_at IS NOT NULL");
        Map<String, Object> params = new HashMap<>();
        if (notBlank(actor)) {
            where.append(" AND LOWER(a.email) LIKE :actor");
            params.put("actor", "%" + actor.trim().toLowerCase() + "%");
        }
        if (notBlank(type)) {
            where.append(" AND e.type = :type");
            params.put("type", type.trim());
        }
        if (notBlank(targetType)) {
            where.append(" AND e.target_type = :targetType");
            params.put("targetType", targetType.trim());
        }
        if (from != null) {
            where.append(" AND e.occurred_at >= :from");
            params.put("from", Timestamp.valueOf(from));
        }
        if (to != null) {
            where.append(" AND e.occurred_at < :to");
            params.put("to", Timestamp.valueOf(to));
        }
        String joined = " FROM (" + SOURCES + ") e LEFT JOIN members a ON a.id = e.actor_id" + where;

        Query count = entityManager.createNativeQuery("SELECT COUNT(*)" + joined);
        params.forEach(count::setParameter);
        long total = ((Number) count.getSingleResult()).longValue();

        Query query = entityManager.createNativeQuery(
                "SELECT e.id, e.type, e.occurred_at, e.actor_id, a.email, e.target_type, e.target_id, e.target_label, e.detail"
                        + joined + " ORDER BY e.occurred_at DESC, e.id DESC");
        params.forEach(query::setParameter);
        query.setFirstResult(safePage * safeSize).setMaxResults(safeSize);

        List<AdminActivityResponse> content = new ArrayList<>();
        for (Object row : query.getResultList()) {
            Object[] c = (Object[]) row;
            content.add(AdminActivityResponse.builder()
                    .id((String) c[0])
                    .type((String) c[1])
                    .occurredAt(toLocalDateTime(c[2]))
                    .actorId((String) c[3])
                    .actorEmail((String) c[4])
                    .targetType((String) c[5])
                    .targetId((String) c[6])
                    .targetLabel((String) c[7])
                    .detail(blankToNull((String) c[8]))
                    .build());
        }
        return PageResponse.<AdminActivityResponse>builder()
                .content(content)
                .pageNumber(safePage)
                .pageSize(safeSize)
                .totalElements(total)
                .totalPages((int) Math.ceil(total / (double) safeSize))
                .build();
    }

    private static LocalDateTime toLocalDateTime(Object value) {
        if (value instanceof Timestamp ts) return ts.toLocalDateTime();
        if (value instanceof LocalDateTime ldt) return ldt;
        return null;
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
