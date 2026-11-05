package com.ptit.music_be.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;

@Repository
public interface ScoreRepository extends JpaRepository<Score, String> {

    List<Score> findByMember(Member member);

    List<Score> findByVisibility(String visibility);

    /** Các bản nhạc được người khác chia sẻ cho một thành viên (cập nhật gần nhất trước). */
    @Query("select ms.score from MemberScore ms where ms.member.id = :memberId and ms.permission is not null order by ms.score.updatedAt desc")
    Page<Score> findSharedWithMember(@Param("memberId") String memberId, Pageable pageable);

    Optional<Score> findByShareTokenAndLinkPermissionIsNotNull(String shareToken);

    /**
     * Danh sách bản nhạc của một thành viên, có tìm theo tên/tác giả và lọc trạng thái/nguồn/độ khó/thể loại.
     * Tham số rỗng ("") nghĩa là không lọc; service luôn truyền chuỗi, không truyền null.
     */
    @Query(
            """
			select s from Score s
			where s.member.id = :memberId
			and (lower(s.title) like lower(concat('%', :keyword, '%'))
				or lower(coalesce(s.composer, '')) like lower(concat('%', :keyword, '%')))
			and (:status = '' or s.processingStatus = :status)
			and (:source = '' or s.sourceType = :source)
			and (:difficulty = '' or cast(s.difficulty as string) = :difficulty)
			and (:tagId = '' or exists (select 1 from ScoreTag st where st.score = s and st.tag.id = :tagId))
			""")
    Page<Score> searchOfMember(
            @Param("memberId") String memberId,
            @Param("keyword") String keyword,
            @Param("status") String status,
            @Param("source") String source,
            @Param("difficulty") String difficulty,
            @Param("tagId") String tagId,
            Pageable pageable);
}
