-- Giao diện sáng / tối / theo hệ thống mà thành viên chọn, để đồng bộ giữa các máy. NULL = theo hệ thống.
ALTER TABLE members
    ADD COLUMN ui_theme VARCHAR(10) NULL;
