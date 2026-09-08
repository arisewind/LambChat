"""daemon/机器 presence 快照与用户级 WS 推送。

presence 是「加速信号」而非事实源：注册表（Redis TTL 注册）仍是判活依据，
本模块在状态变更点（注册/注销/offline/rename/default/forget）组装全量快照并
经既有 ``ConnectionManager.send_to_user_with_broadcast`` 推给用户的所有在线
客户端（Redis pub/sub 跨实例定向投递）。推送失败只告警不上抛——推送挂了由
前端轮询对账兜底，绝不拖垮注册/注销主流程。

快照契约（WS 消息 ``{"type": "sandbox:presence", "data": {...}}``）：

- ``machines``：全量机器（含离线机，来自 :meth:`list_machines` 的
  ``include_offline=True`），每台带 ``online``/``last_seen``；
- ``default_machine_id``：用户默认机（无则 null）；
- ``legacy_online``：是否存在 legacy 单机 daemon（旧 0.2.0 客户端）；
- ``revision``：快照生成时间戳（unix 秒），前端据此丢弃乱序旧事件。
"""

import time

from src.infra.logging import get_logger
from src.infra.sandbox.relay.registry import SandboxClientRegistry
from src.infra.websocket import get_connection_manager

logger = get_logger(__name__)

SANDBOX_PRESENCE_EVENT = "sandbox:presence"


def _registry_factory() -> SandboxClientRegistry:
    """注册表工厂：独立函数便于测试注入（monkeypatch 替身）。"""
    return SandboxClientRegistry()


async def build_presence_snapshot(user_id: str) -> dict:
    """组装用户级 presence 全量快照（不推送，纯读）。"""
    registry = _registry_factory()
    machines = await registry.list_machines(user_id, include_offline=True)
    default = await registry.get_default_machine(user_id)
    legacy_online = await registry.get_active(user_id) is not None
    return {
        "type": SANDBOX_PRESENCE_EVENT,
        "data": {
            "machines": machines,
            "default_machine_id": default,
            "legacy_online": legacy_online,
            "revision": time.time(),
        },
    }


async def publish_presence(user_id: str) -> None:
    """推送 presence 快照到该用户的全部在线客户端；失败仅告警。"""
    try:
        snapshot = await build_presence_snapshot(user_id)
        manager = get_connection_manager()
        await manager.send_to_user_with_broadcast(user_id, snapshot)
    except Exception as exc:  # noqa: BLE001 - presence 推送失败不得影响主流程
        logger.warning("sandbox presence push failed for user %s: %s", user_id, exc)
