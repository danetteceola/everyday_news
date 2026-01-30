#!/bin/bash
# 每日热点新闻聚合系统 - 开发环境设置脚本
#
# 这个脚本用于设置开发环境，包括:
# 1. 安装Node.js依赖
# 2. 设置数据库
# 3. 配置环境变量
# 4. 初始化数据
# 5. 启动开发服务器

set -euo pipefail

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查Node.js
check_nodejs() {
    log_step "检查Node.js安装..."
    if ! command -v node &> /dev/null; then
        log_error "Node.js未安装"
        log_info "请从 https://nodejs.org/ 安装Node.js 18或更高版本"
        exit 1
    fi

    NODE_VERSION=$(node --version | cut -d'v' -f2)
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)

    if [[ $NODE_MAJOR -lt 18 ]]; then
        log_error "Node.js版本过低 (当前: v$NODE_VERSION, 需要: v18+)"
        exit 1
    fi

    log_info "Node.js版本: v$NODE_VERSION"
}

# 检查npm
check_npm() {
    log_step "检查npm安装..."
    if ! command -v npm &> /dev/null; then
        log_error "npm未安装"
        exit 1
    fi

    NPM_VERSION=$(npm --version)
    log_info "npm版本: $NPM_VERSION"
}

# 安装依赖
install_dependencies() {
    log_step "安装项目依赖..."

    # 检查是否使用淘宝镜像
    if npm config get registry | grep -q "taobao"; then
        log_info "检测到淘宝镜像，使用npm install"
        npm install
    else
        log_info "使用npm ci安装依赖..."
        npm ci
    fi

    log_info "依赖安装完成"
}

# 设置环境变量
setup_environment() {
    log_step "设置环境变量..."

    local env_file="$PROJECT_ROOT/.env"
    local env_example="$PROJECT_ROOT/.env.example"

    if [[ ! -f "$env_file" ]]; then
        log_info "创建环境变量文件: $env_file"
        cp "$env_example" "$env_file"

        # 添加系统架构模块特定的环境变量
        cat >> "$env_file" << 'EOF'

# 系统架构模块配置
# 调度器配置
SCHEDULER_MAX_CONCURRENT_TASKS=5
SCHEDULER_TASK_TIMEOUT=300000

# 通知系统配置
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID:-}
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}

# 监控配置
MONITORING_COLLECTION_INTERVAL=60000
MONITORING_ALERT_THRESHOLD_COLLECTION_SUCCESS=80
MONITORING_ALERT_THRESHOLD_DATA_COMPLETENESS=90

# LLM配置
LLM_MODEL=claude-3-5-sonnet-20241022
LLM_TEMPERATURE=0.7
LLM_API_KEY=${LLM_API_KEY:-}
EOF

        log_info "请编辑 $env_file 文件配置您的环境变量"
    else
        log_info "环境变量文件已存在: $env_file"
    fi
}

# 初始化数据库
setup_database() {
    log_step "初始化数据库..."

    # 创建数据目录
    mkdir -p "$PROJECT_ROOT/data"
    mkdir -p "$PROJECT_ROOT/data/backups"

    # 检查数据库文件是否存在
    local db_file="$PROJECT_ROOT/data/everyday_news.db"

    if [[ ! -f "$db_file" ]]; then
        log_info "初始化数据库..."
        npm run db:init

        if [[ $? -eq 0 ]]; then
            log_info "数据库初始化成功"
        else
            log_warn "数据库初始化失败，可能需要手动检查"
        fi
    else
        log_info "数据库文件已存在: $db_file"

        # 检查数据库状态
        log_info "检查数据库状态..."
        npm run db:status
    fi
}

# 构建项目
build_project() {
    log_step "构建项目..."

    npm run build

    if [[ $? -eq 0 ]]; then
        log_info "项目构建成功"
    else
        log_error "项目构建失败"
        exit 1
    fi
}

# 运行测试
run_tests() {
    log_step "运行测试..."

    local test_result
    test_result=$(npm test 2>&1) || true

    if echo "$test_result" | grep -q "Test Suites:.*passed"; then
        log_info "测试通过"
    else
        log_warn "测试未通过或部分失败"
        echo "$test_result" | tail -20
    fi
}

# 显示完成信息
show_completion() {
    log_step "开发环境设置完成!"
    echo ""
    echo "🎉 恭喜！每日热点新闻聚合系统开发环境已设置完成。"
    echo ""
    echo "下一步操作:"
    echo "1. 编辑环境变量文件:"
    echo "   $PROJECT_ROOT/.env"
    echo ""
    echo "2. 启动开发服务器:"
    echo "   npm run dev"
    echo ""
    echo "3. 或者启动Docker开发环境:"
    echo "   ./scripts/deploy.sh dev up"
    echo ""
    echo "4. 查看API文档:"
    echo "   访问 http://localhost:3000/docs (启动后)"
    echo ""
    echo "系统架构模块已集成以下功能:"
    echo "  ✓ 任务调度器 (支持cron表达式)"
    echo "  ✓ 错误处理 (自动重试和优雅降级)"
    echo "  ✓ 监控指标 (成功率、完整性、性能)"
    echo "  ✓ 通知系统 (Telegram、Email、Webhook)"
    echo "  ✓ Claude Code Router集成"
    echo "  ✓ 配置管理系统"
}

# 主函数
main() {
    echo "========================================"
    echo "  每日热点新闻聚合系统 - 开发环境设置"
    echo "========================================"
    echo ""

    # 检查依赖
    check_nodejs
    check_npm

    # 设置环境
    install_dependencies
    setup_environment
    setup_database
    build_project
    run_tests

    # 完成
    show_completion
}

# 运行主函数
main