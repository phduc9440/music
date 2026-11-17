package com.ptit.music_be.service.admin.impl;

import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.auth.AdminPermission;
import com.ptit.music_be.dto.request.admin.ForumCategoryRequest;
import com.ptit.music_be.dto.response.admin.AdminForumCategoryResponse;
import com.ptit.music_be.dto.response.admin.AdminForumPostResponse;
import com.ptit.music_be.dto.response.admin.AdminForumThreadDetailResponse;
import com.ptit.music_be.dto.response.admin.AdminForumThreadResponse;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.entity.ForumCategory;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.forum.ForumCategoryRepository;
import com.ptit.music_be.service.admin.AdminForumService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/**
 * Chủ đề và bài đã ẩn bị {@code @SQLRestriction} giấu khỏi JPA, nên mọi thao tác trên chúng ở đây dùng SQL thuần. Các số
 * (trả lời, báo cáo chờ, chủ đề trong chuyên mục) tính khi trả về, không lưu cột nào.
 */
@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class AdminForumServiceImpl implements AdminForumService {

    static final int MAX_PAGE_SIZE = 100;
    static final int MIN_NAME = 2;
    static final int MAX_NAME = 100;
    static final int MAX_DESCRIPTION = 300;

    ForumCategoryRepository categoryRepository;
    MemberRepository memberRepository;
    EntityManager entityManager;

    // ------------------------------------------------------------------ chuyên mục

    @Override
    @Transactional(readOnly = true)
    public List<AdminForumCategoryResponse> categories() {
        requirePermission();
        Map<String, long[]> counts = new HashMap<>();
        for (Object row : entityManager
                .createNativeQuery("SELECT category_id, COUNT(*), SUM(CASE WHEN hidden_at IS NULL THEN 0 ELSE 1 END)"
                        + " FROM forum_threads GROUP BY category_id")
                .getResultList()) {
            Object[] c = (Object[]) row;
            counts.put((String) c[0], new long[] {((Number) c[1]).longValue(), ((Number) c[2]).longValue()});
        }
        return categoryRepository.findAllByOrderBySortOrderAscNameAsc().stream()
                .map(c -> toCategory(c, counts.getOrDefault(c.getId(), new long[] {0, 0})))
                .toList();
    }

    @Override
    @Transactional
    public AdminForumCategoryResponse createCategory(ForumCategoryRequest request) {
        requirePermission();
        String name = cleanName(request == null ? null : request.getName());
        String description = cleanDescription(request.getDescription());
        int next = categoryRepository.findAll().stream()
                        .mapToInt(ForumCategory::getSortOrder)
                        .max()
                        .orElse(0)
                + 1;
        ForumCategory saved = categoryRepository.save(ForumCategory.builder()
                .name(name)
                .description(description)
                .slug(uniqueSlug(name))
                .sortOrder(next)
                .build());
        return toCategory(saved, new long[] {0, 0});
    }

    @Override
    @Transactional
    public AdminForumCategoryResponse updateCategory(String id, ForumCategoryRequest request) {
        requirePermission();
        ForumCategory category = categoryRepository
                .findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.FORUM_CATEGORY_NOT_EXISTED));
        category.setName(cleanName(request == null ? null : request.getName()));
        category.setDescription(cleanDescription(request.getDescription()));
        // Giữ nguyên slug để đường dẫn cũ không đổi khi chỉ sửa tên
        ForumCategory saved = categoryRepository.save(category);
        long[] counts = countsOf(id);
        return toCategory(saved, counts);
    }

    @Override
    @Transactional
    public void deleteCategory(String id) {
        requirePermission();
        ForumCategory category = categoryRepository
                .findById(id)
                .orElseThrow(() -> new AppException(ErrorCode.FORUM_CATEGORY_NOT_EXISTED));
        if (countsOf(id)[0] > 0) {
            throw new AppException(ErrorCode.FORUM_CATEGORY_NOT_EMPTY);
        }
        categoryRepository.delete(category);
    }

    @Override
    @Transactional
    public void reorderCategories(List<String> orderedIds) {
        requirePermission();
        if (orderedIds == null) {
            return;
        }
        int order = 1;
        for (String id : orderedIds) {
            if (categoryRepository.existsById(id)) {
                entityManager
                        .createNativeQuery("UPDATE forum_categories SET sort_order = :o WHERE id = :id")
                        .setParameter("o", order++)
                        .setParameter("id", id)
                        .executeUpdate();
            }
        }
    }

    // ------------------------------------------------------------------ chủ đề

    private static final String THREAD_SELECT =
            """
			SELECT t.id, t.title, LEFT(t.body, 160), t.category_id, c.name, t.author_id, m.email, m.full_name,
				t.created_at, t.hidden_at, hb.id, hb.email, hb.full_name, t.pinned_at, t.locked_at,
				t.accepted_post_id, t.body,
				(SELECT COUNT(*) FROM forum_posts p WHERE p.thread_id = t.id AND p.hidden_at IS NULL),
				(SELECT COUNT(*) FROM forum_posts p WHERE p.thread_id = t.id AND p.hidden_at IS NOT NULL),
				(SELECT COUNT(*) FROM content_reports r WHERE r.status = 'PENDING' AND (
						(r.target_type = 'FORUM_THREAD' AND r.forum_thread_id = t.id)
					OR (r.target_type = 'FORUM_POST' AND r.forum_post_id IN
							(SELECT p2.id FROM forum_posts p2 WHERE p2.thread_id = t.id))))
			FROM forum_threads t
			JOIN forum_categories c ON c.id = t.category_id
			JOIN members m ON m.id = t.author_id
			LEFT JOIN members hb ON hb.id = t.hidden_by
			""";

    @Override
    @Transactional(readOnly = true)
    public PageResponse<AdminForumThreadResponse> threads(
            String keyword, String categoryId, Status status, int page, int size) {
        requirePermission();
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);

        StringBuilder where = new StringBuilder(" WHERE 1 = 1");
        Map<String, Object> params = new HashMap<>();
        String kw = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
        if (!kw.isEmpty()) {
            where.append(" AND (LOWER(t.title) LIKE :kw ESCAPE '!' OR LOWER(m.email) LIKE :kw ESCAPE '!')");
            params.put("kw", "%" + kw.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
        }
        if (categoryId != null && !categoryId.isBlank()) {
            where.append(" AND t.category_id = :cat");
            params.put("cat", categoryId);
        }
        Status st = status == null ? Status.ALL : status;
        String pendingSql = "(SELECT COUNT(*) FROM content_reports r WHERE r.status = 'PENDING' AND ("
                + "(r.target_type = 'FORUM_THREAD' AND r.forum_thread_id = t.id) OR (r.target_type = 'FORUM_POST'"
                + " AND r.forum_post_id IN (SELECT p2.id FROM forum_posts p2 WHERE p2.thread_id = t.id))))";
        switch (st) {
            case VISIBLE -> where.append(" AND t.hidden_at IS NULL");
            case HIDDEN -> where.append(" AND t.hidden_at IS NOT NULL");
            case PINNED -> where.append(" AND t.pinned_at IS NOT NULL");
            case LOCKED -> where.append(" AND t.locked_at IS NOT NULL");
            case REPORTED -> where.append(" AND ").append(pendingSql).append(" > 0");
            default -> {}
        }
        String from = " FROM forum_threads t JOIN forum_categories c ON c.id = t.category_id"
                + " JOIN members m ON m.id = t.author_id";
        Query count = entityManager.createNativeQuery("SELECT COUNT(*)" + from + where);
        params.forEach(count::setParameter);
        long total = ((Number) count.getSingleResult()).longValue();

        String order = st == Status.REPORTED
                ? " ORDER BY " + pendingSql + " DESC, t.created_at DESC, t.id DESC"
                : " ORDER BY t.created_at DESC, t.id DESC";
        Query query = entityManager.createNativeQuery(THREAD_SELECT + where + order);
        params.forEach(query::setParameter);
        query.setFirstResult(safePage * safeSize).setMaxResults(safeSize);
        List<AdminForumThreadResponse> content = new ArrayList<>();
        for (Object row : query.getResultList()) {
            content.add(toThread((Object[]) row, false));
        }
        return PageResponse.<AdminForumThreadResponse>builder()
                .content(content)
                .pageNumber(safePage)
                .pageSize(safeSize)
                .totalElements(total)
                .totalPages((int) Math.ceil(total / (double) safeSize))
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public AdminForumThreadDetailResponse thread(String threadId) {
        requirePermission();
        Query query = entityManager
                .createNativeQuery(THREAD_SELECT + " WHERE t.id = :id")
                .setParameter("id", threadId);
        List<?> rows = query.getResultList();
        if (rows.isEmpty()) {
            throw new AppException(ErrorCode.FORUM_THREAD_NOT_EXISTED);
        }
        AdminForumThreadResponse head = toThread((Object[]) rows.get(0), true);

        Query posts = entityManager
                .createNativeQuery(
                        """
						SELECT p.id, p.body, p.author_id, m.email, m.full_name, p.created_at, p.hidden_at,
							hb.id, hb.email, hb.full_name,
							(SELECT COUNT(*) FROM content_reports r WHERE r.status = 'PENDING'
								AND r.target_type = 'FORUM_POST' AND r.forum_post_id = p.id),
							CASE WHEN t.accepted_post_id = p.id THEN 1 ELSE 0 END
						FROM forum_posts p
						JOIN forum_threads t ON t.id = p.thread_id
						JOIN members m ON m.id = p.author_id
						LEFT JOIN members hb ON hb.id = p.hidden_by
						WHERE p.thread_id = :id
						ORDER BY p.created_at, p.id
						""")
                .setParameter("id", threadId);
        List<AdminForumPostResponse> list = new ArrayList<>();
        for (Object row : posts.getResultList()) {
            Object[] c = (Object[]) row;
            list.add(AdminForumPostResponse.builder()
                    .id((String) c[0])
                    .body((String) c[1])
                    .author(person((String) c[2], (String) c[3], (String) c[4]))
                    .createdAt(toLocalDateTime(c[5]))
                    .hidden(c[6] != null)
                    .hiddenBy(person((String) c[7], (String) c[8], (String) c[9]))
                    .pendingReports(((Number) c[10]).longValue())
                    .accepted(((Number) c[11]).intValue() == 1)
                    .build());
        }
        return AdminForumThreadDetailResponse.builder().thread(head).posts(list).build();
    }

    @Override
    @Transactional
    public void setThreadHidden(String threadId, boolean hidden) {
        requirePermission();
        requireThread(threadId);
        LocalDateTime now = LocalDateTime.now();
        if (hidden) {
            update(
                    "UPDATE forum_threads SET hidden_at = :now, hidden_by = :by WHERE id = :id AND hidden_at IS NULL",
                    threadId,
                    now);
            // Ẩn rồi thì báo cáo đang chờ trên chủ đề này coi như đã xử lý
            closeReports("r.target_type = 'FORUM_THREAD' AND r.forum_thread_id = :id", threadId, now);
        } else {
            entityManager
                    .createNativeQuery("UPDATE forum_threads SET hidden_at = NULL, hidden_by = NULL WHERE id = :id")
                    .setParameter("id", threadId)
                    .executeUpdate();
        }
    }

    @Override
    @Transactional
    public void setThreadPinned(String threadId, boolean pinned) {
        requirePermission();
        requireThread(threadId);
        if (pinned) {
            update(
                    "UPDATE forum_threads SET pinned_at = COALESCE(pinned_at, :now), pinned_by = COALESCE(pinned_by, :by)"
                            + " WHERE id = :id",
                    threadId,
                    LocalDateTime.now());
        } else {
            entityManager
                    .createNativeQuery("UPDATE forum_threads SET pinned_at = NULL, pinned_by = NULL WHERE id = :id")
                    .setParameter("id", threadId)
                    .executeUpdate();
        }
    }

    @Override
    @Transactional
    public void setThreadLocked(String threadId, boolean locked) {
        requirePermission();
        requireThread(threadId);
        if (locked) {
            update(
                    "UPDATE forum_threads SET locked_at = COALESCE(locked_at, :now), locked_by = COALESCE(locked_by, :by)"
                            + " WHERE id = :id",
                    threadId,
                    LocalDateTime.now());
        } else {
            entityManager
                    .createNativeQuery("UPDATE forum_threads SET locked_at = NULL, locked_by = NULL WHERE id = :id")
                    .setParameter("id", threadId)
                    .executeUpdate();
        }
    }

    @Override
    @Transactional
    public void setPostHidden(String postId, boolean hidden) {
        requirePermission();
        if (((Number) entityManager
                                .createNativeQuery("SELECT COUNT(*) FROM forum_posts WHERE id = :id")
                                .setParameter("id", postId)
                                .getSingleResult())
                        .longValue()
                == 0) {
            throw new AppException(ErrorCode.FORUM_POST_NOT_EXISTED);
        }
        LocalDateTime now = LocalDateTime.now();
        if (hidden) {
            update(
                    "UPDATE forum_posts SET hidden_at = :now, hidden_by = :by WHERE id = :id AND hidden_at IS NULL",
                    postId,
                    now);
            // Bài bị ẩn không còn là đáp án hay nhất
            entityManager
                    .createNativeQuery("UPDATE forum_threads SET accepted_post_id = NULL WHERE accepted_post_id = :id")
                    .setParameter("id", postId)
                    .executeUpdate();
            closeReports("r.target_type = 'FORUM_POST' AND r.forum_post_id = :id", postId, now);
        } else {
            entityManager
                    .createNativeQuery("UPDATE forum_posts SET hidden_at = NULL, hidden_by = NULL WHERE id = :id")
                    .setParameter("id", postId)
                    .executeUpdate();
        }
    }

    // ------------------------------------------------------------------ helpers

    private void requirePermission() {
        SecurityUtils.requirePermission(AdminPermission.FORUM_MANAGE);
    }

    private void requireThread(String id) {
        long n = ((Number) entityManager
                        .createNativeQuery("SELECT COUNT(*) FROM forum_threads WHERE id = :id")
                        .setParameter("id", id)
                        .getSingleResult())
                .longValue();
        if (n == 0) {
            throw new AppException(ErrorCode.FORUM_THREAD_NOT_EXISTED);
        }
    }

    /** Câu UPDATE có tham số :id, :now, :by (người đang thao tác). */
    private void update(String sql, String id, LocalDateTime now) {
        Member me = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        entityManager
                .createNativeQuery(sql)
                .setParameter("id", id)
                .setParameter("now", Timestamp.valueOf(now))
                .setParameter("by", me.getId())
                .executeUpdate();
    }

    private void closeReports(String condition, String id, LocalDateTime now) {
        Member me = memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
        entityManager
                .createNativeQuery("UPDATE content_reports r SET r.status = 'RESOLVED', r.action = 'HIDE',"
                        + " r.resolved_by = :by, r.resolved_at = :now WHERE r.status = 'PENDING' AND " + condition)
                .setParameter("id", id)
                .setParameter("now", Timestamp.valueOf(now))
                .setParameter("by", me.getId())
                .executeUpdate();
    }

    private long[] countsOf(String categoryId) {
        Object[] c = (Object[]) entityManager
                .createNativeQuery("SELECT COUNT(*), COALESCE(SUM(CASE WHEN hidden_at IS NULL THEN 0 ELSE 1 END), 0)"
                        + " FROM forum_threads WHERE category_id = :id")
                .setParameter("id", categoryId)
                .getSingleResult();
        return new long[] {((Number) c[0]).longValue(), ((Number) c[1]).longValue()};
    }

    private static AdminForumCategoryResponse toCategory(ForumCategory c, long[] counts) {
        return AdminForumCategoryResponse.builder()
                .id(c.getId())
                .slug(c.getSlug())
                .name(c.getName())
                .description(c.getDescription())
                .sortOrder(c.getSortOrder())
                .threadCount(counts[0])
                .hiddenThreadCount(counts[1])
                .build();
    }

    private static AdminForumThreadResponse toThread(Object[] c, boolean detail) {
        return AdminForumThreadResponse.builder()
                .id((String) c[0])
                .title((String) c[1])
                .excerpt(flat((String) c[2]))
                .categoryId((String) c[3])
                .categoryName((String) c[4])
                .author(person((String) c[5], (String) c[6], (String) c[7]))
                .createdAt(toLocalDateTime(c[8]))
                .hidden(c[9] != null)
                .hiddenAt(toLocalDateTime(c[9]))
                .hiddenBy(person((String) c[10], (String) c[11], (String) c[12]))
                .pinned(c[13] != null)
                .locked(c[14] != null)
                .answered(c[15] != null)
                .body(detail ? (String) c[16] : null)
                .replyCount(((Number) c[17]).longValue())
                .hiddenReplyCount(((Number) c[18]).longValue())
                .pendingReports(((Number) c[19]).longValue())
                .build();
    }

    private static AdminForumThreadResponse.Person person(String id, String email, String fullName) {
        return id == null
                ? null
                : AdminForumThreadResponse.Person.builder()
                        .id(id)
                        .email(email)
                        .fullName(fullName == null || fullName.isBlank() ? null : fullName)
                        .build();
    }

    private static LocalDateTime toLocalDateTime(Object value) {
        if (value instanceof Timestamp ts) return ts.toLocalDateTime();
        if (value instanceof LocalDateTime ldt) return ldt;
        return null;
    }

    private static String flat(String s) {
        return s == null ? null : s.replaceAll("\\s+", " ").trim();
    }

    static String cleanName(String name) {
        String n = name == null ? "" : name.replaceAll("\\s+", " ").trim();
        if (n.length() < MIN_NAME || n.length() > MAX_NAME) {
            throw new AppException(ErrorCode.FORUM_CATEGORY_INVALID);
        }
        return n;
    }

    static String cleanDescription(String description) {
        String d =
                description == null ? "" : description.replaceAll("\\s+", " ").trim();
        if (d.length() > MAX_DESCRIPTION) {
            throw new AppException(ErrorCode.FORUM_CATEGORY_INVALID);
        }
        return d.isEmpty() ? null : d;
    }

    /** "Kỹ thuật chơi nhạc" → "ky-thuat-choi-nhac": bỏ dấu, chữ thường, ký tự lạ thành gạch ngang. */
    static String slugOf(String name) {
        String s = Normalizer.normalize(name.replace('đ', 'd').replace('Đ', 'D'), Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        return s.isEmpty() ? "chuyen-muc" : s;
    }

    private String uniqueSlug(String name) {
        String base = slugOf(name);
        String slug = base;
        int n = 2;
        List<String> taken = categoryRepository.findAll().stream()
                .map(ForumCategory::getSlug)
                .toList();
        while (taken.contains(slug)) {
            slug = base + "-" + n++;
        }
        return slug;
    }
}
