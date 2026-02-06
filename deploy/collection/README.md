# 数据采集模块部署指南

## 概述

本文档介绍如何部署数据采集模块。数据采集模块负责从多个社交平台（Twitter、YouTube、TikTok、微博、抖音）采集新闻内容。

## 部署方式

### 1. 使用Docker Compose（推荐）

#### 快速开始

```bash
# 进入部署目录
cd deploy/collection

# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f collection-service
```

#### 服务说明

- **collection-service**: 数据采集主服务
- **collection-monitor**: Prometheus监控服务（端口: 9091）
- **collection-logs**: Loki日志收集服务（端口: 3100）
- **collection-grafana**: Grafana可视化面板（端口: 3001，用户名: admin，密码: admin）

### 2. 使用部署脚本

```bash
# 授予执行权限
chmod +x deploy/collection/deploy.sh

# 查看帮助
./deploy/collection/deploy.sh help

# 构建Docker镜像
./deploy/collection/deploy.sh build

# 运行部署测试
./deploy/collection/deploy.sh test

# 部署到本地环境
./deploy/collection/deploy.sh deploy

# 清理构建产物
./deploy/collection/deploy.sh clean
```

### 3. 手动部署

#### 构建Docker镜像

```bash
docker build \
  -f deploy/collection/Dockerfile.collection \
  -t everyday-news-collection:latest \
  .
```

#### 运行容器

```bash
docker run -d \
  --name everyday-news-collection \
  -p 9090:9090 \
  -v collection_data:/app/data/collection \
  -v collection_logs:/app/data/logs \
  -v collection_backups:/app/data/backups \
  -e LOG_LEVEL=info \
  -e MAX_CONCURRENT_COLLECTIONS=3 \
  everyday-news-collection:latest
```

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NODE_ENV` | `production` | 运行环境 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `MAX_CONCURRENT_COLLECTIONS` | `3` | 最大并发采集数 |
| `ENABLE_ANTI_CRAWLING` | `true` | 启用反爬系统 |
| `ENABLE_DATA_CLEANING` | `true` | 启用数据清洗 |
| `COLLECTION_DATA_PATH` | `/app/data/collection` | 数据存储路径 |
| `COLLECTION_LOG_PATH` | `/app/data/logs` | 日志存储路径 |
| `COLLECTION_BACKUP_PATH` | `/app/data/backups` | 备份存储路径 |
| `TWITTER_ENABLED` | `true` | 启用Twitter采集 |
| `YOUTUBE_ENABLED` | `true` | 启用YouTube采集 |
| `TIKTOK_ENABLED` | `true` | 启用TikTok采集 |
| `WEIBO_ENABLED` | `true` | 启用微博采集 |
| `DOUYIN_ENABLED` | `true` | 启用抖音采集 |

### 配置文件

配置文件位于 `config/` 目录：

- `collection.config.json`: 主配置文件
- `collection.config.dev.json`: 开发环境配置
- `collection.config.test.json`: 测试环境配置

## 监控和日志

### 监控指标

数据采集服务暴露以下监控指标：

- `collection_total`: 总采集次数
- `collection_success_total`: 成功采集次数
- `collection_failed_total`: 失败采集次数
- `collection_duration_seconds`: 采集耗时
- `collection_items_total`: 采集到的项目数
- `memory_usage_bytes`: 内存使用量
- `cpu_usage_percent`: CPU使用率

### 日志查看

```bash
# 查看实时日志
docker-compose logs -f collection-service

# 查看特定时间段的日志
docker-compose logs --since 1h collection-service

# 导出日志到文件
docker-compose logs collection-service > collection.log
```

## 运维操作

### 服务管理

```bash
# 启动服务
docker-compose start collection-service

# 停止服务
docker-compose stop collection-service

# 重启服务
docker-compose restart collection-service

# 查看服务状态
docker-compose ps collection-service
```

### 数据备份

```bash
# 备份数据
docker exec everyday-news-collection node -e "require('./dist/src/collection/backup-manager.js').backup()"

# 列出备份
docker exec everyday-news-collection ls -la /app/data/backups/

# 恢复备份
docker exec everyday-news-collection node -e "require('./dist/src/collection/backup-manager.js').restore('backup-20240101.tar.gz')"
```

### 手动采集

```bash
# 执行手动采集
docker exec everyday-news-collection node dist/src/collection/collection-service.js collect twitter,youtube

# 查看服务状态
docker exec everyday-news-collection node dist/src/collection/collection-service.js status
```

## 故障排除

### 常见问题

1. **容器启动失败**
   - 检查端口冲突：`netstat -tulpn | grep 9090`
   - 检查Docker日志：`docker logs everyday-news-collection`

2. **采集失败**
   - 检查网络连接：`docker exec everyday-news-collection ping -c 3 twitter.com`
   - 检查配置：`docker exec everyday-news-collection cat /app/config/collection.config.json`

3. **磁盘空间不足**
   - 清理旧数据：`docker exec everyday-news-collection rm -rf /app/data/collection/*.old`
   - 扩展磁盘空间

### 调试模式

```bash
# 以调试模式运行
docker run -it --rm \
  -e LOG_LEVEL=debug \
  -e NODE_ENV=development \
  everyday-news-collection:latest \
  node dist/src/collection/collection-service.js collect twitter
```

## 安全建议

1. **使用非root用户运行容器**
2. **定期更新基础镜像**
3. **配置适当的资源限制**
4. **启用日志轮转**
5. **定期备份数据**
6. **监控系统资源使用情况**

## 性能优化

1. **调整并发数**: 根据服务器配置调整 `MAX_CONCURRENT_COLLECTIONS`
2. **优化内存**: 调整JVM参数（如果使用Java组件）
3. **使用SSD**: 数据目录使用SSD存储提高IO性能
4. **网络优化**: 确保良好的网络连接质量

## 联系支持

如有问题，请查看：
- 项目文档: `docs/`
- 问题跟踪: [GitHub Issues](https://github.com/your-repo/issues)
- 邮件支持: support@example.com