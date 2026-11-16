package com.ptit.music_be.service.forum.impl;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.enums.score.Visibility;
import com.ptit.music_be.dto.request.forum.ForumPostRequest;
import com.ptit.music_be.dto.request.forum.ForumThreadRequest;
import com.ptit.music_be.dto.response.common.PageResponse;
import com.ptit.music_be.dto.response.forum.ForumAuthorResponse;
import com.ptit.music_be.dto.response.forum.ForumCategoryResponse;
import com.ptit.music_be.dto.response.forum.ForumPostResponse;
import com.ptit.music_be.dto.response.forum.ForumThreadDetailResponse;
import com.ptit.music_be.dto.response.forum.ForumThreadResponse;
import com.ptit.music_be.dto.response.forum.ForumVoteResponse;
import com.ptit.music_be.entity.ForumCategory;
import com.ptit.music_be.entity.ForumPost;
import com.ptit.music_be.entity.ForumSubscription;
import com.ptit.music_be.entity.ForumThread;
import com.ptit.music_be.entity.ForumVote;
import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;
import com.ptit.music_be.event.RewardEarnedEvent;
import com.ptit.music_be.event.RewardReason;
import com.ptit.music_be.exception.AppException;
import com.ptit.music_be.exception.ErrorCode;
import com.ptit.music_be.repository.auth.MemberRepository;
import com.ptit.music_be.repository.forum.ForumCategoryRepository;
import com.ptit.music_be.repository.forum.ForumPostRepository;
import com.ptit.music_be.repository.forum.ForumSubscriptionRepository;
import com.ptit.music_be.repository.forum.ForumThreadRepository;
import com.ptit.music_be.repository.forum.ForumVoteRepository;
import com.ptit.music_be.repository.score.ScoreRepository;
import com.ptit.music_be.service.forum.ForumService;
import com.ptit.music_be.service.notification.NotificationService;
import com.ptit.music_be.utils.SecurityUtils;

import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

@Service
@RequiredArgsConstructor
@FieldDefaults(level = AccessLevel.PRIVATE, makeFinal = true)
public class ForumServiceImpl implements ForumService {

    static final int MIN_TITLE = 3;
    static final int MAX_TITLE = 150;
    static final int MAX_BODY = 10_000;
    static final int EXCERPT = 220;
    static final int NOTIFY_EXCERPT = 80;
    static final int REPLY_REF_EXCERPT = 100;
    static final int MAX_PAGE_SIZE = 50;
    /** Tài khoản đăng ký chưa đủ chừng này ngày bị giới hạn số chủ đề mỗi ngày. */
    static final int NEW_ACCOUNT_DAYS = 3;

    static final int NEW_ACCOUNT_THREADS_PER_DAY = 3;

    ForumCategoryRepository categoryRepository;
    ForumThreadRepository threadRepository;
    ForumPostRepository postRepository;
    ForumVoteRepository voteRepository;
    ForumSubscriptionRepository subscriptionRepository;
    ScoreRepository scoreRepository;
    MemberRepository memberRepository;
    NotificationService notificationService;
    ApplicationEventPublisher eventPublisher;
    EntityManager entityManager;

    // ------------------------------------------------------------------ chuyên mục và danh sách

    @Override
    @Transactional(readOnly = true)
    public List<ForumCategoryResponse> categories() {
        Map<String, Long> counts = new HashMap<>();
        for (Object[] row : categoryRepository.countThreadsByCategory()) {
            counts.put((String) row[0], (Long) row[1]);
        }
        return categoryRepository.findAllByOrderBySortOrderAscNameAsc().stream()
                .map(c -> ForumCategoryResponse.builder()
                        .id(c.getId())
                        .slug(c.getSlug())
                        .name(c.getName())
                        .description(c.getDescription())
                        .threadCount(counts.getOrDefault(c.getId(), 0L))
                        .build())
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<ForumThreadResponse> threads(
            String categoryId, String keyword, Sort sort, boolean unanswered, boolean mine, int page, int size) {
        Member me = currentMember();
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);

        StringBuilder where = new StringBuilder(" where 1 = 1");
        Map<String, Object> params = new HashMap<>();
        if (categoryId != null && !categoryId.isBlank()) {
            where.append(" and t.category.id = :categoryId");
            params.put("categoryId", categoryId);
        }
        String kw = keyword == null ? "" : keyword.trim().toLowerCase();
        if (!kw.isEmpty()) {
            where.append(" and lower(t.title) like :kw escape '!'");
            params.put("kw", "%" + kw.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
        }
        if (unanswered) {
            where.append(" and t.acceptedPost is null");
        }
        if (mine) {
            where.append(" and t.author.id = :me");
            params.put("me", me.getId());
        }

        TypedQuery<Long> count = entityManager.createQuery("select count(t) from ForumThread t" + where, Long.class);
        params.forEach(count::setParameter);
        long total = count.getSingleResult();

        // Chủ đề được ghim luôn đứng đầu, rồi mới tới thứ tự đã chọn
        String pinnedFirst = " order by case when t.pinnedAt is null then 1 else 0 end, ";
        String order = sort == Sort.TOP
                ? pinnedFirst
                        + "(select count(v) from ForumVote v where v.thread = t) desc, t.createdAt desc, t.id desc"
                : pinnedFirst
                        + "coalesce((select max(p.createdAt) from ForumPost p where p.thread = t), t.createdAt) desc,"
                        + " t.id desc";
        TypedQuery<ForumThread> query = entityManager.createQuery(
                "select t from ForumThread t join fetch t.author join fetch t.category" + where + order,
                ForumThread.class);
        params.forEach(query::setParameter);
        query.setFirstResult(safePage * safeSize).setMaxResults(safeSize);
        List<ForumThread> found = query.getResultList();

        List<ForumThreadResponse> content = toThreadResponses(found, me, false);
        return PageResponse.<ForumThreadResponse>builder()
                .content(content)
                .pageNumber(safePage)
                .pageSize(safeSize)
                .totalElements(total)
                .totalPages((int) Math.ceil(total / (double) safeSize))
                .build();
    }

    // ------------------------------------------------------------------ chi tiết chủ đề

    @Override
    @Transactional(readOnly = true)
    public ForumThreadDetailResponse thread(String threadId) {
        Member me = currentMember();
        ForumThread thread = findThread(threadId);
        ForumThreadResponse head = toThreadResponses(List.of(thread), me, true).get(0);
        List<ForumPost> posts = postRepository.findOfThread(threadId);
        return ForumThreadDetailResponse.builder()
                .thread(head)
                .posts(toPostResponses(posts, me, head.getAcceptedPostId(), posts))
                .build();
    }

    // ------------------------------------------------------------------ chủ đề

    @Override
    @Transactional
    public ForumThreadResponse createThread(ForumThreadRequest request) {
        Member me = currentMember();
        String title = cleanTitle(request == null ? null : request.getTitle());
        String body = cleanBody(request == null ? null : request.getBody());
        ForumCategory category = categoryRepository
                .findById(request.getCategoryId() == null ? "" : request.getCategoryId())
                .orElseThrow(() -> new AppException(ErrorCode.FORUM_CATEGORY_NOT_EXISTED));
        Score score = resolvePublicScore(request.getScoreId());
        guardNewAccount(me);

        ForumThread thread = threadRepository.save(ForumThread.builder()
                .category(category)
                .author(me)
                .score(score)
                .title(title)
                .body(body)
                .build());
        subscribe(thread, me);
        return toThreadResponses(List.of(thread), me, true).get(0);
    }

    @Override
    @Transactional
    public ForumThreadResponse updateThread(String threadId, ForumThreadRequest request) {
        Member me = currentMember();
        ForumThread thread = findThread(threadId);
        requireAuthor(thread.getAuthor(), me);
        thread.setTitle(cleanTitle(request == null ? null : request.getTitle()));
        thread.setBody(cleanBody(request.getBody()));
        // Giữ nguyên bản đang gắn dù sau đó đã về riêng tư; chỉ kiểm tra khi đổi sang bản khác
        String currentScoreId = thread.getScore() == null ? null : thread.getScore().getId();
        String wanted = request.getScoreId() == null || request.getScoreId().isBlank() ? null : request.getScoreId();
        if (wanted == null) {
            thread.setScore(null);
        } else if (!wanted.equals(currentScoreId)) {
            thread.setScore(resolvePublicScore(wanted));
        }
        thread.setEditedAt(LocalDateTime.now());
        threadRepository.save(thread);
        return toThreadResponses(List.of(thread), me, true).get(0);
    }

    @Override
    @Transactional
    public void deleteThread(String threadId) {
        Member me = currentMember();
        ForumThread thread = findThread(threadId);
        requireAuthor(thread.getAuthor(), me);
        if (postRepository.countByOthers(threadId, me.getId()) > 0) {
            throw new AppException(ErrorCode.FORUM_THREAD_HAS_REPLIES);
        }
        // Bài trả lời, phiếu và lượt theo dõi xóa theo bằng ON DELETE CASCADE ở DB
        threadRepository.deleteDirectly(threadId);
    }

    // ------------------------------------------------------------------ trả lời

    @Override
    @Transactional
    public ForumPostResponse reply(String threadId, ForumPostRequest request) {
        Member me = currentMember();
        ForumThread thread = findThread(threadId);
        if (thread.getLockedAt() != null) {
            throw new AppException(ErrorCode.FORUM_THREAD_LOCKED);
        }
        String body = cleanBody(request == null ? null : request.getBody());
        ForumPost replyTo = null;
        if (request.getReplyToPostId() != null && !request.getReplyToPostId().isBlank()) {
            // Chỉ trả lời được bài còn hiển thị trong đúng chủ đề này
            replyTo = postRepository
                    .findById(request.getReplyToPostId())
                    .filter(p -> p.getThread().getId().equals(thread.getId()))
                    .orElseThrow(() -> new AppException(ErrorCode.FORUM_POST_NOT_EXISTED));
        }
        ForumPost post = postRepository.save(ForumPost.builder()
                .thread(thread)
                .author(me)
                .replyTo(replyTo)
                .body(body)
                .build());
        subscribe(thread, me);
        notifyReply(thread, post, replyTo, me);
        return toPostResponses(List.of(post), me, null, replyTo == null ? List.of() : List.of(replyTo))
                .get(0);
    }

    @Override
    @Transactional
    public ForumPostResponse updatePost(String postId, ForumPostRequest request) {
        Member me = currentMember();
        ForumPost post = findPost(postId);
        requireAuthor(post.getAuthor(), me);
        post.setBody(cleanBody(request == null ? null : request.getBody()));
        post.setEditedAt(LocalDateTime.now());
        postRepository.save(post);
        ForumThread thread = post.getThread();
        String accepted = thread.getAcceptedPost() == null ? null : thread.getAcceptedPost().getId();
        return toPostResponses(List.of(post), me, accepted, postRepository.findOfThread(thread.getId()))
                .get(0);
    }

    @Override
    @Transactional
    public void deletePost(String postId) {
        Member me = currentMember();
        ForumPost post = findPost(postId);
        requireAuthor(post.getAuthor(), me);
        // Nếu là câu trả lời hay nhất thì accepted_post_id của chủ đề về NULL nhờ ON DELETE SET NULL
        postRepository.deleteDirectly(postId);
    }

    // ------------------------------------------------------------------ bình chọn, câu trả lời hay nhất, theo dõi

    @Override
    @Transactional
    public ForumVoteResponse toggleThreadVote(String threadId) {
        Member me = currentMember();
        ForumThread thread = findThread(threadId);
        if (thread.getAuthor().getId().equals(me.getId())) {
            throw new AppException(ErrorCode.FORUM_VOTE_OWN_CONTENT);
        }
        var existing = voteRepository.findByMemberIdAndThreadId(me.getId(), threadId);
        boolean voted;
        if (existing.isPresent()) {
            voteRepository.delete(existing.get());
            voted = false;
        } else {
            voteRepository.save(ForumVote.builder().member(me).thread(thread).build());
            voted = true;
        }
        voteRepository.flush();
        return ForumVoteResponse.builder()
                .voted(voted)
                .voteCount(voteRepository.countByThreadId(threadId))
                .build();
    }

    @Override
    @Transactional
    public ForumVoteResponse togglePostVote(String postId) {
        Member me = currentMember();
        ForumPost post = findPost(postId);
        if (post.getAuthor().getId().equals(me.getId())) {
            throw new AppException(ErrorCode.FORUM_VOTE_OWN_CONTENT);
        }
        var existing = voteRepository.findByMemberIdAndPostId(me.getId(), postId);
        boolean voted;
        if (existing.isPresent()) {
            voteRepository.delete(existing.get());
            voted = false;
        } else {
            voteRepository.save(ForumVote.builder().member(me).post(post).build());
            voted = true;
        }
        voteRepository.flush();
        return ForumVoteResponse.builder()
                .voted(voted)
                .voteCount(voteRepository.countByPostId(postId))
                .build();
    }

    @Override
    @Transactional
    public ForumThreadResponse toggleAccepted(String postId) {
        Member me = currentMember();
        ForumPost post = findPost(postId);
        ForumThread thread = findThread(post.getThread().getId());
        requireAuthor(thread.getAuthor(), me);
        if (post.getAuthor().getId().equals(me.getId())) {
            throw new AppException(ErrorCode.FORUM_ACCEPT_OWN_POST);
        }
        ForumPost current = thread.getAcceptedPost();
        if (current != null && current.getId().equals(postId)) {
            thread.setAcceptedPost(null);
        } else {
            thread.setAcceptedPost(post);
            notificationService.notify(
                    post.getAuthor(),
                    me,
                    NotificationType.FORUM_ANSWER_ACCEPTED,
                    null,
                    displayName(me) + " đã chọn câu trả lời của bạn là hay nhất trong “" + thread.getTitle() + "”",
                    NotificationService.params(
                            "name", displayName(me), "title", thread.getTitle(), "threadId", thread.getId(), "postId",
                            post.getId()));
            // Cùng (reason, postId) chỉ được cộng một lần nên chọn đi chọn lại không cộng thêm
            eventPublisher.publishEvent(
                    new RewardEarnedEvent(post.getAuthor().getId(), RewardReason.FORUM_ANSWER_ACCEPTED, post.getId()));
        }
        threadRepository.save(thread);
        return toThreadResponses(List.of(thread), me, true).get(0);
    }

    @Override
    @Transactional
    public void setSubscribed(String threadId, boolean subscribed) {
        Member me = currentMember();
        ForumThread thread = findThread(threadId);
        if (subscribed) {
            subscribe(thread, me);
        } else {
            subscriptionRepository.findByThreadIdAndMemberId(threadId, me.getId()).ifPresent(subscriptionRepository::delete);
        }
    }

    // ------------------------------------------------------------------ helpers: nghiệp vụ

    private void subscribe(ForumThread thread, Member member) {
        if (!subscriptionRepository.existsByThreadIdAndMemberId(thread.getId(), member.getId())) {
            subscriptionRepository.save(
                    ForumSubscription.builder().thread(thread).member(member).build());
        }
    }

    /**
     * Mỗi người nhận đúng một thông báo (đẩy realtime tới chuông): người bị trả lời trực tiếp nhận FORUM_POST_REPLY, người
     * đặt chủ đề và người đang theo dõi nhận FORUM_REPLY. Kèm đoạn đầu nội dung để đọc thông báo là biết ai nói gì; bấm
     * vào mở đúng bài ({@code threadId} + {@code postId}).
     */
    private void notifyReply(ForumThread thread, ForumPost post, ForumPost replyTo, Member actor) {
        String name = displayName(actor);
        String excerpt = excerpt(post.getBody(), NOTIFY_EXCERPT);
        Set<String> notified = new HashSet<>();
        notified.add(actor.getId());

        if (replyTo != null && replyTo.getAuthor() != null && notified.add(replyTo.getAuthor().getId())) {
            notificationService.notify(
                    replyTo.getAuthor(),
                    actor,
                    NotificationType.FORUM_POST_REPLY,
                    null,
                    name + " đã trả lời bình luận của bạn trong “" + thread.getTitle() + "”: “" + excerpt + "”",
                    replyParams(name, thread, post, excerpt));
        }

        Map<String, Member> others = new LinkedHashMap<>();
        // Người đặt chủ đề đã bỏ theo dõi thì không báo nữa
        if (subscriptionRepository.existsByThreadIdAndMemberId(thread.getId(), thread.getAuthor().getId())) {
            others.put(thread.getAuthor().getId(), thread.getAuthor());
        }
        for (ForumSubscription s : subscriptionRepository.findOfThread(thread.getId())) {
            others.putIfAbsent(s.getMember().getId(), s.getMember());
        }
        for (Member r : others.values()) {
            if (!notified.add(r.getId())) {
                continue;
            }
            notificationService.notify(
                    r,
                    actor,
                    NotificationType.FORUM_REPLY,
                    null,
                    name + " đã trả lời trong “" + thread.getTitle() + "”: “" + excerpt + "”",
                    replyParams(name, thread, post, excerpt));
        }
    }

    private static Map<String, String> replyParams(String name, ForumThread thread, ForumPost post, String excerpt) {
        return NotificationService.params(
                "name", name, "title", thread.getTitle(), "threadId", thread.getId(), "postId", post.getId(),
                "excerpt", excerpt);
    }

    private void guardNewAccount(Member me) {
        LocalDateTime created = me.getCreatedAt();
        // Tài khoản cũ chưa có ngày đăng ký (created_at NULL) coi như đã đủ tuổi
        if (created == null || created.isBefore(LocalDateTime.now().minusDays(NEW_ACCOUNT_DAYS))) {
            return;
        }
        if (threadRepository.countByAuthorIdAndCreatedAtAfter(me.getId(), LocalDateTime.now().minusHours(24))
                >= NEW_ACCOUNT_THREADS_PER_DAY) {
            throw new AppException(ErrorCode.FORUM_NEW_ACCOUNT_LIMIT);
        }
    }

    private Score resolvePublicScore(String scoreId) {
        if (scoreId == null || scoreId.isBlank()) {
            return null;
        }
        return scoreRepository
                .findById(scoreId)
                .filter(s -> Visibility.PUBLIC.name().equals(s.getVisibility()))
                .orElseThrow(() -> new AppException(ErrorCode.FORUM_SCORE_NOT_PUBLIC));
    }

    private ForumThread findThread(String id) {
        return threadRepository.findDetail(id).orElseThrow(() -> new AppException(ErrorCode.FORUM_THREAD_NOT_EXISTED));
    }

    private ForumPost findPost(String id) {
        ForumPost post = postRepository.findById(id).orElseThrow(() -> new AppException(ErrorCode.FORUM_POST_NOT_EXISTED));
        // Chủ đề đã ẩn thì bài trong đó cũng coi như không còn
        findThread(post.getThread().getId());
        return post;
    }

    private static void requireAuthor(Member author, Member me) {
        if (author == null || !author.getId().equals(me.getId())) {
            throw new AppException(ErrorCode.FORUM_NOT_AUTHOR);
        }
    }

    // ------------------------------------------------------------------ helpers: kiểm tra nội dung

    /** Bỏ ký tự điều khiển (trừ xuống dòng, tab) và chuẩn hóa xuống dòng; không đụng tới Markdown. */
    private static String stripControl(String s) {
        return s.replace("\r\n", "\n").replace('\r', '\n').replaceAll("[\\p{Cntrl}&&[^\n\t]]", "");
    }

    static String cleanTitle(String title) {
        String t = title == null ? "" : stripControl(title).replaceAll("\\s+", " ").trim();
        if (t.length() < MIN_TITLE || t.length() > MAX_TITLE) {
            throw new AppException(ErrorCode.FORUM_CONTENT_INVALID);
        }
        return t;
    }

    static String cleanBody(String body) {
        String b = body == null ? "" : stripControl(body).trim();
        if (b.isEmpty() || b.length() > MAX_BODY) {
            throw new AppException(ErrorCode.FORUM_CONTENT_INVALID);
        }
        return b;
    }

    // ------------------------------------------------------------------ helpers: dựng phản hồi

    private List<ForumThreadResponse> toThreadResponses(List<ForumThread> threads, Member me, boolean detail) {
        if (threads.isEmpty()) {
            return List.of();
        }
        List<String> ids = threads.stream().map(ForumThread::getId).toList();
        Map<String, Long> replies = toCountMap(postRepository.countByThreadIds(ids));
        Map<String, Long> votes = toCountMap(voteRepository.countByThreadIds(ids));
        Map<String, LocalDateTime> lastPost = new HashMap<>();
        for (Object[] row : postRepository.lastPostAtByThreadIds(ids)) {
            lastPost.put((String) row[0], (LocalDateTime) row[1]);
        }
        Set<String> voted = new HashSet<>(voteRepository.threadIdsVotedBy(me.getId(), ids));
        Set<String> subscribed = new HashSet<>(subscriptionRepository.threadIdsSubscribedBy(me.getId(), ids));

        Set<String> scoreIds = threads.stream()
                .map(ForumThread::getScore)
                .filter(s -> s != null)
                .map(Score::getId)
                .collect(Collectors.toSet());
        Map<String, Score> scores = new HashMap<>();
        if (!scoreIds.isEmpty()) {
            for (Score s : scoreRepository.findAllById(scoreIds)) {
                scores.put(s.getId(), s);
            }
        }

        List<ForumThreadResponse> out = new ArrayList<>();
        for (ForumThread t : threads) {
            String acceptedId = t.getAcceptedPost() == null ? null : t.getAcceptedPost().getId();
            Score score = t.getScore() == null ? null : scores.get(t.getScore().getId());
            LocalDateTime last = lastPost.get(t.getId());
            out.add(ForumThreadResponse.builder()
                    .id(t.getId())
                    .categoryId(t.getCategory().getId())
                    .categoryName(t.getCategory().getName())
                    .categorySlug(t.getCategory().getSlug())
                    .title(t.getTitle())
                    .body(detail ? t.getBody() : null)
                    .excerpt(excerpt(t.getBody()))
                    .author(author(t.getAuthor()))
                    // Bản đã về riêng tư hoặc vào thùng rác thì không hiện liên kết
                    .score(
                            score != null && Visibility.PUBLIC.name().equals(score.getVisibility())
                                    ? ForumThreadResponse.ScoreRef.builder()
                                            .id(score.getId())
                                            .title(score.getTitle())
                                            .build()
                                    : null)
                    .replyCount(replies.getOrDefault(t.getId(), 0L))
                    .voteCount(votes.getOrDefault(t.getId(), 0L))
                    .votedByMe(voted.contains(t.getId()))
                    .mine(t.getAuthor().getId().equals(me.getId()))
                    .answered(acceptedId != null)
                    .pinned(t.getPinnedAt() != null)
                    .locked(t.getLockedAt() != null)
                    .subscribed(subscribed.contains(t.getId()))
                    .acceptedPostId(acceptedId)
                    .createdAt(t.getCreatedAt())
                    .editedAt(t.getEditedAt())
                    .lastActivityAt(last != null && last.isAfter(t.getCreatedAt()) ? last : t.getCreatedAt())
                    .build());
        }
        return out;
    }

    /** Bài hay nhất đứng đầu, còn lại theo thời gian (đầu vào đã sắp theo thời gian). */
    private List<ForumPostResponse> toPostResponses(
            List<ForumPost> posts, Member me, String acceptedId, Collection<ForumPost> visibleInThread) {
        if (posts.isEmpty()) {
            return List.of();
        }
        // Bài được trả lời chỉ hiện khi còn trong danh sách hiển thị (đã xóa hoặc bị ẩn thì bỏ liên kết)
        Map<String, ForumPost> visible = new HashMap<>();
        for (ForumPost v : visibleInThread) {
            visible.put(v.getId(), v);
        }
        List<String> ids = posts.stream().map(ForumPost::getId).toList();
        Map<String, Long> votes = toCountMap(voteRepository.countByPostIds(ids));
        Set<String> voted = new HashSet<>(voteRepository.postIdsVotedBy(me.getId(), ids));
        List<ForumPostResponse> out = new ArrayList<>();
        for (ForumPost p : posts) {
            out.add(ForumPostResponse.builder()
                    .id(p.getId())
                    .threadId(p.getThread().getId())
                    .body(p.getBody())
                    .author(author(p.getAuthor()))
                    .voteCount(votes.getOrDefault(p.getId(), 0L))
                    .votedByMe(voted.contains(p.getId()))
                    .mine(p.getAuthor().getId().equals(me.getId()))
                    .accepted(p.getId().equals(acceptedId))
                    .replyTo(replyRef(p, visible))
                    .createdAt(p.getCreatedAt())
                    .editedAt(p.getEditedAt())
                    .build());
        }
        out.sort(Comparator.comparing((ForumPostResponse r) -> !r.isAccepted()));
        return out;
    }

    private static ForumPostResponse.ReplyRef replyRef(ForumPost p, Map<String, ForumPost> visible) {
        if (p.getReplyTo() == null) {
            return null;
        }
        ForumPost target = visible.get(p.getReplyTo().getId());
        return target == null
                ? null
                : ForumPostResponse.ReplyRef.builder()
                        .postId(target.getId())
                        .authorName(
                                target.getAuthor().getFullName() == null
                                                || target.getAuthor().getFullName().isBlank()
                                        ? null
                                        : target.getAuthor().getFullName())
                        .excerpt(excerpt(target.getBody(), REPLY_REF_EXCERPT))
                        .build();
    }

    private static Map<String, Long> toCountMap(Collection<Object[]> rows) {
        Map<String, Long> map = new HashMap<>();
        for (Object[] row : rows) {
            map.put((String) row[0], (Long) row[1]);
        }
        return map;
    }

    private static String excerpt(String body) {
        return excerpt(body, EXCERPT);
    }

    private static String excerpt(String body, int max) {
        String flat = body.replaceAll("\\s+", " ").trim();
        return flat.length() <= max ? flat : flat.substring(0, max).trim() + "…";
    }

    /** Chỉ lộ tên hiển thị và ảnh; chưa đặt tên thì hiện "Thành viên" chứ không lộ email. */
    private static ForumAuthorResponse author(Member m) {
        return ForumAuthorResponse.builder()
                .id(m.getId())
                .fullName(m.getFullName() == null || m.getFullName().isBlank() ? null : m.getFullName())
                .avatarUrl(m.getAvatarUrl())
                .build();
    }

    private static String displayName(Member m) {
        return m.getFullName() == null || m.getFullName().isBlank() ? "Một thành viên" : m.getFullName();
    }

    private Member currentMember() {
        return memberRepository
                .findByEmail(SecurityUtils.getCurrentEmail())
                .orElseThrow(() -> new AppException(ErrorCode.USER_NOT_EXISTED));
    }
}
