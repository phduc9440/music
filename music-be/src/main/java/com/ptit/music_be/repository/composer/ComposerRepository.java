package com.ptit.music_be.repository.composer;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.Composer;
import com.ptit.music_be.entity.Score;

public interface ComposerRepository extends JpaRepository<Composer, String> {

    Optional<Composer> findBySlug(String slug);

    boolean existsBySlug(String slug);

    boolean existsBySlugAndIdNot(String slug, String id);

    /**
     * Nhạc sĩ kèm số bản công khai (bỏ bản sao trong kho mẫu, như trang Khám phá): [Composer, số bản]. Lọc theo tên/tên
     * khác và thời kỳ ("" là không lọc); nhiều bản công khai trước, rồi theo tên.
     */
    @Query("""
			select c, (select count(s) from Score s where s.composerId = c.id
				and s.visibility = 'PUBLIC' and s.originalScoreId is null) as publicCount
			from Composer c
			where (:keyword = '' or lower(c.name) like lower(concat('%', :keyword, '%')) escape '\\'
				or exists (select 1 from c.aliasList a where lower(a) like lower(concat('%', :keyword, '%')) escape '\\'))
			and (:period = '' or c.period = :period)
			order by publicCount desc, c.name
			""")
    List<Object[]> searchWithPublicCount(
            @Param("keyword") String keyword, @Param("period") String period, Pageable pageable);

    /** Admin: mọi nhạc sĩ kèm tổng số bản nhạc đang gắn (cả riêng tư), theo tên. */
    @Query("""
			select c, (select count(s) from Score s where s.composerId = c.id)
			from Composer c order by c.name
			""")
    List<Object[]> findAllWithScoreCount();

    /** Các bản công khai của một nhạc sĩ, xem nhiều nhất trước. */
    @Query("""
			select s.title from Score s where s.composerId = :composerId
			and s.visibility = 'PUBLIC' and s.originalScoreId is null
			order by coalesce(s.viewCount, 0) desc, s.id
			""")
    List<String> publicTitlesOf(@Param("composerId") String composerId, Pageable pageable);

    /**
     * Bản nhạc còn chữ tác giả gõ tay (chưa gắn nhạc sĩ), cần thử gắn lại khi danh sách nhạc sĩ đổi. Bản đã gắn không có
     * chữ gõ tay (3NF) nên giữ nguyên liên kết.
     */
    @Query("""
			select s from Score s
			where s.composerId is null and s.composer is not null and trim(s.composer) <> ''
			""")
    List<Score> findUnlinkedWithComposerText();

    @Query("select count(s) from Score s where s.composerId = :composerId")
    long countByLinkedScores(@Param("composerId") String composerId);

    /** Cập nhật hàng loạt, không qua entity, để không đổi "cập nhật lần cuối" của bản nhạc. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Score s set s.composerId = :composerId, s.composer = null where s.id in :ids")
    int setComposerId(@Param("composerId") String composerId, @Param("ids") List<String> ids);

    /**
     * Trước khi xóa nhạc sĩ: các bản đang gắn (cả bản trong thùng rác) nhận lại tên nhạc sĩ làm chữ gõ tay, để khóa ngoại
     * SET NULL không làm mất tên tác giả.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
            value = "update scores set composer = :name, composer_id = null where composer_id = :composerId",
            nativeQuery = true)
    int restoreComposerName(@Param("composerId") String composerId, @Param("name") String name);
}
