# 每日热点新闻聚合系统 - 安装指南

## 系统要求

### 硬件要求
- **内存**: 至少 2GB RAM
- **存储**: 至少 1GB 可用空间（数据库和日志）
- **CPU**: 现代双核处理器

### 软件要求
- **操作系统**: Linux, macOS, Windows (WSL2 推荐)
- **Node.js**: 版本 18 或更高
- **npm**: 版本 9 或更高
- **Docker** (可选): 版本 20.10 或更高 (用于容器化部署)
- **Docker Compose** (可选): 版本 2.0 或更高

### 第三方服务账户
- **Claude API**: 用于新闻摘要生成
- **Telegram Bot** (可选): 用于通知推送
- **SMTP 服务器** (可选): 用于邮件通知

## 安装方法

### 方法 1: Docker 快速安装（推荐）

#### 步骤 1: 克隆仓库
```bash
git clone https://github.com/your-org/everyday-news.git
cd everyday-news
```

#### 步骤 2: 配置环境变量
```bash
# 复制环境变量模板
cp .env.example .env.prod

# 编辑环境变量
nano .env.prod
```

需要配置的关键环境变量:
- `LLM_API_KEY`: Claude API 密钥
- `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_CHAT_ID` (可选)
- `SMTP_*` 相关配置 (可选)

#### 步骤 3: 启动服务
```bash
# 使用部署脚本
chmod +x scripts/deploy.sh
./scripts/deploy.sh prod up

# 或者直接使用 docker compose
docker compose --env-file .env.prod up -d
```

#### 步骤 4: 验证安装
```bash
# 查看服务状态
./scripts/deploy.sh prod status

# 查看日志
./scripts/deploy.sh prod logs
```

访问 `http://localhost:3000/health` 检查健康状态。

### 方法 2: 手动安装（开发环境）

#### 步骤 1: 克隆仓库
```bash
git clone https://github.com/your-org/everyday-news.git
cd everyday-news
```

#### 步骤 2: 使用开发环境设置脚本
```bash
# 运行开发环境设置脚本
chmod +x scripts/dev-setup.sh
./scripts/dev-setup.sh
```

脚本会自动:
1. 检查 Node.js 和 npm
2. 安装项目依赖
3. 设置环境变量
4. 初始化数据库
5. 构建项目
6. 运行测试

#### 步骤 3: 手动配置环境变量
如果使用脚本，会自动创建 `.env` 文件。否则:
```bash
cp .env.example .env
nano .env
```

编辑 `.env` 文件，至少配置:
- `LLM_API_KEY`: Claude API 密钥

#### 步骤 4: 启动开发服务器
```bash
npm run dev
```

### 方法 3: 源代码安装（生产环境）

#### 步骤 1: 安装系统依赖
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y nodejs npm sqlite3

# macOS (使用 Homebrew)
brew install node sqlite
```

#### 步骤 2: 安装项目依赖
```bash
npm ci --only=production
```

#### 步骤 3: 构建项目
```bash
npm run build
```

#### 步骤 4: 配置环境变量和数据库
```bash
# 创建数据目录
mkdir -p data data/backups

# 复制环境变量
cp .env.example .env
nano .env

# 初始化数据库
npm run db:init
```

#### 步骤 5: 配置系统服务（Systemd）
创建服务文件 `/etc/systemd/system/everyday-news.service`:
```ini
[Unit]
Description=Everyday News Aggregation System
After=network.target

[Service]
Type=simple
User=everydaynews
WorkingDirectory=/opt/everyday-news
EnvironmentFile=/opt/everyday-news/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启用服务:
```bash
sudo systemctl daemon-reload
sudo systemctl enable everyday-news
sudo systemctl start everyday-news
```

## 验证安装

### 健康检查
```bash
curl http://localhost:3000/health
```
预期响应:
```json
{
  "healthy": true,
  "components": {
    "scheduler": { "healthy": true, "message": "3 tasks scheduled" },
    "notification": { "healthy": true, "message": "Available adapters: email" },
    "monitoring": { "healthy": true, "message": "Recent activity: true" },
    "claude": { "healthy": true, "message": "0 LLM calls recorded" }
  }
}
```

### 数据库状态
```bash
npm run db:status
```

### 系统日志
```bash
# Docker 环境
docker logs everyday-news-app

# 手动安装
tail -f logs/app.log
```

## 故障排除

### 常见问题

#### 1. 端口被占用
错误: `EADDRINUSE: address already in use :::3000`
解决方案:
```bash
# 更改端口
export PORT=3001
npm run dev

# 或者杀死占用进程
sudo lsof -ti:3000 | xargs kill -9
```

#### 2. 数据库权限错误
错误: `SQLITE_CANTOPEN: unable to open database file`
解决方案:
```bash
# 确保数据目录存在且有权限
mkdir -p data
chmod 755 data
```

#### 3. Claude API 密钥无效
错误: `Claude API authentication failed`
解决方案:
- 检查 `LLM_API_KEY` 环境变量
- 确保 API 密钥有足够配额
- 验证网络连接

#### 4. Docker 容器启动失败
错误: `Container exited with code 1`
解决方案:
```bash
# 查看详细日志
docker logs everyday-news-app

# 检查环境变量
docker inspect everyday-news-app | grep -A5 -B5 Env
```

### 获取帮助
- 查看详细日志: `./scripts/deploy.sh prod logs`
- 检查系统健康: `curl http://localhost:3000/health`
- 查看数据库状态: `npm run db:status`

## 下一步

安装完成后，请参考:
- [配置指南](./configuration.md) - 系统详细配置
- [API 文档](./api-documentation.md) - API 接口说明
- [运维指南](./operations.md) - 系统运维和监控
- [故障排除](./troubleshooting.md) - 常见问题解决