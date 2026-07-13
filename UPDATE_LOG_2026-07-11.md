# LambChat 更新日志

**日期**: 2026-07-11
**版本**: v2.5.4 (pending)
**类型**: 安全修复 + Bug 修复 + 国际化

---

## ✅ 本更新内容

### 🔒 安全修复 (Critical)

#### 1. MCP 加密密钥派生向后兼容性改进
**文件**: `src/infra/mcp/encryption.py`

**问题**: 旧版 SHA256 密钥解密成功时仅记录 info 级别日志，未充分提示用户迁移到更安全的 PBKDF2 加密。

**修复**:
- 将旧密钥警告从 `logger.info` 升级为 `logger.warning`
- 添加明确的弃用说明和迁移建议

```python
logger.warning(
    "使用已弃用的旧版 SHA256 密钥解密成功。"
    "请重新保存此配置以迁移到更安全的 PBKDF2 加密。"
    "旧密钥支持将在未来版本中移除。"
)
```

**影响**: 用户使用旧密钥解密时会看到明确的警告提示，便于及时迁移。

---

#### 2. 文件上传路径认证说明完善
**文件**: `src/api/middleware/auth.py`

**问题**: `/api/upload/file/` 路径在公开前缀列表中，缺少设计意图说明。

**修复**: 为 `/api/upload/file/` 前缀添加设计意图注释

```python
"/api/upload/file/",  # 文件访问端点 - 设计为公开以支持文件分享和前端访问
```

**说明**: GET `/api/upload/file/{key}` 端点明确标记为"No authentication required"，用于支持文件分享和前端访问。文件 key 使用 UUID 生成，包含用户 ID 以实现基本隔离。

---

### 🐛 Bug 修复

#### 3. 修复飞书渠道连接状态检查
**文件**: `src/infra/channel/feishu/storage.py`

**问题**: `get_status()` 方法返回的 `connected` 字段固定为 `False`，未检查实际连接状态。

**修复**:

```python
# 修改前
# TODO: Check actual connection status from channel manager
return FeishuConfigStatus(
    enabled=config.enabled,
    connected=False,  # Will be updated by channel manager
)

# 修改后
from src.infra.channel.feishu.manager import get_feishu_channel_manager

manager = get_feishu_channel_manager()
is_channel_connected = manager.is_connected(user_id, config.instance_id)

return FeishuConfigStatus(
    enabled=config.enabled,
    connected=is_channel_connected,
)
```

**影响**: 飞书渠道状态现在正确反映实际连接情况。

---

### 🌍 国际化 (i18n)

#### 4. 补全俄语、韩语、日语翻译
**文件**: `frontend/src/i18n/locales/ru.json`, `ko.json`, `ja.json`

**问题**: 俄语、韩语、日语中有 `[TODO]` 占位符未翻译。

**修复**: 补全缺失的翻译

| 语言 | 键 | 翻译 |
|------|---|------|
| 🇷🇺 俄语 | `chat.addMoreFiles` | "Добавить еще файлы" |
| 🇷🇺 俄语 | `chat.commands.runSkillsCount` | "{{count}} навыков для следующего сообщения" |
| 🇰🇷 韩语 | `chat.addMoreFiles` | "더 많은 파일 추가" |
| 🇰🇷 韩语 | `chat.commands.runSkillsCount` | "다음 메시지를 위한 {{count}}개 스킬" |
| 🇯🇵 日语 | `chat.addMoreFiles` | "さらにファイルを追加" |
| 🇯🇵 日语 | `chat.commands.runSkillsCount` | "次のメッセージのための{{count}}つのスキル" |

**影响**: 俄语、韩语、日语用户现在可以看到完整的界面翻译。

---

## 📝 修改文件清单

| # | 文件路径 | 类型 | 说明 |
|---|----------|------|------|
| 1 | `src/infra/mcp/encryption.py` | 安全 | 升级旧密钥警告级别 |
| 2 | `src/api/middleware/auth.py` | 安全 | 添加设计意图注释 |
| 3 | `src/infra/channel/feishu/storage.py` | Bug | 实现连接状态检查 |
| 4 | `frontend/src/i18n/locales/ru.json` | i18n | 补全俄语翻译 |
| 5 | `frontend/src/i18n/locales/ko.json` | i18n | 补全韩语翻译 |
| 6 | `frontend/src/i18n/locales/ja.json` | i18n | 补全日语翻译 |

---

## 🔍 验证状态

- ✅ 飞书连接状态检查逻辑正确
- ✅ 所有 JSON 文件语法验证通过
- ✅ Docker Compose 配置有效

---

## 📋 后续待办事项

根据项目审计报告，以下改进项待处理：

### 🟡 [STRUCT] 架构改进
- [ ] 拆分 BaseGraphAgent 类 (`src/agents/core/base.py`)
- [ ] 拆分 MCP Storage 类 (`src/infra/mcp/storage.py`)
- [ ] 添加前端 Error Boundary (`frontend/src/App.tsx`)

### 🟢 [INCR] 代码优化
- [ ] 补充 Agent 核心逻辑测试覆盖率
- [ ] 引入 API 版本控制 (`/api/v1/`)
- [ ] 引入结构化日志 (structlog)
- [ ] 评估前端状态管理方案 (Zustand/Jotai)

---

## 📚 参考资料

- 项目审计报告: `memory/lambchat-project-audit.md`
- 项目文档: `CLAUDE.md`
- 更改日志: `CHANGELOG.md`

---

**生成时间**: 2026-07-11
**会话 ID**: opus-4-8[1m]
