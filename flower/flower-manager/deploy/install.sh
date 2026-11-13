#!/usr/bin/env bash
# =========================================================
#  花间集 · 阿里云 ECS 一键部署脚本
#  适用：Ubuntu 20/22/24、Debian 11/12、Alibaba Cloud Linux 3、
#        CentOS 7+ / Rocky / AlmaLinux（x86_64 或 aarch64）
#  用法：sudo bash install.sh
#  可用环境变量覆盖：REPO_URL / APP_ROOT / PORT / BIND_HOST / NODE_MAJOR
# =========================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/xu284830xu-gif/xu284830xu-gif.git}"
APP_ROOT="${APP_ROOT:-/opt/huajian}"
PORT="${PORT:-8787}"
BIND_HOST="${BIND_HOST:-127.0.0.1}"
NODE_MAJOR="${NODE_MAJOR:-22}"
NODE_BIN=""
SERVICE_NAME="huajian"
SERVICE_USER="huajian"
ENV_FILE="/etc/huajian.env"
APP_DIR="$APP_ROOT/flower/flower-manager"

log()  { printf '\033[32m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '\033[33m[warn]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash install.sh"

# ---------- 1. 基础依赖 ----------
if command -v apt-get >/dev/null 2>&1; then
  PKG=apt; export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq git curl ca-certificates tar xz-utils >/dev/null
elif command -v dnf >/dev/null 2>&1; then
  PKG=dnf; dnf install -y -q git curl ca-certificates tar xz >/dev/null
elif command -v yum >/dev/null 2>&1; then
  PKG=yum; yum install -y -q git curl ca-certificates tar xz >/dev/null
else
  die "未识别的包管理器（不是 apt/dnf/yum），请手动安装 git、curl、tar、xz 后重试"
fi
log "依赖检查完成（$PKG）"

# ---------- 2. Node.js ----------
node_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo x64 ;;
    aarch64|arm64) echo arm64 ;;
    *) die "不支持的 CPU 架构：$(uname -m)" ;;
  esac
}

node_major_now() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

if [ "$(node_major_now)" -lt "$NODE_MAJOR" ]; then
  log "安装 Node.js v${NODE_MAJOR}.x（当前：$(node_major_now)）"
  ARCH="$(node_arch)"
  BASE="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x"
  FILE="$(curl -fsSL "$BASE/SHASUMS256.txt" | grep -o "node-v[0-9.]*-linux-${ARCH}\.tar\.xz" | head -n1)"
  [ -n "$FILE" ] || die "无法从 nodejs.org 获取 v${NODE_MAJOR}.x 安装包（检查出网/镜像）"
  mkdir -p /usr/local/lib
  curl -fsSL "$BASE/$FILE" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /usr/local/lib
  ln -sf "/usr/local/lib/${FILE%.tar.xz}/bin/node" /usr/local/bin/node
  rm -f /tmp/node.tar.xz
  NODE_BIN=/usr/local/bin/node
fi
[ -n "$NODE_BIN" ] || NODE_BIN="$(command -v node)"
log "Node 版本：$("$NODE_BIN" -v)（$NODE_BIN）"

# ---------- 3. 服务账号与代码 ----------
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$APP_ROOT" --shell /usr/sbin/nologin "$SERVICE_USER" 2>/dev/null \
    || useradd --system --create-home --home-dir "$APP_ROOT" --shell /sbin/nologin "$SERVICE_USER"
  log "已创建账号 $SERVICE_USER"
fi

if [ -d "$APP_ROOT/.git" ]; then
  log "更新代码：git pull"
  git -C "$APP_ROOT" fetch --depth 1 origin main
  git -C "$APP_ROOT" reset --hard origin/main
else
  log "克隆仓库到 $APP_ROOT"
  rm -rf "$APP_ROOT"
  mkdir -p "$APP_ROOT"
  git clone --depth 1 "$REPO_URL" "$APP_ROOT"
fi
[ -f "$APP_DIR/server/server.mjs" ] || die "代码不完整：$APP_DIR/server/server.mjs 不存在"

chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_ROOT"
mkdir -p "$APP_DIR/server/data"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/server/data"

# ---------- 4. 环境变量 ----------
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
# 花间集运行配置（install.sh 生成，可手工修改后 systemctl restart $SERVICE_NAME）
PORT=$PORT
HOST=$BIND_HOST

# AI 模型（不配则用 Pollinations 匿名接口，超出额度自动回退本地规则）
# LLM_ENDPOINT=https://api.deepseek.com/chat/completions
# LLM_MODEL=deepseek-chat
# LLM_API_KEY=sk-xxxxxxxxxxxxxxxx

# 顾客端展示信息
# SHOP_HOURS=09:00 - 21:00
# SHOP_PHONE=0571-88888888
EOF
  chmod 600 "$ENV_FILE"
  log "已生成 $ENV_FILE"
else
  log "沿用已有配置 $ENV_FILE"
fi

# ---------- 5. systemd ----------
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Huajian Flower Manager (花间集)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=-$ENV_FILE
ExecStart=$NODE_BIN server/server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ProtectHome=read-only

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME" >/dev/null 2>&1
log "服务已启动：$SERVICE_NAME"

# ---------- 6. 健康检查 ----------
ok=0
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/tmp/huajian-health.json 2>/dev/null; then ok=1; break; fi
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  warn "健康检查失败，最近日志："
  journalctl -u "$SERVICE_NAME" -n 30 --no-pager || true
  die "启动失败，请按上面的日志排查"
fi

log "健康检查通过：$(head -c 160 /tmp/huajian-health.json)…"

cat <<EOF

================ 部署完成 ================
本机监听     : http://${BIND_HOST}:${PORT}
后台入口     : http://<公网IP>:${PORT}/       （BIND_HOST=127.0.0.1 时需 Nginx 反代）
顾客端       : http://<公网IP>:${PORT}/shop
AI 直达页    : http://<公网IP>:${PORT}/ai
服务管理     : systemctl status ${SERVICE_NAME} | restart ${SERVICE_NAME}
实时日志     : journalctl -u ${SERVICE_NAME} -f
配置文件     : ${ENV_FILE}
数据文件     : ${APP_DIR}/server/data/state.json

下一步：
1. 阿里云控制台 → 安全组 → 入方向放行 ${PORT}（或 80/443），否则公网访问不到
2. 想用域名 + HTTPS：见 deploy/README.md 第 4 节
3. 系统没有登录鉴权，公网暴露前建议加 Nginx Basic Auth（见 README 第 5 节）
==========================================
EOF
