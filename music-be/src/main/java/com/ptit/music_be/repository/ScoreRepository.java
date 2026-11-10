package com.ptit.music_be.repository;

import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.Score;

@Repository
public interface ScoreRepository extends JpaRepository<Score, String> {

    List<Score> findByMember(Member member);

    List<Score> findByVisibility(String visibility);

    Page<Score> findByVisibility(String visibility, Pageable pageable);

    /** Các bản nhạc được người khác chia sẻ cho một thành viên (cập nhật gần nhất trước). */
    @Query(
            "select ms.score from MemberScore ms where ms.member.id = :memberId and ms.permission is not null order by ms.score.updatedAt desc")
    Page<Score> findSharedWithMember(@Param("memberId") String memberId, Pageable pageable);

    /**
     * Khóa dòng bản nhạc (SELECT ... FOR UPDATE) để hai lần lưu MusicXML cùng lúc không cùng ra một version; chỉ gọi
     * bên trong transaction.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Score s where s.id = :id")
    Optional<Score> findByIdForUpdate(@Param("id") String id);

    /**
     * Danh sách bản nhạc của một thành viên, có tìm theo tên/tác giả và lọc trạng thái/nguồn/độ khó/thể loại.
     * Tham số rỗng ("") nghĩa là không lọc; service luôn truyền chuỗi, không truyền null.
     */
    @Query(
            """
			select s from Score s
			where s.member.id = :memberId
			and (lower(s.title) like lower(concat('%', :keyword, '%')) escape '\\'
				or lower(coalesce(s.composer, '')) like lower(concat('%', :keyword, '%')) escape '\\')
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

    /**
     * Kho score mẫu (is_official = true): tìm theo tên/tác giả, lọc độ khó ("" là không lọc), sắp từ dễ đến khó rồi
     * theo tên để người mới học bắt đầu từ bài dễ.
     */
    @Query(
            """
			select s from Score s
			where s.isOfficial = true
			and (lower(s.title) like lower(concat('%', :keyword, '%')) escape '\\'
				or lower(coalesce(s.composer, '')) like lower(concat('%', :keyword, '%')) escape '\\')
			and (:difficulty = '' or cast(s.difficulty as string) = :difficulty)
			order by case cast(s.difficulty as string)
				when 'EASY' then 1 when 'MEDIUM' then 2 when 'HARD' then 3 when 'EXPERT' then 4 else 5 end,
				lower(s.title), s.id
			""")
    Page<Score> searchOfficial(
            @Param("keyword") String keyword, @Param("difficulty") String difficulty, Pageable pageable);

    /**
     * Phần chung của trang Khám phá: bản PUBLIC, tìm tên/tác giả, lọc độ khó và thể loại ("" là không lọc). Bản sao
     * trong kho mẫu (có bản gốc) không liệt kê ở đây vì đã nằm ở "Kho score mẫu"; nếu không, bản gốc của người dùng và
     * bản sao của nó sẽ hiện thành hai bản trùng nhau.
     */
    String PUBLIC_EXPLORE_FILTER =
            """
			from Score s
			where s.visibility = 'PUBLIC' and s.originalScoreId is null
			and (lower(s.title) like lower(concat('%', :keyword, '%')) escape '\\'
				or lower(coalesce(s.composer, '')) like lower(concat('%', :keyword, '%')) escape '\\')
			and (:difficulty = '' or cast(s.difficulty as string) = :difficulty)
			and (:tagId = '' or exists (select 1 from ScoreTag st where st.score = s and st.tag.id = :tagId))
			""";

    /** Trang Khám phá: thứ tự lấy từ Sort của {@code pageable} (mới nhất, xem nhiều). */
    @Query(value = "select s " + PUBLIC_EXPLORE_FILTER, countQuery = "select count(s) " + PUBLIC_EXPLORE_FILTER)
    Page<Score> searchPublic(
            @Param("keyword") String keyword,
            @Param("difficulty") String difficulty,
            @Param("tagId") String tagId,
            Pageable pageable);

    /** Trang Khám phá, đánh giá cao nhất trước (điểm sao trung bình, bản chưa ai chấm xếp cuối, rồi theo lượt xem). */
    @Query(
            value = "select s " + PUBLIC_EXPLORE_FILTER
                    + " order by coalesce((select avg(r.rating) from ScoreReview r where r.score = s), 0) desc,"
                    + " coalesce(s.viewCount, 0) desc, s.id",
            countQuery = "select count(s) " + PUBLIC_EXPLORE_FILTER)
    Page<Score> searchPublicTopRated(
            @Param("keyword") String keyword,
            @Param("difficulty") String difficulty,
            @Param("tagId") String tagId,
            Pageable pageable);

    /** ADMIN: các bản nhạc công khai chưa nằm trong kho score mẫu, để chọn đưa vào (cập nhật gần nhất trước). */
    @Query(
            """
			select s from Score s
			where s.visibility = 'PUBLIC' and (s.isOfficial is null or s.isOfficial = false)
			and s.originalScoreId is null
			and not exists (select 1 from OfficialRequest r where r.score = s
				and (r.status = com.ptit.music_be.dto.enums.OfficialRequestStatus.PENDING
					or (r.status = com.ptit.music_be.dto.enums.OfficialRequestStatus.ACCEPTED
						and exists (select 1 from Score c where c.id = r.copyScoreId))))
			and (lower(s.title) like lower(concat('%', :keyword, '%')) escape '\\'
				or lower(coalesce(s.composer, '')) like lower(concat('%', :keyword, '%')) escape '\\')
			order by s.updatedAt desc, s.id
			""")
    Page<Score> searchOfficialCandidates(@Param("keyword") String keyword, Pageable pageable);

    /** ADMIN: mọi bản nhạc trong hệ thống, tìm theo tên/tác giả/email chủ sở hữu, lọc visibility, kho mẫu ("true"/"false"), nguồn, độ khó ("" là không lọc). */
    @Query(
            """
			select s from Score s
			where (lower(s.title) like lower(concat('%', :keyword, '%')) escape '\\'
				or lower(coalesce(s.composer, '')) like lower(concat('%', :keyword, '%')) escape '\\'
				or lower(s.member.email) like lower(concat('%', :keyword, '%')) escape '\\')
			and (:visibility = '' or s.visibility = :visibility)
			and (:official = ''
				or (:official = 'true' and s.isOfficial = true)
				or (:official = 'false' and (s.isOfficial is null or s.isOfficial = false)))
			and (:source = '' or s.sourceType = :source)
			and (:difficulty = '' or cast(s.difficulty as string) = :difficulty)
			""")
    Page<Score> searchAllForAdmin(
            @Param("keyword") String keyword,
            @Param("visibility") String visibility,
            @Param("official") String official,
            @Param("source") String source,
            @Param("difficulty") String difficulty,
            Pageable pageable);
}
