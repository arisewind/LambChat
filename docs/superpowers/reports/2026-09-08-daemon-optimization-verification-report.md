# Daemon 连接优化：三平台全流程验证报告

> **2026-09-08 更新（v2，基于最新 develop 重放）**：本特性已按 develop 新基线
> （含 5161fd12 /status 多机判定、bb3cd54d result 透传、2caad89a 二进制安全帧通道）
> 重新重放为 16 个提交；与 develop 已有修复重复的两项（/status 多机、result 字段）
> 已剔除。桌面端 Windows 进程管理改用 command-group 开源方案（Unix 进程组 /
> Windows Job Object）。最终验证：后端 pytest 4327+500、前端 vitest 531 文件
> 2573 用例、构建 0 错误、ruff/mypy 通过、cargo check 双 target（linux +
> x86_64-pc-windows-gnu）通过、cargo test 9 通过。

- 日期：2026-09-08
- 分支：`feat/daemon-connection-optimization`（17 个提交）
- 相关文档：`docs/superpowers/specs/2026-09-07-daemon-connection-optimization-design.md`（设计规范）、`docs/superpowers/plans/2026-09-07-daemon-connection-optimization.md`（实施计划）
- 阅读方式：本文件是完整原文，会话中的回复只保留压缩版；需要细节时用文件工具读取本文件。

## 1. 三平台验证矩阵

| 平台 | 验证方式 | 结果 |
|---|---|---|
| Linux | 真机全流程冒烟（双 daemon 隔离 HOME + 独立后端 8001 + WS 监听器） | ✅ 8 项全过（见 §2） |
| Windows | mingw + `cargo check --target x86_64-pc-windows-gnu` 全量交叉编译（所有依赖 + 壳代码） | ✅ 通过——taskkill 停止链、tasklist 探活、CREATE_NO_WINDOW 等 `#[cfg(windows)]` 分支在真实 Windows API 表面上完成类型检查 |
| macOS | command-group 开源方案（unix 实现）+ darwin 双架构交叉编译 | ✅ 通过：daemon 进程管理与 Linux 同走 command-group 的 `cfg(unix)` 实现（进程组 setpgid + killpg，底层开源 nix crate），零 apple 专属手搓代码；daemon.rs 依赖面（group_spawn/SIGTERM/try_wait/kill/wait + libc sigaction）在 aarch64-apple-darwin 与 x86_64-apple-darwin 双 target 交叉编译通过；整壳 darwin 编译仍卡 tauri 的 objc2-exception-helper 需 macOS SDK（环境限制、非本项目代码，CI macOS runner 真机编译覆盖）；PBS shim 为 posix `#!/bin/sh`，darwin updater 签名修复已在 develop（dba5534c） |

## 2. Linux 真机全流程明细（8 项）

环境：8001 端口独立后端（用户 dev 服务 8000 全程未动），临时 HOME 隔离跑 daemon（不碰 `~/.lambchat` 真实配对），Redis/Mongo 与 dev 共享（键按冒烟用户隔离，事后清零）。

| # | 验证项 | 实测结果 |
|---|---|---|
| 1 | 多机在线判定（根因修复点） | `/status` 对多机 daemon（machine_id 模式）报 `online:true` + 版本/平台/策略——旧代码此处永远 false |
| 2 | 双机并存 | boxA/boxB（各自 machine_id、隔离 HOME/data_root）同时注册，`/machines` 列表正确 |
| 3 | 定向执行 | 分别下发 `echo $HOME && pwd`，各自返回自己的隔离 HOME 与 workspace 映射，往返 17-24ms |
| 4 | 冒答拒绝 | 在飞行窗口抓到 call_id 与 callassign 绑定（目标=boxA），以 boxB 身份 POST results → **409 sandbox_result_mismatch**，真实结果不受污染（`stdout='real'` 而非 FAKED） |
| 5 | fs 操作全往返 | `fs_write`（带 cwd+content_b64）落盘到隔离 workspace → `fs_read` 的 `result` 字段完整回传内容与行号元信息 |
| 6 | 超限早期拒绝 | 3MB body + Content-Length 头 → **413**（先于读 body），Redis 无 resp 键残留 |
| 7 | 崩溃感知（SIGKILL） | kill -9 daemon → 注册键删除 **13ms**（修复前：35s TTL 平滑倒数过期）+ WS 实时收到下线 presence 事件 |
| 8 | 机器管理 | 重命名（中文名生效）、设默认机（resolve 指向正确）、离线机保留展示（online:false + last_seen）、忘记机器（列表移除、记忆层清除） |

presence 上线推送实测：daemon 进程启动后 2.2s 收到 `sandbox:presence`（大头是进程启动与 SSE 建连，注册后推送即时）；优雅下线（SIGTERM）→ `/status` 翻 offline 24ms。

## 3. 真机冒烟发现并修复的 3 个真 bug（均已提交 + 修复后真机复验）

| Bug | 危害 | 修复提交 | 复验 |
|---|---|---|---|
| `transport.post_offline()` 不带 machine_id | 多机 daemon 优雅下线不注销（服务端走 legacy 分支查不到注册表），offline POST 返回 200 但机器键存活满 35s TTL | `559356c2` | SIGTERM → offline 判定 24ms |
| `/results` 的 Pydantic 模型缺 `result` 字段 | **fs 操作内容自 M1 起被静默丢弃**：daemon 回传 result → Pydantic 忽略未知字段 → 模型侧 `local.py:469` 拿到 done-ok 却无文件内容 | `cd0b72af` | fs_read 内容完整往返 |
| SSE 断流清理在 anyio 取消域中被二次取消吞掉 | 客户端断开时 Starlette 取消流任务，finally 里的裸 `await`（unregister/presence 推送）立即再抛 CancelledError 从不完成——**崩溃感知一直是 35s TTL**（"断流秒级感知"只在优雅退出时成立） | `81da19bd`（清理经 `asyncio.shield` 后台任务） | SIGKILL → 键删除 13ms + 下线推送到达 |

三个 bug 的共性：都在客户端与服务端的接缝上（参数传递、模型字段、框架取消语义），单元测试两侧各自都绿——只有跨组件的真机链路测试能暴露。

诊断方法记录（复现/排查用）：
- post_offline bug：daemon 日志显示已优雅下线、服务端日志 offline 200，但 redis-cli 里机器键 TTL 在倒数 → 定位参数未携带。
- result 字段 bug：fs_write 落盘正确但 dispatch 返回的 done 载荷无 `result` 键 → 对比 daemon 发送的 body 与端点模型定义。
- 取消域 bug：SIGKILL 后逐秒观测 TTL（31→29→…→1 平滑倒数，从未提前消失）+ WS 无下线事件 → finally 未执行；用最小 SSE 探针（finally 只做同步 print）对照验证 uvicorn 取消语义正常 → 差异在被取消域内的裸 await → shield 修复。

## 4. 优化后指标（与优化前对比）

| 指标 | 优化前 | 实测 |
|---|---|---|
| daemon 上线 → 前端感知 | 最长 10s 轮询 + 注册延迟 | presence 推送即时（daemon 启动 2.2s 含进程启动） |
| daemon 优雅下线 → 感知 | 15-35s（修复前 post_offline 对多机无效） | 24ms |
| daemon 崩溃 → 感知 | 35s TTL | 13ms |
| 命令全链路往返 | ≥50ms 轮询 floor + RTT | 17-24ms |
| Redis 空转 QPS/daemon | 20/s（LPOP 50ms 轮询） | ~1/s（BLPOP 1s 切片） |
| 前端空闲请求 | 6 req/10s（多实例轮询） | 推送直达 + WS 健康 60s 对账 |

## 5. 全量回归与验证状态

- 后端 pytest：4166 通过 / 1 跳过
- 前端 vitest：2308 通过；`pnpm run build` 通过；ESLint 0 error
- 后端 ruff / mypy：通过
- Rust：`cargo check`（linux）+ `cargo check --target x86_64-pc-windows-gnu` 通过；`cargo test --lib` 9 通过
- 客户端（client/lambchat_sandbox）pytest：315 通过（含 win 平台语义模拟：executor_win / platform / shell 引用规则）
- 冒烟现场已清理：PAT 吊销、冒烟进程全杀、临时 HOME/文件删除、Redis 冒烟键清零、dev 服务 8000 无恙；dev 库留有一个已激活无 PAT 的 `daemon_smoke*` 测试用户（可删）

## 6. 提交清单（develop...HEAD，17 个）

1. `66975e9c` fix(sandbox): /status 在线判定多机感知（根因修复）
2. `96113ec4` feat(frontend): 在线双保险 + 默认本地档
3. `55d745c4` feat(sandbox): registry 机器记忆层（last_seen/离线保留）
4. `fa8ef711` feat(sandbox): presence 快照与用户级 WS 推送模块
5. `138b7462` feat(sandbox): 注册/注销/offline/机器管理 6 处挂钩 presence 推送
6. `a67186ff` feat(frontend): sandboxStatusStore 全局单例
7. `c7cede65` feat(frontend): useSandboxStatus 收敛为 store 薄壳 + WS presence 分发
8. `61f500ac` perf(sandbox): 下发队列 LPOP 轮询改 BLPOP 阻塞读
9. `f348b04e` feat(sandbox): 结果回传队列化 + dispatch BLPOP + 调用-机器绑定 + CL 早期拒绝 + 全链路集成测试
10. `94a69c8d` feat(client): 回传带 machine_id + Windows SIGBREAK fallback
11. `5f785a40` test(client): SIGBREAK 用例导入修复
12. `8af39370` feat(desktop): 托管状态事件化 + 重启预算恢复 + 退避 + Windows taskkill/tasklist
13. `a22884ab` feat(sandbox): 机器选择器与卡片专业化（离线置灰/last_seen/忘记/默认机置顶）+ 五语
14. `0b1cd38e` test(sandbox): machines 路由 fake 适配
15. `86872695` fix(frontend): StorageLike 类型 + 文档
16. `559356c2` fix(client): post_offline 携带 machine_id（真机发现 #1）
17. `cd0b72af` fix(sandbox): /results 补 result 字段（真机发现 #2）
18. `81da19bd` fix(sandbox): 断流清理 asyncio.shield（真机发现 #3）

## 7. 残留风险与 Windows 真机清单

唯一残留：Windows 真机运行时行为未实测（代码已交叉编译验证；强杀场景已有 13ms 级崩溃感知兜底，且该修复三平台共用）。发版前在 Windows 真机过 4 步：

1. 打开桌面端 → 托盘出现 → 设置页"本地沙箱"几秒内在线（tasklist 探活 + SIGBREAK 注册）
2. 本地档跑 `echo`（Windows shim/pbs python3.exe 复制语义 + cmd 引用）
3. 关闭客户端 → 任务管理器确认 lambchat-daemon 进程消失（taskkill /T）+ 服务端 status 秒翻 offline
4. 任务管理器强杀 daemon → 壳自动重启（预算内）+ presence 下线再上线

异常时按 §3 的诊断方法定位（先分清：进程死没死 / offline POST 到没到 / Redis 键是删了还是在倒数）。

## 8. 多架构支持矩阵（与发布管线对齐）

发布矩阵（app-release.yml）共 5 个 target，`sidecar_binary_path` 的 triple 映射与 `client/scripts/fetch-pbs.py` 的 `PLATFORM_TRIPLES`、`build-daemon.sh` 的 host-triple 探测**逐项一致**：

| 发布 target | triple | Rust 全量编译 | 进程管理依赖面编译 | 说明 |
|---|---|---|---|---|
| Linux x86_64 | x86_64-unknown-linux-gnu | ✅ cargo check + test | ✅ | 真机全流程冒烟 |
| Linux ARM64 | aarch64-unknown-linux-gnu | CI 原生（ubuntu-24.04-arm） | ✅ 本机交叉 | 全量编译卡 libdbus-sys 需 aarch64 系统库（CI ARM runner 原生覆盖） |
| Windows x86_64 | x86_64-pc-windows-msvc | ✅ x86_64-pc-windows-gnu 全量交叉 | ✅ | gnu/msvc 对本仓代码 API 面等价 |
| macOS Apple Silicon | aarch64-apple-darwin | CI 原生（macos-14） | ✅ 本机交叉 | 整壳卡 tauri objc2 需 macOS SDK |
| macOS Intel | x86_64-apple-darwin | CI 原生（Rosetta sidecar） | ✅ 本机交叉 | 同上 |

- daemon.rs / tray.rs **零 `target_arch` 运行时代码**（进程管理只有 OS 级 cfg(unix)/windows）；lib.rs 的 5 处 target_arch 均在 `#[cfg(test)]` 的 PBS 标签单测内，与 fetch-pbs.py 五键一一对应
- command-group（纯 Rust + nix）与 Python daemon 均架构无关；PBS 归档按平台（非架构单独）分发，五键全覆盖

## 9. 环境备注

- 为 Windows 交叉检查安装了 `mingw-w64`（系统级，rustup targets：x86_64-pc-windows-gnu/msvc、aarch64/x86_64-apple-darwin）；本机占位文件（src-tauri/binaries/*、icons/*、resources/python/）均为 gitignored 开发产物，未入库。
