# 每日热点新闻聚合系统 - Docker镜像
# 使用多阶段构建优化镜像大小

# 阶段1: 构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制包管理文件
COPY package*.json ./
COPY tsconfig.json ./

# 安装依赖（包括开发依赖）
RUN npm ci --only=production

# 复制源代码
COPY src ./src
COPY config ./config
COPY docs ./docs

# 构建TypeScript
RUN npm run build

# 阶段2: 生产阶段
FROM node:18-alpine

# 安装运行时依赖
RUN apk add --no-cache sqlite

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# 设置工作目录
WORKDIR /app

# 从构建阶段复制文件
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/config ./config
COPY --from=builder --chown=nodejs:nodejs /app/docs ./docs

# 创建数据目录并设置权限
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app/data

# 切换到非root用户
USER nodejs

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if(r.statusCode===200)process.exit(0);process.exit(1)}).on('error',()=>process.exit(1))"

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production \
    DATABASE_PATH=/app/data/everyday_news.db \
    BACKUP_PATH=/app/data/backups \
    LOG_LEVEL=info

# 启动命令
CMD ["node", "dist/index.js"]