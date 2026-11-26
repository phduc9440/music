package com.ptit.music_be.repository.forum;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.ptit.music_be.entity.ForumCategory;

public interface ForumCategoryRepository extends JpaRepository<ForumCategory, String> {

    List<ForumCategory> findAllByOrderBySortOrderAscNameAsc();

    /** Số chủ đề còn hiển thị của từng chuyên mục: [categoryId, count]. */
    @Query("select t.category.id, count(t) from ForumThread t group by t.category.id")
    List<Object[]> countThreadsByCategory();
}
