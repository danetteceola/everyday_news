#!/bin/bash
# 每日热点新闻聚合系统 - 生产环境部署脚本
#
# 使用方法:
#   ./scripts/deploy.sh [环境] [操作]
#
# 环境:
#   prod    - 生产环境 (默认)
#   staging - 预发布环境
#   dev     - 开发环境
#
# 操作:
#   up      - 启动服务 (默认)
#   down    - 停止服务
#   restart - 重启服务
#   logs    - 查看日志
#   status  - 查看状态
#   build   - 重新构建镜像
#
# 示例:
#   ./scripts/deploy.sh prod up
#   ./scripts/deploy.sh staging logs
#   ./scripts/deploy.sh prod down

set -euo pipefail

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 默认参数
ENV="${1:-prod}"
ACTION="${2:-up}"

# 环境配置文件
ENV_FILE="$PROJECT_ROOT/.env.$ENV"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

# 检查环境配置文件
check_env_file() {
    if [[ ! -f "$ENV_FILE" ]]; then
        log_warn "环境配置文件 $ENV_FILE 不存在"
        log_info "正在从模板创建..."
        cp "$PROJECT_ROOT/.env.example" "$ENV_FILE"
        log_info "请编辑 $ENV_FILE 配置环境变量"
        exit 1
    fi
}

# 检查Docker Compose
check_docker_compose() {
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose未安装"
        exit 1
    fi

    # 设置compose命令
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi
}

# 检查Docker
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装"
        exit 1
    fi
}

# 部署操作
deploy_up() {
    log_info "启动 $ENV 环境服务..."
    $COMPOSE_CMD --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
    log_info "服务已启动"

    # 显示服务状态
    sleep 2
    deploy_status
}

deploy_down() {
    log_info "停止 $ENV 环境服务..."
    $COMPOSE_CMD --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down
    log_info "服务已停止"
}

deploy_restart() {
    log_info "重启 $ENV 环境服务..."
    $COMPOSE_CMD --env-file "$ENV_FILE" -f "$COMPOSE_FILE" restart
    log_info "服务已重启"
}

deploy_logs() {
    log_info "查看 $ENV 环境日志..."
    $COMPOSE_CMD --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs -f --tail=100
}

deploy_status() {
    log_info "$ENV 环境服务状态:"
    echo "========================"
    $COMPOSE_CMD --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
    echo "========================"

    # 检查健康状态
    log_info "检查服务健康状态..."
    for service in app adminer backup monitoring; do
        if $COMPOSE_CMD --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q $service &> /dev/null; then
            container_id=$($COMPOSE_CMD --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q $service)
            health=$(docker inspect --format='{{.State.Health.Status}}' "$container_id" 2>/dev/null || echo "N/A")
            log_info "  $service: $health"
        fi
    done
}

deploy_build() {
    log_info "重新构建 $ENV 环境镜像..."
    $COMPOSE_CMD --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build --no-cache
    log_info "镜像构建完成"
}

deploy_help() {
    echo "每日热点新闻聚合系统 - 部署脚本"
    echo ""
    echo "用法: $0 [环境] [操作]"
    echo ""
    echo "环境:"
    echo "  prod    生产环境 (默认)"
    echo "  staging 预发布环境"
    echo "  dev     开发环境"
    echo ""
    echo "操作:"
    echo "  up      启动服务 (默认)"
    echo "  down    停止服务"
    echo "  restart 重启服务"
    echo "  logs    查看日志"
    echo "  status  查看状态"
    echo "  build   重新构建镜像"
    echo "  help    显示帮助"
    echo ""
    echo "示例:"
    echo "  $0 prod up"
    echo "  $0 staging logs"
    echo "  $0 prod down"
}

# 主函数
main() {
    # 检查依赖
    check_docker
    check_docker_compose

    # 执行操作
    case "$ACTION" in
        up)
            check_env_file
            deploy_up
            ;;
        down)
            check_env_file
            deploy_down
            ;;
        restart)
            check_env_file
            deploy_restart
            ;;
        logs)
            check_env_file
            deploy_logs
            ;;
        status)
            check_env_file
            deploy_status
            ;;
        build)
            check_env_file
            deploy_build
            ;;
        help|--help|-h)
            deploy_help
            ;;
        *)
            log_error "未知操作: $ACTION"
            deploy_help
            exit 1
            ;;
    esac
}

# 运行主函数
main