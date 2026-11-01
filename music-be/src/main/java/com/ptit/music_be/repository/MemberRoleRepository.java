package com.ptit.music_be.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Member;
import com.ptit.music_be.entity.MemberRole;
import com.ptit.music_be.entity.Role;

@Repository
public interface MemberRoleRepository extends JpaRepository<MemberRole, String> {

    List<MemberRole> findByMember(Member member);

    boolean existsByMemberAndRole(Member member, Role role);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying
    void deleteByMember(Member member);
}
