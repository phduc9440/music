"""Mẫu kern dùng trong test (piano 2 spine, nhịp 3/4)."""

T = "\t"


def kern(*rows: str) -> str:
    """Ghép các dòng; trong mỗi dòng dấu ``|`` được đổi thành tab cho dễ đọc."""
    return "\n".join(r.replace("|", T) for r in rows) + "\n"


PAGE_1 = kern(
    "**kern|**kern",
    "*clefF4|*clefG2",
    "*k[f#]|*k[f#]",
    "*G:|*G:",
    "*M3/4|*M3/4",
    "*MM96|*MM96",
    "=1|=1",
    "4G|4g",
    "4A|4a",
    "4B|4b",
    "=2|=2",
    "2G|2g",
    "4r|4r",
    "=3|=3",
    "*-|*-",
)

# Trang 2 không in lại khóa/dấu hóa/nhịp; mở đầu bằng vạch nhịp trùng với cuối trang 1
PAGE_2_BARE = kern(
    "**kern|**kern",
    "=1|=1",
    "4D|4d",
    "4E|4e",
    "4F#|4f#",
    "=2|=2",
    "2G|2g",
    "4r|4r",
    "==|==",
    "*-|*-",
)

# Trang 2 in lại khóa/dấu hóa/nhịp giống hệt trang 1
PAGE_2_REPEATED = kern(
    "**kern|**kern",
    "*clefF4|*clefG2",
    "*k[f#]|*k[f#]",
    "*M3/4|*M3/4",
    "=1|=1",
    "4D|4d",
    "4E|4e",
    "4F#|4f#",
    "=2|=2",
    "2G|2g",
    "4r|4r",
    "==|==",
    "*-|*-",
)
