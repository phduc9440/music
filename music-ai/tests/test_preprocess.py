import cv2
import numpy as np
import pytest

from app.omr import preprocess as pp
from app.omr.model_input import to_model_array
from tests.synth import make_score_page

PHOTO = pp.PreprocessOptions(preprocess=True, binarize=True, source_type="PHOTO")


def test_output_has_transcoda_size_and_is_gray_uint8():
    result = pp.process_page(make_score_page(), PHOTO, 1)
    assert not result.skipped
    assert result.image.shape == (1485, 1050)  # cao 1485 x rộng 1050
    assert result.image.dtype == np.uint8
    assert result.meta["width"] == 1050 and result.meta["height"] == 1485
    assert result.meta["binarized"] is True and result.meta["sourcePage"] == 1


@pytest.mark.parametrize("tilt", [-4.0, -1.8, 0.0, 2.0, 9.0])
def test_deskew_recovers_tilt(tilt):
    result = pp.process_page(make_score_page(tilt=tilt, noise=5), PHOTO, 1)
    # Góc phát hiện là góc nghiêng của dòng kẻ: ngược dấu với góc xoay cv2 dùng để tạo ảnh
    assert result.meta["deskewAngle"] == pytest.approx(-tilt, abs=0.2)
    # Sau khi căn thẳng, ước lượng lại trên ảnh đầu ra phải còn rất ít lệch
    residual = pp.estimate_skew(result.image)
    assert residual is not None and abs(residual) < 0.25


def test_too_tilted_is_not_rotated_and_warns():
    result = pp.process_page(make_score_page(tilt=20), PHOTO, 3)
    assert result.meta["deskewAngle"] == 0.0
    assert not result.skipped  # vẫn coi là có khuông nhạc
    assert any("vượt quá 15" in w and w.startswith("Trang 3") for w in result.warnings)


def test_blank_page_is_skipped_with_warning():
    result = pp.process_page(np.full((2400, 1700), 255, np.uint8), PHOTO, 4)
    assert result.skipped and result.image is None
    assert result.warnings == ["Trang 4 không có khuông nhạc, đã bỏ qua"]


def test_text_only_page_has_no_staff():
    page = np.full((2400, 1700), 255, np.uint8)
    for row in range(12):
        cv2.putText(page, "Lorem ipsum dolor sit amet consectetur", (100, 150 + row * 120), cv2.FONT_HERSHEY_SIMPLEX, 1.6, 0, 3)
    assert pp.process_page(page, PHOTO, 1).skipped


def test_illumination_gradient_is_flattened():
    result = pp.process_page(make_score_page(shade=True, noise=6), PHOTO, 1)
    # Nền (pixel trắng) bên trái và bên phải phải đều trắng dù ảnh gốc tối dần về bên phải
    left, right = result.image[:, 5:60], result.image[:, 900:1000]
    assert np.median(left) == 255 and np.median(right) == 255


def test_binarize_can_be_disabled():
    options = pp.PreprocessOptions(preprocess=True, binarize=False, source_type="SCAN")
    result = pp.process_page(make_score_page(tilt=1, noise=4), options, 1)
    assert result.meta["binarized"] is False
    assert len(np.unique(result.image)) > 20  # còn nhiều mức xám


def test_preprocess_false_only_resizes_and_pads():
    page = make_score_page()
    result = pp.process_page(page, pp.PreprocessOptions(preprocess=False), 1)
    assert result.image.shape == (1485, 1050)
    assert result.meta["preprocessed"] is False and result.meta["deskewAngle"] == 0.0
    # Không phát hiện khuông, không bỏ trang kể cả trang trắng
    assert not pp.process_page(np.full((500, 400), 255, np.uint8), pp.PreprocessOptions(preprocess=False), 1).skipped


def test_tall_page_is_shrunk_and_padded_right_without_cutting():
    tall = np.full((3000, 1000), 255, np.uint8)  # cao hơn tỉ lệ 1485/1050
    tall[0:10, 0:10] = 0
    tall[-10:, -10:] = 0  # góc dưới-phải
    out = pp.fit_to_canvas(tall)
    assert out.shape == (1485, 1050)
    rows, cols = np.where(out < 128)
    assert rows.max() >= 1485 - 6  # nội dung cuối trang không bị cắt
    assert cols.max() < 1050 // 2 + 50  # phần dư bên phải là nền trắng
    assert out[0, 0] == 0  # căn trên-trái


def test_short_page_is_padded_at_bottom():
    short = np.zeros((600, 1000), np.uint8)  # thấp hơn tỉ lệ -> vừa chiều rộng
    out = pp.fit_to_canvas(short)
    assert out.shape == (1485, 1050)
    assert out[0:5, :].max() == 0 and out[-5:, :].min() == 255
    assert out[:, -3:].min() == 0 or out[:, -3:].mean() < 40  # kín chiều rộng


def test_landscape_page_is_flagged():
    options = pp.PreprocessOptions(preprocess=False)
    result = pp.process_page(np.full((1000, 1500), 255, np.uint8), options, 2)
    assert result.image.shape == (1485, 1050)
    assert any("nằm ngang" in w for w in result.warnings)


def test_exif_orientation_is_applied(tmp_path):
    from PIL import Image

    image = Image.fromarray(np.full((200, 400), 255, np.uint8)).convert("RGB")
    exif = Image.Exif()
    exif[0x0112] = 6  # xoay 90° theo chiều kim đồng hồ khi hiển thị
    path = tmp_path / "photo.jpg"
    image.save(path, exif=exif)
    assert pp.load_image_gray(path).shape == (400, 200)


def test_transparent_png_is_composited_on_white(tmp_path):
    from PIL import Image

    rgba = np.zeros((300, 300, 4), np.uint8)  # toàn trong suốt (RGB đen)
    path = tmp_path / "t.png"
    Image.fromarray(rgba, "RGBA").save(path)
    assert pp.load_image_gray(path).min() == 255


def test_unreadable_image_raises(tmp_path):
    bad = tmp_path / "bad.png"
    bad.write_bytes(b"not an image")
    with pytest.raises(pp.UnreadablePage):
        pp.load_image_gray(bad)


def test_to_model_array_matches_transcoda_spec(tmp_path):
    img = np.full((1485, 1050), 255, np.uint8)
    img[0:10, 0:10] = 0
    path = tmp_path / "p.png"
    cv2.imwrite(str(path), img)
    array = to_model_array(path)
    assert array.shape == (1, 3, 1485, 1050) and array.dtype == np.float32
    assert array.min() == -1.0 and array.max() == 1.0  # đen -> -1, trắng -> 1
    assert array[0, 0, 0, 0] == -1.0 and array[0, 2, 1484, 1049] == 1.0
    assert np.array_equal(array[0, 0], array[0, 1])  # 3 kênh giống nhau


def test_to_model_array_fits_other_sizes(tmp_path):
    path = tmp_path / "small.png"
    cv2.imwrite(str(path), np.zeros((700, 500), np.uint8))
    assert to_model_array(path).shape == (1, 3, 1485, 1050)
