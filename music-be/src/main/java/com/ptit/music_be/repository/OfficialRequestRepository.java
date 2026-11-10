package com.ptit.music_be.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.OfficialRequestStatus;
import com.ptit.music_be.entity.OfficialRequest;

@Repository
public interface OfficialRequestRepository extends JpaRepository<OfficialRequest, String> {

    boolean existsByScoreIdAndStatusIn(String scoreId, Collection<OfficialRequestStatus> statuses);

    /** Lời xin đang chờ của một chủ sở hữu, mới nhất trước, kèm bản nhạc và người xin (tránh N+1). */
    @Query(
            """
			select r from OfficialRequest r join fetch r.score join fetch r.requestedBy
			where r.owner.id = :ownerId and r.status = com.ptit.music_be.dto.enums.OfficialRequestStatus.PENDING
			order by r.createdAt desc, r.id
			""")
    List<OfficialRequest> findPendingOfOwner(@Param("ownerId") String ownerId);

    /** Bản sao rời kho mẫu thì lời xin đã nhận được rút lại để bản gốc có thể được xin lại sau này. */
    @Modifying
    @Query(
            """
			update OfficialRequest r set r.status = com.ptit.music_be.dto.enums.OfficialRequestStatus.CANCELED,
				r.resolvedAt = CURRENT_TIMESTAMP
			where r.copyScoreId = :copyScoreId
			and r.status = com.ptit.music_be.dto.enums.OfficialRequestStatus.ACCEPTED
			""")
    int cancelAcceptedByCopy(@Param("copyScoreId") String copyScoreId);

    /** ADMIN: mọi lời xin, lọc theo trạng thái ("" là không lọc), mới nhất trước. */
    @Query(
            value =
                    """
			select r from OfficialRequest r join fetch r.score join fetch r.owner join fetch r.requestedBy
			where (:status = '' or cast(r.status as string) = :status)
			order by r.createdAt desc, r.id
			""",
            countQuery =
                    "select count(r) from OfficialRequest r where (:status = '' or cast(r.status as string) = :status)")
    Page<OfficialRequest> searchForAdmin(@Param("status") String status, Pageable pageable);
}
