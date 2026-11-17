from scripts import check_env


def test_collect_reports_python_and_packages():
    info = check_env.collect()
    assert info["python"].count(".") >= 1
    assert "pytest" in info["packages"]
    assert isinstance(info["problems"], list)
    assert isinstance(info["ok"], bool)


def test_old_python_is_fatal(monkeypatch):
    monkeypatch.setattr(check_env.sys, "version_info", (3, 8, 0, "final", 0))
    info = check_env.collect()
    assert not info["ok"]
    assert any("quá cũ" in p for p in info["problems"])

