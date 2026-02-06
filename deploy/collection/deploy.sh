#!/bin/bash

# 数据采集模块部署脚本
# 用于构建和部署数据采集服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 显示帮助信息
show_help() {
    echo "数据采集模块部署脚本"
    echo ""
    echo "用法: $0 [命令]"
    echo ""
    echo "命令:"
    echo "  build          构建Docker镜像"
    echo "  push [tag]     推送Docker镜像到仓库（可选标签）"
    echo "  deploy         部署到本地环境"
    echo "  test           运行部署测试"
    echo "  clean          清理构建产物"
    echo "  help           显示此帮助信息"
    echo ""
    echo "环境变量:"
    echo "  DOCKER_REGISTRY  Docker镜像仓库地址（默认: localhost:5000）"
    echo "  IMAGE_NAME       Docker镜像名称（默认: everyday-news-collection）"
    echo "  BUILD_TAG        构建标签（默认: latest）"
    echo ""
}

# 检查依赖
check_dependencies() {
    log_info "检查依赖..."

    # 检查Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker未安装"
        exit 1
    fi

    # 检查Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_warn "Docker Compose未安装，将使用docker-compose-plugin"
        if ! docker compose version &> /dev/null; then
            log_error "Docker Compose未安装"
            exit 1
        fi
    fi

    # 检查Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js未安装"
        exit 1
    fi

    log_info "所有依赖检查通过"
}

# 构建Docker镜像
build_image() {
    log_info "开始构建Docker镜像..."

    # 设置默认值
    local registry="${DOCKER_REGISTRY:-localhost:5000}"
    local image_name="${IMAGE_NAME:-everyday-news-collection}"
    local tag="${BUILD_TAG:-latest}"
    local full_image_name="${registry}/${image_name}:${tag}"

    log_info "构建镜像: ${full_image_name}"

    # 构建镜像
    docker build \
        -f deploy/collection/Dockerfile.collection \
        -t "${full_image_name}" \
        .

    if [ $? -eq 0 ]; then
        log_info "Docker镜像构建成功: ${full_image_name}"

        # 同时打上latest标签
        if [ "$tag" != "latest" ]; then
            docker tag "${full_image_name}" "${registry}/${image_name}:latest"
            log_info "同时标记为latest标签"
        fi
    else
        log_error "Docker镜像构建失败"
        exit 1
    fi
}

# 推送Docker镜像
push_image() {
    local tag="${1:-${BUILD_TAG:-latest}}"
    local registry="${DOCKER_REGISTRY:-localhost:5000}"
    local image_name="${IMAGE_NAME:-everyday-news-collection}"
    local full_image_name="${registry}/${image_name}:${tag}"

    log_info "推送镜像到仓库: ${full_image_name}"

    # 检查镜像是否存在
    if ! docker image inspect "${full_image_name}" &> /dev/null; then
        log_error "镜像不存在，请先执行构建: $0 build"
        exit 1
    fi

    # 推送镜像
    docker push "${full_image_name}"

    if [ $? -eq 0 ]; then
        log_info "镜像推送成功: ${full_image_name}"

        # 如果推送的不是latest，也推送latest
        if [ "$tag" != "latest" ]; then
            docker push "${registry}/${image_name}:latest"
            log_info "latest标签也推送成功"
        fi
    else
        log_error "镜像推送失败"
        exit 1
    fi
}

# 部署到本地环境
deploy_local() {
    log_info "开始部署到本地环境..."

    # 检查Docker Compose文件
    if [ ! -f "deploy/collection/docker-compose.yml" ]; then
        log_error "Docker Compose配置文件不存在: deploy/collection/docker-compose.yml"
        exit 1
    fi

    # 停止并删除旧容器
    log_info "停止旧容器..."
    docker-compose -f deploy/collection/docker-compose.yml down || true

    # 启动新容器
    log_info "启动新容器..."
    docker-compose -f deploy/collection/docker-compose.yml up -d

    if [ $? -eq 0 ]; then
        log_info "部署成功"
        log_info "容器状态:"
        docker-compose -f deploy/collection/docker-compose.yml ps

        log_info "查看日志: docker-compose -f deploy/collection/docker-compose.yml logs -f"
    else
        log_error "部署失败"
        exit 1
    fi
}

# 运行部署测试
run_tests() {
    log_info "运行部署测试..."

    # 测试1: 构建测试
    log_info "测试1: 构建测试..."
    if docker build \
        -f deploy/collection/Dockerfile.collection \
        -t everyday-news-collection-test \
        . &> /tmp/build-test.log; then
        log_info "构建测试通过"
    else
        log_error "构建测试失败"
        cat /tmp/build-test.log
        exit 1
    fi

    # 测试2: 运行测试容器
    log_info "测试2: 运行测试容器..."
    docker run --rm \
        --name collection-test \
        everyday-news-collection-test \
        node -e "console.log('Node.js运行正常')" &> /tmp/run-test.log

    if [ $? -eq 0 ]; then
        log_info "运行测试通过"
    else
        log_error "运行测试失败"
        cat /tmp/run-test.log
        exit 1
    fi

    # 测试3: 健康检查测试
    log_info "测试3: 健康检查测试..."
    if docker run --rm \
        --name collection-health-test \
        everyday-news-collection-test \
        node -e "const fs = require('fs'); const path = '/tmp/health_check.txt'; fs.writeFileSync(path, Date.now().toString()); fs.unlinkSync(path); console.log('文件系统访问正常')" &> /tmp/health-test.log; then
        log_info "健康检查测试通过"
    else
        log_error "健康检查测试失败"
        cat /tmp/health-test.log
        exit 1
    fi

    # 清理测试镜像
    log_info "清理测试镜像..."
    docker rmi everyday-news-collection-test || true

    log_info "所有部署测试通过"
}

# 清理构建产物
cleanup() {
    log_info "开始清理构建产物..."

    # 删除Docker镜像
    local registry="${DOCKER_REGISTRY:-localhost:5000}"
    local image_name="${IMAGE_NAME:-everyday-news-collection}"

    log_info "删除本地Docker镜像..."
    docker rmi "${registry}/${image_name}:latest" 2>/dev/null || true
    docker rmi "${registry}/${image_name}:${BUILD_TAG:-latest}" 2>/dev/null || true

    # 删除dist目录
    log_info "清理构建目录..."
    rm -rf dist

    # 停止并删除容器
    log_info "停止并删除测试容器..."
    docker-compose -f deploy/collection/docker-compose.yml down 2>/dev/null || true

    log_info "清理完成"
}

# 主函数
main() {
    local command="${1:-help}"

    case "$command" in
        build)
            check_dependencies
            build_image
            ;;
        push)
            check_dependencies
            push_image "$2"
            ;;
        deploy)
            check_dependencies
            build_image
            deploy_local
            ;;
        test)
            check_dependencies
            run_tests
            ;;
        clean)
            cleanup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $command"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"