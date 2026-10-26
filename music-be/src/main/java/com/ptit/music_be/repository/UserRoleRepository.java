package com.ptit.music_be.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.ptit.music_be.entity.Role;
import com.ptit.music_be.entity.User;
import com.ptit.music_be.entity.UserRole;

@Repository
public interface UserRoleRepository extends JpaRepository<UserRole, String> {

    List<UserRole> findByUser(User user);

    boolean existsByUserAndRole(User user, Role role);

    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Modifying
    void deleteByUser(User user);
}
