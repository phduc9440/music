package com.ptit.music_be.repository.auth;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberRole;
import com.ptit.music_be.entity.Role;

@Repository
public interface MemberRoleRepository extends JpaRepository<MemberRole, String> {

    List<MemberRole> findByMember(Member member);

    boolean existsByMemberAndRole(Member member, Role role);

    @Transactional
    @Modifying
    void deleteByMember(Member member);

    /** Mã các vai trò của tài khoản (bộ lọc JWT lấy quyền hiện tại từ đây, không tin vào vai trò ghi sẵn trong token). */
    @Query("select mr.role.name from MemberRole mr where mr.member.email = :email")
    List<String> findRoleNamesByEmail(@Param("email") String email);

    /** Email của những người đang có vai trò này (để xóa bộ nhớ quyền khi vai trò bị xóa). */
    @Query("select mr.member.email from MemberRole mr where mr.role.id = :roleId")
    List<String> findEmailsByRoleId(@Param("roleId") String roleId);

    @Query("select mr from MemberRole mr join fetch mr.member where mr.role.id = :roleId")
    List<MemberRole> findByRoleId(@Param("roleId") String roleId);

    /** Bỏ vai trò khỏi mọi tài khoản (trước khi xóa vai trò). */
    @Transactional
    @Modifying
    @Query("delete from MemberRole mr where mr.role.id = :roleId")
    int deleteByRoleId(@Param("roleId") String roleId);
}
