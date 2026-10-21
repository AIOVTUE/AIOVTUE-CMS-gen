# AIOVTUE CMS

基于 [Pages CMS](https://pagescms.org) 的自托管内容管理系统，面向 Hugo 等静态站点与 GitHub / 本地磁盘仓库。界面以简体中文为主，支持暂存发布、菜单配置、本地项目挂载等能力。

## 文档

| 文档 | 内容 |
|------|------|
| [docs/DEPLOY.md](./docs/DEPLOY.md) | 环境变量、数据库、本地开发、生产部署与排错 |
| [docs/USAGE.md](./docs/USAGE.md) | 登录、编辑内容、媒体、菜单、外观与协作 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 贡献约定 |
| [fields/custom/README.md](./fields/custom/README.md) | 自定义字段 |

上游通用文档也可参考：[pagescms.org/docs](https://pagescms.org/docs)。

## 快速开始

**依赖：** Node.js 20+、PostgreSQL 16+

```bash
# 1. 安装依赖
npm install

# 2. 环境变量（仅需这两项；其余在 /setup 配置）
cp .env.local.example .env.local
# 编辑 DATABASE_URL、CRYPTO_KEY

# 3. 数据库（示例）
docker run --name pagescms-db \
  -e POSTGRES_USER=pagescms \
  -e POSTGRES_PASSWORD=pagescms \
  -e POSTGRES_DB=pagescms \
  -p 5432:5432 -d postgres:16

npm run db:migrate

# 4. 开发
npm run dev
```

打开 http://localhost:3000 ，按向导完成 `/setup`。

生产：

```bash
npm run build
npm run start
```

详细步骤与安全注意见 [部署指南](./docs/DEPLOY.md)。日常编辑见 [使用说明](./docs/USAGE.md)。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建（含迁移） |
| `npm run start` | 生产启动 |
| `npm run lint` | ESLint |
| `npm run db:migrate` | 执行数据库迁移 |
| `npm run db:clear-cache` | 清空文件缓存 |
| `npm run setup:github-app` | 交互创建 GitHub App |

## 本地仓库模式（可选）

在 `.env.local` 中设置：

```bash
LOCAL_REPO_MODE=true
# LOCAL_REPO_PATH=D:/path/to/your-hugo-site
```

详见 [DEPLOY.md](./docs/DEPLOY.md) 中的可选变量说明。

## 许可

[MIT License](LICENSE)。上游 Pages CMS 版权归原作者所有；本仓库为衍生自托管版本。
