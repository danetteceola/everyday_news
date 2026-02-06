# 数据采集模块安装指南

## 目录

1. [系统要求](#系统要求)
2. [安装方式](#安装方式)
   - [Docker安装](#docker安装)
   - [手动安装](#手动安装)
   - [开发环境安装](#开发环境安装)
3. [配置说明](#配置说明)
   - [基础配置](#基础配置)
   - [平台配置](#平台配置)
   - [反爬配置](#反爬配置)
   - [调度配置](#调度配置)
4. [验证安装](#验证安装)
5. [故障排除](#故障排除)

## 系统要求

### 最低要求

- **操作系统**: Linux, macOS, Windows (WSL2)
- **内存**: 4GB RAM
- **存储**: 10GB 可用空间
- **网络**: 稳定的互联网连接

### 推荐配置

- **操作系统**: Ubuntu 20.04+ 或 CentOS 8+
- **内存**: 8GB RAM
- **存储**: 50GB SSD
- **CPU**: 4核以上
- **网络**: 100Mbps+ 带宽

### 软件依赖

- **Node.js**: 18.x 或更高版本
- **Docker**: 20.10+ (可选，用于容器化部署)
- **Git**: 2.30+ (用于代码管理)
- **SQLite**: 3.35+ (用于数据存储)

## 安装方式

### Docker安装（推荐）

#### 步骤1: 安装Docker

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io docker-compose

# CentOS/RHEL
sudo yum install docker docker-compose
sudo systemctl start docker
sudo systemctl enable docker

# macOS
brew install docker docker-compose
```

#### 步骤2: 获取代码

```bash
git clone https://github.com/your-repo/everyday_news.git
cd everyday_news
```

#### 步骤3: 构建和运行

```bash
# 使用部署脚本
cd deploy/collection
chmod +x deploy.sh
./deploy.sh deploy

# 或手动使用Docker Compose
docker-compose up -d
```

#### 步骤4: 验证安装

```bash
# 检查容器状态
docker-compose ps

# 查看日志
docker-compose logs -f collection-service

# 测试服务
curl http://localhost:9090/health
```

### 手动安装

#### 步骤1: 安装Node.js

```bash
# 使用nvm（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# 或使用包管理器
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs
```

#### 步骤2: 获取代码

```bash
git clone https://github.com/your-repo/everyday_news.git
cd everyday_news
```

#### 步骤3: 安装依赖

```bash
npm ci --only=production
```

#### 步骤4: 构建项目

```bash
npm run build
```

#### 步骤5: 配置环境

```bash
# 复制配置文件
cp config/collection.config.example.json config/collection.config.json

# 编辑配置文件
vi config/collection.config.json
```

#### 步骤6: 启动服务

```bash
# 启动采集服务
node dist/src/collection/collection-service.js start

# 或使用PM2管理进程
npm install -g pm2
pm2 start dist/src/collection/collection-service.js --name collection-service
pm2 save
pm2 startup
```

### 开发环境安装

#### 步骤1: 安装开发工具

```bash
# 安装TypeScript编译器
npm install -g typescript

# 安装开发依赖
npm ci
```

#### 步骤2: 配置开发环境

```bash
# 创建开发配置
cp config/collection.config.dev.json config/collection.config.json

# 安装Playwright浏览器
npx playwright install chromium
```

#### 步骤3: 启动开发服务器

```bash
# 开发模式（自动重载）
npm run dev:collection

# 或手动运行
npm run build:watch &
node dist/src/collection/collection-service.js start
```

#### 步骤4: 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- --grep "twitter"

# 运行集成测试
npm run test:integration
```

## 配置说明

### 基础配置

配置文件位置: `config/collection.config.json`

```json
{
  "system": {
    "debug": false,
    "logLevel": "info",
    "maxConcurrentCollections": 3,
    "maxItemsPerCollection": 100,
    "requestTimeout": 30000,
    "maxRetryAttempts": 3
  }
}
```

#### 配置项说明

- `debug`: 调试模式（true/false）
- `logLevel`: 日志级别（debug/info/warn/error）
- `maxConcurrentCollections`: 最大并发采集数
- `maxItemsPerCollection`: 每次采集最大项目数
- `requestTimeout`: 请求超时时间（毫秒）
- `maxRetryAttempts`: 最大重试次数

### 平台配置

```json
{
  "platforms": [
    {
      "platform": "twitter",
      "enabled": true,
      "platformSpecific": {
        "collectionTargets": {
          "maxTweetsPerCollection": 20
        },
        "schedule": "0 */2 * * *",
        "priority": "normal",
        "maxRetries": 3,
        "timeout": 300000
      }
    }
  ]
}
```

#### 支持的平台

1. **Twitter** (`twitter`)
   - 采集趋势话题和热门推文
   - 需要稳定的国际网络连接

2. **YouTube** (`youtube`)
   - 采集趋势视频
   - 需要处理视频元数据

3. **TikTok** (`tiktok`)
   - 采集趋势视频
   - 需要处理区域限制

4. **微博** (`weibo`)
   - 采集热搜话题
   - 需要处理中文编码

5. **抖音** (`douyin`)
   - 采集热搜视频
   - 需要处理中文内容

#### 平台配置项

- `enabled`: 是否启用该平台
- `platformSpecific.collectionTargets.maxXPerCollection`: 每次采集最大数量
- `platformSpecific.schedule`: 调度频率（cron表达式）
- `platformSpecific.priority`: 任务优先级（low/normal/high/critical）
- `platformSpecific.maxRetries`: 最大重试次数
- `platformSpecific.timeout`: 任务超时时间（毫秒）

### 反爬配置

```json
{
  "antiCrawling": {
    "enabled": true,
    "requestDelay": {
      "minDelay": 1000,
      "maxDelay": 5000
    },
    "userAgents": [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    ],
    "proxy": {
      "enabled": false,
      "list": [],
      "rotationInterval": 3600000
    },
    "retryStrategy": {
      "maxRetries": 3,
      "backoffFactor": 2,
      "initialDelay": 1000
    }
  }
}
```

#### 反爬策略

1. **请求延迟**: 随机延迟请求，模拟人类行为
2. **用户代理轮换**: 使用不同的浏览器标识
3. **代理支持**: 支持代理服务器轮换
4. **重试策略**: 指数退避重试机制

### 调度配置

```json
{
  "taskScheduling": {
    "enabled": true,
    "autoStart": true,
    "historyRetentionDays": 30,
    "enableDependencyCheck": true,
    "enablePriorityQueue": true,
    "defaultSchedule": "0 */1 * * *"
  }
}
```

#### 调度配置项

- `enabled`: 是否启用任务调度
- `autoStart`: 是否自动启动调度器
- `historyRetentionDays`: 历史记录保留天数
- `enableDependencyCheck`: 启用任务依赖检查
- `enablePriorityQueue`: 启用优先级队列
- `defaultSchedule`: 默认调度频率

### 数据清洗配置

```json
{
  "dataCleaning": {
    "enabled": true,
    "deduplication": {
      "enabled": true,
      "similarityThreshold": 0.8
    },
    "validation": {
      "enabled": true,
      "requiredFields": ["title", "url", "platform", "publishedAt"]
    },
    "normalization": {
      "enabled": true,
      "dateFormat": "YYYY-MM-DD HH:mm:ss"
    }
  }
}
```

### 监控配置

```json
{
  "monitoring": {
    "enabled": true,
    "metrics": {
      "collection": true,
      "performance": true,
      "resources": true
    },
    "alerts": {
      "enabled": true,
      "channels": ["email", "slack"]
    }
  }
}
```

## 环境变量配置

可以通过环境变量覆盖配置文件：

```bash
# 基础配置
export LOG_LEVEL=debug
export MAX_CONCURRENT_COLLECTIONS=5

# 平台配置
export TWITTER_ENABLED=true
export YOUTUBE_ENABLED=false

# 反爬配置
export ENABLE_ANTI_CRAWLING=true
export REQUEST_MIN_DELAY=2000

# 数据路径
export COLLECTION_DATA_PATH=/data/collection
export COLLECTION_LOG_PATH=/var/log/collection
```

## 验证安装

### 步骤1: 检查服务状态

```bash
# Docker方式
docker exec everyday-news-collection node dist/src/collection/collection-service.js status

# 手动安装方式
node dist/src/collection/collection-service.js status
```

预期输出:
```
=== 数据采集服务状态 ===
框架状态: 已初始化
采集器总数: 5
...
```

### 步骤2: 测试手动采集

```bash
# 测试Twitter采集
node dist/src/collection/collection-service.js collect twitter

# 测试所有平台
node dist/src/collection/collection-service.js collect
```

### 步骤3: 检查日志

```bash
# 查看日志文件
tail -f /app/data/logs/collection.log

# 或查看控制台输出
docker-compose logs -f collection-service
```

### 步骤4: 验证数据存储

```bash
# 检查数据文件
ls -la /app/data/collection/

# 检查数据库
sqlite3 /app/data/collection/data.db "SELECT COUNT(*) FROM news_items;"
```

## 故障排除

### 常见问题

#### 1. 服务启动失败

**症状**: 容器无法启动或立即退出

**解决方案**:
```bash
# 查看详细日志
docker logs everyday-news-collection

# 检查端口冲突
netstat -tulpn | grep 9090

# 检查配置文件
docker exec everyday-news-collection cat /app/config/collection.config.json | jq .
```

#### 2. 采集失败

**症状**: 采集任务失败，日志显示网络错误

**解决方案**:
```bash
# 测试网络连接
docker exec everyday-news-collection ping -c 3 twitter.com

# 检查DNS解析
docker exec everyday-news-collection nslookup twitter.com

# 调整反爬配置
# 增加请求延迟，启用代理等
```

#### 3. 内存不足

**症状**: 服务崩溃，日志显示内存错误

**解决方案**:
```bash
# 减少并发数
export MAX_CONCURRENT_COLLECTIONS=2

# 增加内存限制（Docker）
docker update --memory 2g everyday-news-collection

# 优化配置
# 减少每次采集数量，调整缓存大小
```

#### 4. 磁盘空间不足

**症状**: 无法写入数据，日志显示磁盘错误

**解决方案**:
```bash
# 清理旧数据
docker exec everyday-news-collection find /app/data/collection -name "*.old" -delete

# 调整数据保留策略
# 减少historyRetentionDays，启用数据压缩
```

#### 5. 配置错误

**症状**: 服务启动时报配置解析错误

**解决方案**:
```bash
# 验证配置文件
node -c config/collection.config.json

# 使用默认配置
cp config/collection.config.example.json config/collection.config.json

# 检查环境变量
env | grep COLLECTION
```

### 调试技巧

#### 启用调试模式

```bash
# 设置调试环境变量
export LOG_LEVEL=debug
export NODE_ENV=development

# 重新启动服务
docker-compose restart collection-service
```

#### 查看详细日志

```bash
# 查看所有日志
docker-compose logs --tail 100 collection-service

# 过滤特定级别的日志
docker-compose logs collection-service | grep -E "(ERROR|WARN)"

# 实时监控
docker-compose logs -f --tail 50 collection-service
```

#### 性能监控

```bash
# 查看容器资源使用
docker stats everyday-news-collection

# 查看进程信息
docker exec everyday-news-collection top

# 查看网络连接
docker exec everyday-news-collection netstat -tulpn
```

### 获取帮助

如果问题无法解决，请提供以下信息：

1. **系统信息**: `uname -a`, `docker version`, `node --version`
2. **配置文件**: `config/collection.config.json`（脱敏后）
3. **错误日志**: 完整的错误日志
4. **复现步骤**: 如何重现问题的详细步骤

可以通过以下方式获取帮助：
- GitHub Issues: https://github.com/your-repo/issues
- 文档: `docs/` 目录
- 邮件支持: support@example.com

## 下一步

安装完成后，建议：

1. **阅读操作指南**: `docs/collection/OPERATION.md`
2. **配置监控**: 设置Prometheus和Grafana监控
3. **设置备份**: 配置定期数据备份
4. **性能调优**: 根据实际负载调整配置
5. **安全加固**: 配置防火墙和访问控制