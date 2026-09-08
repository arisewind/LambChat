def test_local_exec_timeout_is_frontend_editable_setting():
    """本地命令执行超时入设置定义表（前端可动态更新）。

    卡死命令自动击杀的时长对管理员可调：DB 优先、env 兜底、调用时读取。"""
    from src.kernel.config._definitions_sandbox import SANDBOX_SETTING_DEFINITIONS

    entry = SANDBOX_SETTING_DEFINITIONS.get("SANDBOX_LOCAL_EXEC_TIMEOUT")
    assert entry is not None, "SANDBOX_LOCAL_EXEC_TIMEOUT 必须在设置定义表中"
    assert entry["type"].value == "number"
    assert entry["category"].value == "sandbox"
    assert entry["default"] == 120
    assert entry.get("min_value") is not None and entry["min_value"] >= 1
