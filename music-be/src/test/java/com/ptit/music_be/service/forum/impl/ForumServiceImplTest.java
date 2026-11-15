package com.ptit.music_be.service.forum.impl;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import com.ptit.music_be.dto.enums.notification.NotificationType;
import com.ptit.music_be.dto.request.forum.ForumPostRequest;
import com.ptit.music_be.dto.request.forum.ForumThreadRequest;
import com.ptit.music_be.entity.ForumSubscription;
import com.ptit.music_be.entity.ForumCategory;
import com.ptit.music_be.entity.ForumPost;
import com.ptit.music_be.entity.ForumThread;
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
import com.ptit.music_be.service.notification.NotificationService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ForumServiceImplTest {

    @Mock
    ForumCategoryRepository categoryRepository;

    @Mock
    ForumThreadRepository threadRepository;

    @Mock
    ForumPostRepository postRepository;

    @Mock
    ForumVoteRepository voteRepository;

    @Mock
    ForumSubscriptionRepository subscriptionRepository;

    @Mock
    ScoreRepository scoreRepository;

    @Mock
    MemberRepository memberRepository;

    @Mock
    NotificationService notificationService;

    @Mock
    ApplicationEventPublisher eventPublisher;

    @Mock
    jakarta.persistence.EntityManager entityManager;

    @InjectMocks
    ForumServiceImpl service;

    Member me;
    ForumCategory category;

    @BeforeEach
    void setUp() {
        me = Member.builder().id("me").email("me@x.com").fullName("Tôi").build();
        category = ForumCategory.builder().id("cat").name("Hỏi đáp").slug("hoi-dap").build();
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("me@x.com", "x", "ROLE_USER"));
        when(memberRepository.findByEmail("me@x.com")).thenReturn(Optional.of(me));
        when(categoryRepository.findById("cat")).thenReturn(Optional.of(category));
        when(threadRepository.save(any(ForumThread.class))).thenAnswer(i -> {
            ForumThread t = i.getArgument(0);
            t.setId("t1");
            t.setCreatedAt(LocalDateTime.now());
            return t;
        });
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private ForumThreadRequest request(String title, String body, String scoreId) {
        return ForumThreadRequest.builder()
                .categoryId("cat")
                .title(title)
                .body(body)
                .scoreId(scoreId)
                .build();
    }

    private void assertError(Runnable r, ErrorCode code) {
        assertThatThrownBy(r::run)
                .isInstanceOf(AppException.class)
                .extracting(e -> ((AppException) e).getErrorCode())
                .isEqualTo(code);
    }

    @Test
    void createThreadRejectsShortTitleAndEmptyBody() {
        assertError(() -> service.createThread(request("ab", "nội dung", null)), ErrorCode.FORUM_CONTENT_INVALID);
        assertError(() -> service.createThread(request("Tiêu đề", "   ", null)), ErrorCode.FORUM_CONTENT_INVALID);
        assertError(
                () -> service.createThread(request("Tiêu đề", "x".repeat(10_001), null)),
                ErrorCode.FORUM_CONTENT_INVALID);
        verify(threadRepository, never()).save(any());
    }

    @Test
    void createThreadRejectsScoreThatIsNotPublic() {
        Score priv = Score.builder().id("s1").visibility("PRIVATE").build();
        when(scoreRepository.findById("s1")).thenReturn(Optional.of(priv));
        assertError(() -> service.createThread(request("Tiêu đề", "nội dung", "s1")), ErrorCode.FORUM_SCORE_NOT_PUBLIC);
        assertError(() -> service.createThread(request("Tiêu đề", "nội dung", "none")), ErrorCode.FORUM_SCORE_NOT_PUBLIC);
    }

    @Test
    void newAccountIsLimitedToThreeThreadsPerDay() {
        me.setCreatedAt(LocalDateTime.now().minusDays(1));
        when(threadRepository.countByAuthorIdAndCreatedAtAfter(eq("me"), any())).thenReturn(3L);
        assertError(() -> service.createThread(request("Tiêu đề", "nội dung", null)), ErrorCode.FORUM_NEW_ACCOUNT_LIMIT);
    }

    @Test
    void oldAccountIsNotLimited() {
        me.setCreatedAt(LocalDateTime.now().minusDays(10));
        when(threadRepository.countByAuthorIdAndCreatedAtAfter(eq("me"), any())).thenReturn(50L);
        service.createThread(request("Tiêu đề", "nội dung", null));
        verify(threadRepository).save(any(ForumThread.class));
    }

    @Test
    void accountWithoutCreatedDateIsNotLimited() {
        me.setCreatedAt(null);
        when(threadRepository.countByAuthorIdAndCreatedAtAfter(eq("me"), any())).thenReturn(50L);
        service.createThread(request("Tiêu đề", "nội dung", null));
        verify(threadRepository).save(any(ForumThread.class));
    }

    private ForumThread threadBy(Member author) {
        return ForumThread.builder()
                .id("t1")
                .category(category)
                .author(author)
                .title("Câu hỏi")
                .body("nội dung")
                .createdAt(LocalDateTime.now())
                .build();
    }

    @Test
    void onlyAuthorCanDeleteThreadAndOnlyWithoutOtherReplies() {
        Member other = Member.builder().id("other").build();
        when(threadRepository.findDetail("t1")).thenReturn(Optional.of(threadBy(other)));
        assertError(() -> service.deleteThread("t1"), ErrorCode.FORUM_NOT_AUTHOR);

        when(threadRepository.findDetail("t1")).thenReturn(Optional.of(threadBy(me)));
        when(postRepository.countByOthers("t1", "me")).thenReturn(2L);
        assertError(() -> service.deleteThread("t1"), ErrorCode.FORUM_THREAD_HAS_REPLIES);

        when(postRepository.countByOthers("t1", "me")).thenReturn(0L);
        service.deleteThread("t1");
        verify(threadRepository).deleteDirectly("t1");
    }

    @Test
    void cannotVoteOnOwnThread() {
        when(threadRepository.findDetail("t1")).thenReturn(Optional.of(threadBy(me)));
        assertError(() -> service.toggleThreadVote("t1"), ErrorCode.FORUM_VOTE_OWN_CONTENT);
    }

    @Test
    void acceptingAnswerNotifiesAndRewardsItsAuthor() {
        Member helper = Member.builder().id("helper").email("h@x.com").build();
        ForumThread thread = threadBy(me);
        ForumPost post = ForumPost.builder().id("p1").thread(thread).author(helper).body("đáp án").build();
        when(threadRepository.findDetail("t1")).thenReturn(Optional.of(thread));
        when(postRepository.findById("p1")).thenReturn(Optional.of(post));

        service.toggleAccepted("p1");

        assertThat(thread.getAcceptedPost()).isSameAs(post);
        verify(notificationService)
                .notify(eq(helper), eq(me), eq(NotificationType.FORUM_ANSWER_ACCEPTED), any(), any(), any());
        verify(eventPublisher).publishEvent(new RewardEarnedEvent("helper", RewardReason.FORUM_ANSWER_ACCEPTED, "p1"));

        // chọn lại cùng bài thì bỏ chọn, không cộng thêm
        service.toggleAccepted("p1");
        assertThat(thread.getAcceptedPost()).isNull();
        verify(eventPublisher, org.mockito.Mockito.times(1)).publishEvent(any(RewardEarnedEvent.class));
    }

    @Test
    void replyNotifiesEachPersonOnceWithTheRightTypeAndExcerpt() {
        Member owner = Member.builder().id("owner").email("o@x.com").fullName("Chủ").build();
        Member asker = Member.builder().id("asker").email("a@x.com").fullName("Hỏi").build();
        Member follower = Member.builder().id("fol").email("f@x.com").fullName("Theo dõi").build();
        ForumThread thread = threadBy(owner);
        // asker viết bài, me trả lời trực tiếp vào bài đó
        ForumPost target = ForumPost.builder().id("p9").thread(thread).author(asker).body("câu hỏi gốc").build();
        when(threadRepository.findDetail("t1")).thenReturn(Optional.of(thread));
        when(postRepository.findById("p9")).thenReturn(Optional.of(target));
        when(postRepository.save(any(ForumPost.class))).thenAnswer(i -> {
            ForumPost p = i.getArgument(0);
            p.setId("p10");
            return p;
        });
        when(subscriptionRepository.existsByThreadIdAndMemberId(eq("t1"), any())).thenReturn(true);
        // asker vừa là người bị trả lời vừa đang theo dõi: vẫn chỉ nhận một thông báo
        when(subscriptionRepository.findOfThread("t1"))
                .thenReturn(List.of(
                        ForumSubscription.builder().thread(thread).member(asker).build(),
                        ForumSubscription.builder().thread(thread).member(follower).build()));

        String longBody = "Cảm ơn bạn rất nhiều về câu hỏi này, " + "mình bổ sung thêm ý kiến ".repeat(10);
        service.reply("t1", ForumPostRequest.builder().body(longBody).replyToPostId("p9").build());

        // người bị trả lời trực tiếp: FORUM_POST_REPLY, kèm đoạn đầu nội dung (cắt gọn) và id bài để mở đúng chỗ
        org.mockito.ArgumentCaptor<java.util.Map<String, String>> params = org.mockito.ArgumentCaptor.forClass(java.util.Map.class);
        verify(notificationService)
                .notify(eq(asker), eq(me), eq(NotificationType.FORUM_POST_REPLY), any(), any(), params.capture());
        assertThat(params.getValue()).containsEntry("threadId", "t1").containsEntry("postId", "p10");
        assertThat(params.getValue().get("excerpt")).hasSizeLessThanOrEqualTo(ForumServiceImpl.NOTIFY_EXCERPT + 1);
        // người đặt chủ đề và người theo dõi: FORUM_REPLY, mỗi người một lần
        verify(notificationService)
                .notify(eq(owner), eq(me), eq(NotificationType.FORUM_REPLY), any(), any(), any());
        verify(notificationService)
                .notify(eq(follower), eq(me), eq(NotificationType.FORUM_REPLY), any(), any(), any());
        verify(notificationService, org.mockito.Mockito.times(3)).notify(any(), any(), any(), any(), any(), any());
    }

    @Test
    void cannotReplyToPostOfAnotherThread() {
        ForumThread thread = threadBy(me);
        ForumThread other = ForumThread.builder().id("t2").category(category).author(me).build();
        ForumPost foreign = ForumPost.builder().id("px").thread(other).author(me).body("x").build();
        when(threadRepository.findDetail("t1")).thenReturn(Optional.of(thread));
        when(postRepository.findById("px")).thenReturn(Optional.of(foreign));
        assertError(
                () -> service.reply(
                        "t1", ForumPostRequest.builder().body("trả lời").replyToPostId("px").build()),
                ErrorCode.FORUM_POST_NOT_EXISTED);
    }

    @Test
    void onlyThreadAuthorAcceptsAndNotOwnReply() {
        Member other = Member.builder().id("other").build();
        ForumThread theirs = threadBy(other);
        ForumPost post = ForumPost.builder().id("p1").thread(theirs).author(me).build();
        when(threadRepository.findDetail("t1")).thenReturn(Optional.of(theirs));
        when(postRepository.findById("p1")).thenReturn(Optional.of(post));
        assertError(() -> service.toggleAccepted("p1"), ErrorCode.FORUM_NOT_AUTHOR);

        ForumThread mine = threadBy(me);
        ForumPost own = ForumPost.builder().id("p2").thread(mine).author(me).build();
        when(threadRepository.findDetail("t1")).thenReturn(Optional.of(mine));
        when(postRepository.findById("p2")).thenReturn(Optional.of(own));
        assertError(() -> service.toggleAccepted("p2"), ErrorCode.FORUM_ACCEPT_OWN_POST);
    }

    @Test
    void titleIsNormalizedToOneLine() {
        assertThat(ForumServiceImpl.cleanTitle("  Xin   chào \n bạn  ")).isEqualTo("Xin chào bạn");
        assertThat(ForumServiceImpl.cleanBody("a\r\nb\u0000c")).isEqualTo("a\nbc");
        assertThat(List.of(ForumServiceImpl.cleanBody("<script>x</script>"))).containsExactly("<script>x</script>");
    }
}
