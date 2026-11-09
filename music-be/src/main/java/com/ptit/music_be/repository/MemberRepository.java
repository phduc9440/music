package com.ptit.music_be.repository;

import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.dto.enums.MemberStatus;
import com.ptit.music_be.entity.Member;

@Repository
public interface MemberRepository extends JpaRepository<Member, String> {

    Optional<Member> findByEmail(String email);

    /**
     * Khóa dòng thành viên (trong transaction) để các lần upload/chạy lại song song của cùng một người được xếp hàng,
     * tránh cùng vượt giới hạn số task đang chạy.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from Member m where m.email = :email")
    Optional<Member> findByEmailForUpdate(@Param("email") String email);

    boolean existsByEmail(String email);

    /** Chỉ lấy trạng thái tài khoản (nhẹ hơn tải cả Member), dùng để chặn token của tài khoản bị khóa. */
    @Query("select m.status from Member m where m.email = :email")
    Optional<MemberStatus> findStatusByEmail(@Param("email") String email);

    /** Mọi thành viên có vai trò ADMIN (để gửi thông báo duyệt). */
    @Query("select distinct mr.member from MemberRole mr where mr.role.name in ('ADMIN', 'SUPER_ADMIN')")
    java.util.List<Member> findAllAdmins();

    @Query(
            """
			SELECT m FROM Member m
			WHERE :keyword IS NULL
			OR LOWER(m.email) LIKE LOWER(CONCAT('%', :keyword, '%'))
			OR LOWER(m.fullName) LIKE LOWER(CONCAT('%', :keyword, '%'))
			""")
    Page<Member> search(@Param("keyword") String keyword, Pageable pageable);
}
