package com.ptit.music_be.repository.team;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.ptit.music_be.entity.Show;

/** Show xóa mềm ({@code deletedAt}): các truy vấn ở đây bỏ qua show đã xóa, trừ những hàm có chữ Deleted. */
public interface ShowRepository extends JpaRepository<Show, String> {

    /** Show chưa xóa. Dùng hàm này thay cho findById ở mọi chỗ phía người dùng. */
    @Query("select s from Show s where s.id = :id and s.deletedAt is null")
    Optional<Show> findActiveById(@Param("id") String id);

    /** Show đang chuẩn bị trước (ngày diễn gần nhất trước, chưa đặt ngày xếp cuối), rồi tới show đã diễn. */
    @Query("select s from Show s where s.team.id = :teamId and s.deletedAt is null"
            + " order by case when s.status = 'DONE' then 1 else 0 end,"
            + " case when s.showDate is null then 1 else 0 end, s.showDate, s.createdAt")
    List<Show> findByTeamOrdered(@Param("teamId") String teamId);

    @Query("select s.team.id, count(s) from Show s where s.team.id in :teamIds and s.status = 'PREPARING'"
            + " and s.deletedAt is null group by s.team.id")
    List<Object[]> countPreparingByTeams(@Param("teamIds") Collection<String> teamIds);

    /** Show đã xóa của team, xóa sau {@code since} (còn khôi phục được), mới xóa trước. */
    @Query("select s from Show s left join fetch s.deletedBy where s.team.id = :teamId and s.deletedAt is not null"
            + " and s.deletedAt > :since order by s.deletedAt desc")
    List<Show> findDeletedByTeam(@Param("teamId") String teamId, @Param("since") LocalDateTime since);
}
