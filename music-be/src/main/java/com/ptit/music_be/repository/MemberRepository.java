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

    /** Tên các vai trò của thành viên (USER, ADMIN, SUPER_ADMIN). */
    @Query("select mr.role.name from MemberRole mr where mr.member.id = :id")
    java.util.List<String> roleNamesOf(@Param("id") String id);

    /** Ghi lần đăng nhập gần nhất mà không động đến các cột khác của tài khoản. */
    @org.springframework.transaction.annotation.Transactional
    // flushAutomatically: tài khoản Google mới tạo trong cùng transaction phải được ghi xuống DB trước câu update này,
    // nếu không update chạy trên 0 dòng và lần đăng nhập đầu tiên không được ghi nhận
    @org.springframework.data.jpa.repository.Modifying(flushAutomatically = true)
    @Query("update Member m set m.lastLoginAt = :at where m.id = :id")
    void updateLastLogin(@Param("id") String id, @Param("at") java.time.LocalDateTime at);

    /** Trạng thái xác thực tối thiểu để kiểm tra token ở mỗi request (nhẹ hơn tải cả Member). */
    interface AuthState {
        MemberStatus getStatus();

        java.time.LocalDateTime getPasswordChangedAt();
    }

    /** Trạng thái tài khoản và mốc đổi mật khẩu, dùng để chặn token của tài khoản bị khóa hoặc cấp trước khi đổi mật khẩu. */
    @Query("select m.status as status, m.passwordChangedAt as passwordChangedAt from Member m where m.email = :email")
    Optional<AuthState> findAuthStateByEmail(@Param("email") String email);

    /** Mọi thành viên đang hoạt động (status = ACTIVE), để gửi thông báo chung. */
    @Query("select m from Member m where m.status = :status")
    java.util.List<Member> findAllByStatus(@Param("status") MemberStatus status);

    /** Thành viên đang hoạt động không có vai trò ADMIN/SUPER_ADMIN. */
    @Query(
            """
			select m from Member m where m.status = :status
			and not exists (select 1 from MemberRole mr where mr.member = m and mr.role.name in ('ADMIN', 'SUPER_ADMIN'))
			""")
    java.util.List<Member> findNonAdminsByStatus(@Param("status") MemberStatus status);

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
