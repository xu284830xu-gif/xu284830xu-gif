# 花间集 · 阿里云 ECS 部署说明

> 目标：把 `flower-manager` 跑在你的阿里云 ECS 上，得到一个公网可访问的地址。
> 本目录文件：`install.sh`（一键脚本）、`huajian.service`（systemd 模板）、`nginx-huajian.conf`（反代配置）、`env.production.example`（环境变量示例）。

---

## 1. 前置条件

| 项目 | 要求 |
| --- | --- |
| 实例规格 | 1 核 1G 起（推荐 2 核 2G，AI 调用不占本地资源） |
| 系统镜像 | **Ubuntu 22.04 / 24.04** 或 **Alibaba Cloud Linux 3**（CentOS 7 太老，见第 8 节） |
| 出网 | 需要能访问 `github.com`（拉代码）与 `nodejs.org`（装 Node）；国内机器建议配阿里云镜像或代理 |
| 安全组 | 入方向放行 **22**（SSH），以及 **80 / 443**（用域名时）或 **8787**（直接 IP:端口） |
| 备案 | 大陆节点用**域名 + 80/443** 需要 ICP 备案；只用 `IP:端口` 不需要 |

阿里云控制台 → 实例 → 「远程连接 / Workbench」就能打开一个网页终端，下面的命令直接粘进去执行。

---

## 2. 一键部署（推荐）

在服务器上（root）执行：

```bash
cd /root
curl -fsSLO https://raw.githubusercontent.com/xu284830xu-gif/xu284830xu-gif/main/flower/flower-manager/deploy/install.sh
less install.sh          # 建议先看一眼内容
sudo bash install.sh
```

脚本会依次完成：

1. 装 `git / curl / tar / xz`（按 apt / dnf / yum 自动选）
2. 安装 Node.js v22 到 `/usr/local/lib/nodejs`（已是 22+ 则跳过）
3. 创建系统账号 `huajian`，把仓库克隆到 `/opt/huajian`
4. 生成 `/etc/huajian.env`（端口、监听地址、AI 配置）
5. 写入并启动 systemd 服务 `huajian`（开机自启、崩溃自动重启）
6. 轮询 `/api/health` 确认真的起来了，失败会打印最近 30 行日志

结束时打印：

```text
本机监听     : http://127.0.0.1:8787
后台入口     : http://<公网IP>:8787/
顾客端       : http://<公网IP>:8787/shop
AI 直达页    : http://<公网IP>:8787/ai
```

### 想先直连测试

```bash
sudo BIND_HOST=0.0.0.0 bash install.sh
```

然后到安全组放行 8787，浏览器访问 `http://<公网IP>:8787`。

---

### 想出网受限时（不拉 GitHub，改成本地上传）

```powershell
# 本地（Windows PowerShell，自带 bsdtar）
tar -czf flower-manager.tar.gz -C 'E:\花卉' flower-manager
scp flower-manager.tar.gz root@<公网IP>:/root/
```

```bash
# 服务器：解到 /opt/huajian/flower，最终路径为 /opt/huajian/flower/flower-manager
sudo mkdir -p /opt/huajian/flower
sudo tar -xzf /root/flower-manager.tar.gz -C /opt/huajian/flower

# 跳过 git，直接装 Node + 建服务
sudo SKIP_GIT=1 BIND_HOST=0.0.0.0 bash install.sh
```

之后更新代码：本地重新打包上传，`sudo tar -xzf /root/flower-manager.tar.gz -C /opt/huajian/flower && sudo systemctl restart huajian`。

> 用 tar 而不是 zip：Windows 打的 zip 里路径是反斜杠，Linux 上 `unzip` 会把文件名弄乱。

---

## 3. 手动部署（不想跑脚本时）

```bash
# 1) 依赖
sudo apt update && sudo apt install -y git curl tar xz-utils

# 2) Node 22（x64；ARM 实例把 x64 换成 arm64）
BASE=https://nodejs.org/dist/latest-v22.x
FILE=$(curl -fsSL $BASE/SHASUMS256.txt | grep -o 'node-v[0-9.]*-linux-x64\.tar\.xz' | head -1)
curl -fsSL $BASE/$FILE -o /tmp/node.tar.xz
sudo tar -xJf /tmp/node.tar.xz -C /usr/local/lib
sudo ln -sf /usr/local/lib/${FILE%.tar.xz}/bin/node /usr/local/bin/node

# 3) 账号 + 代码
sudo useradd --system --create-home --home-dir /opt/huajian --shell /usr/sbin/nologin huajian
sudo git clone --depth 1 https://github.com/xu284830xu-gif/xu284830xu-gif.git /opt/huajian
sudo chown -R huajian:huajian /opt/huajian

# 4) 环境变量
sudo tee /etc/huajian.env >/dev/null <<'EOF'
PORT=8787
HOST=127.0.0.1
EOF
sudo chmod 600 /etc/huajian.env

# 5) systemd（把 huajian.service 里的占位符换掉）
sudo cp flower/flower-manager/deploy/huajian.service /etc/systemd/system/huajian.service
sudo sed -i "s#__NODE_BIN__#/usr/local/bin/node#; s#__APP_DIR__#/opt/huajian/flower/flower-manager#; s#__SERVICE_USER__#huajian#g" /etc/systemd/system/huajian.service
sudo systemctl daemon-reload
sudo systemctl enable --now huajian

# 6) 验证
curl -s http://127.0.0.1:8787/api/health
```

---

## 4. 域名 + HTTPS

前提：域名已解析到 ECS 公网 IP。**大陆节点需备案，香港/海外节点不需要。**

```bash
# 1) 反代（Ubuntu/Debian）
sudo apt install -y nginx
sudo cp flower/flower-manager/deploy/nginx-huajian.conf /etc/nginx/conf.d/huajian.conf
# Ubuntu 自带 default 站点是 default_server，不删掉的话用 IP 访问会落到默认页
sudo rm -f /etc/nginx/sites-enabled/default
sudo sed -i 's/server_name _;/server_name your-domain.com;/' /etc/nginx/conf.d/huajian.conf
sudo nginx -t && sudo systemctl reload nginx

# 2) 证书（Let's Encrypt 免费）
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

阿里云 SSL 证书服务也提供免费证书，下载 Nginx 格式后手工配置 `ssl_certificate` / `ssl_certificate_key`。

> 只想先用 IP 访问、不配域名：`server_name _;` 保持不动，删掉 default 站点后直接访问 `http://<公网IP>/` 即可。

> 反代配置里 `proxy_buffering off` 是必须的：协作功能用 SSE（`/api/events`），缓冲区会把事件攒住不发，前端会退化成 2.5 秒轮询（能同步，但实时性变差）。

---

## 5. 安全加固（很重要）

应用**没有登录鉴权**：任何人拿到地址就能改库存、开单、退款。公网暴露前至少做一条：

**① 加一层 Basic Auth（最省事）**

```bash
printf "huajian:$(openssl passwd -apr1 '换成你的密码')\n" | sudo tee /etc/nginx/.huajian.htpasswd
sudo sed -i 's|# auth_basic           "Huajian Admin";|auth_basic "Huajian Admin";|; s|# auth_basic_user_file /etc/nginx/.huajian.htpasswd;|auth_basic_user_file /etc/nginx/.huajian.htpasswd;|' /etc/nginx/conf.d/huajian.conf
sudo nginx -t && sudo systemctl reload nginx
```

顾客端 `/shop` 如果需要对外公开，按配置文件里注释的 `location /shop { auth_basic off; … }` 放行。

**② 安全组只放行自己的 IP**

阿里云控制台 → 安全组 → 入方向 → 来源改成「我的 IP」，而不是 `0.0.0.0/0`。

**③ 换掉默认端口**

`/etc/huajian.env` 里改 `PORT=18787`，同步改 Nginx 的 `upstream`；能挡掉大部分扫描。

---

## 6. 日常运维

```bash
# 状态 / 重启 / 停止
systemctl status huajian
systemctl restart huajian
systemctl stop huajian

# 实时日志
journalctl -u huajian -f

# 更新代码（仓库是公开的，直接 pull）
cd /opt/huajian && sudo git pull && sudo systemctl restart huajian

# 看健康状态
curl -s http://127.0.0.1:8787/api/health | head -c 300
```

### 数据备份

所有经营数据在 `/opt/huajian/flower/flower-manager/server/data/state.json`：

```bash
# 手工备份
sudo cp /opt/huajian/flower/flower-manager/server/data/state.json /root/state-$(date +%F).json

# 每天 3 点自动备份（保留 7 天）
echo '0 3 * * * cp /opt/huajian/flower/flower-manager/server/data/state.json /root/state-$(date +\%F).json' | sudo crontab -
```

页面里「店铺与数据 → 导出完整备份」也能导出同样的 JSON。

---

## 7. 排障

| 现象 | 排查 |
| --- | --- |
| 服务起不来 | `journalctl -u huajian -n 50 --no-pager`，常见是 Node 版本不对或目录权限 |
| `status=203/EXEC` | `ExecStart` 里的 node 路径不存在，`which node` 改一下 unit |
| 本机 curl 通、公网不通 | 安全组没放行端口；或 `HOST=127.0.0.1` 却想直连（改成 `0.0.0.0`） |
| 页面能开但保存失败 | 目录不可写：`chown -R huajian:huajian /opt/huajian/flower/flower-manager/server/data` |
| 两个浏览器不同步 | 反代缓冲了 SSE：确认 `proxy_buffering off`；或前端已降级为 2.5 秒轮询 |
| 502 Bad Gateway | 应用没起来或被防火墙拦，先 `curl 127.0.0.1:8787/api/health` |
| 拉代码超时 | 国内机器访问 GitHub 不稳，可在本地 `git clone` 后用 `scp` 上传，或配代理 |

---

## 8. 系统兼容性说明

- **Ubuntu / Debian / Alibaba Cloud Linux 3 / Rocky / AlmaLinux**：直接跑脚本。
- **CentOS 7**：glibc 2.17，Node 22 跑不起来。用 Node 18：

  ```bash
  sudo NODE_MAJOR=18 bash install.sh
  ```

  应用代码本身不依赖 Node 22 的新 API（只是 `npm start` 用了 `--env-file-if-exists`，而 systemd 走 `EnvironmentFile`，不受影响）。
- **ARM 实例（倚天 / g8y 等）**：脚本会自动识别 `aarch64` 并下载 `arm64` 包。
