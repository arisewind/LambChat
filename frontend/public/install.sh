#!/usr/bin/env bash
# LambChat macOS 一键安装脚本
#
# 原理：macOS 的「已损坏」提示只由浏览器下载的隔离标记（quarantine）触发，
# curl 下载不带该标记——所以从终端安装的 app 解包即可直接打开，无需 xattr。
# 用法：curl -fsSL https://lambchat.com/install.sh | sh
set -euo pipefail

REPO="Yanyutin753/LambChat"
# 稳定名资产随每次 release 重新上传，免 API 解析、免 GitHub 限流
# （双架构各一份稳定名，按 CPU 架构路由）
APP_DIR="${LAMBCHAT_INSTALL_DIR:-/Applications}"
APP="$APP_DIR/LambChat.app"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m错误:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "本脚本仅用于 macOS（Windows/Linux 请到下载页获取对应安装包）"
case "$(uname -m)" in
    arm64)
        DEFAULT_ASSET="LambChat-macOS-Apple-Silicon-latest.app.tar.gz"
        ARCH_LABEL="Apple Silicon"
        ;;
    x86_64)
        DEFAULT_ASSET="LambChat-macOS-Intel-latest.app.tar.gz"
        ARCH_LABEL="Intel"
        ;;
    *) die "无法识别的 CPU 架构：$(uname -m)" ;;
esac
ASSET_URL="${LAMBCHAT_ASSET_URL:-https://github.com/${REPO}/releases/latest/download/${DEFAULT_ASSET}}"
command -v curl >/dev/null 2>&1 || die "缺少 curl（终端执行 xcode-select --install 后重试）"
command -v tar >/dev/null 2>&1 || die "缺少 tar"

[ -d "$APP_DIR" ] || die "安装目录 $APP_DIR 不存在"
[ -w "$APP_DIR" ] || die "无 $APP_DIR 写入权限（管理员账户可直接写；或 LAMBCHAT_INSTALL_DIR=~/Applications 指定其他目录）"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

info "下载最新版 LambChat（${ARCH_LABEL} 版，约 70MB，视网络可能需要几分钟）..."
curl -fL --progress-bar -o "$tmp/LambChat.app.tar.gz" "$ASSET_URL" \
    || die "下载失败：$ASSET_URL（可重试，或手动下载 dmg 安装）"

info "安装到 $APP ..."
# 退出正在运行的实例，避免旧 bundle 文件被占用导致替换不完整
osascript -e 'quit app "LambChat"' >/dev/null 2>&1 || true
sleep 1
rm -rf "$APP"
tar -xzf "$tmp/LambChat.app.tar.gz" -C "$APP_DIR" \
    || die "解包失败（下载可能不完整，请重新运行脚本）"

# 兜底清除隔离标记：curl 下载本不带，防御个别代理/网关注入的场景
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

version="$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo unknown)"
info "安装完成：LambChat v${version} → $APP"
info "首次启动如需配置自有服务器，在应用首屏填写服务器地址即可"
# 启动应用（open 仅 macOS 存在；防御非交互环境挂起用后台运行）
if command -v open >/dev/null 2>&1; then
    open "$APP" >/dev/null 2>&1 || true
fi
