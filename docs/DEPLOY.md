# 部署指南

本文说明如何将本 CMS（基于 Pages CMS 的自托管版本）部署到本地或服务器。

## 系统要求

- **Node.js** 20+（建议 LTS）
- **PostgreSQL** 16+（推荐）
- 可选：**GitHub App**（对接远程仓库时需要）
- 可选：反向代理 / HTTPS（生产环境强烈建议）

## 一、环境变量

复制示例文件：

```bash
cp .env.local.example .env.local
```

**生产 / 自托管最少只需两项：**

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串，例如 `postgresql://user:pass@host:5432/pagescms` |
| `CRYPTO_KEY` | 用于加密 DB 内密钥的主密钥；丢失则无法解密已存密钥 |

生成 `CRYPTO_KEY`：

```bash
openssl rand -base64 32
```

站点地址、GitHub App、邮件、管理员邮箱等**不要写进 env**，在首次打开 `/setup` 向导中配置，并加密存入数据库。之后可在 **设置 → 部署配置** 修改。

### 可选：本地磁盘仓库模式

| 变量 | 说明 |
|------|------|
| `LOCAL_REPO_MODE=true` | 启用本地文件夹作为仓库 |
| `LOCAL_REPO_PATH` | 本地项目绝对路径（也可在 UI 中选择） |
| `LOCAL_REPO_OWNER` / `LOCAL_REPO_NAME` / `LOCAL_REPO_BRANCH` | URL 中的合成仓库标识（默认 `local` / `hugo-blog` / `main`） |
| `LOCAL_DEV_BYPASS_AUTH=true` | **仅开发**跳过登录；生产环境无效 |
| `LOCAL_REPO_ALLOW_ANY_USER` | 非管理员也可访问本地仓（默认关） |
| `LOCAL_REPO_ALLOW_ANY_USER_IN_PRODUCTION` | 生产环境额外确认上述放行 |
| `LOCAL_REPO_ALLOWED_ROOTS` | 可选；设置后工作区必须落在这些根目录下，未设则不限制路径 |

## 二、数据库

### Docker 快速起库

```bash
docker run --name pagescms-db \
  -e POSTGRES_USER=pagescms \
  -e POSTGRES_PASSWORD=pagescms \
  -e POSTGRES_DB=pagescms \
  -p 5432:5432 -d postgres:16
```

### 迁移

```bash
npm install
npm run db:migrate
```

`npm run build` 后的 `postbuild` 也会自动执行迁移。

缓存异常时可清空：

```bash
npm run db:clear-cache
```

若需**从零重测初始化**（清空用户、会话、配置、缓存等业务表，保留表结构）：

```bash
npm run db:migrate
node --env-file=.env.local scripts/reset-local-data.mjs
```

仅清空 `app_config` 一行时可用：

```bash
node --env-file=.env.local scripts/reset-app-config.mjs
```

注意：`.env.local` 中若开启 `LOCAL_DEV_BYPASS_AUTH=true`，开发环境会跳过 `/setup`；从零测试请设为 `false`。

## 三、本地开发

```bash
npm install
npm run db:migrate
npm run dev
```

浏览器打开：http://localhost:3000  

首次访问会进入 `/setup`：创建管理员 → 填写站点 URL →（可选）配置 GitHub App / 邮件。

创建 GitHub App 可用助手（会打开浏览器引导）：

```bash
npm run setup:github-app -- --base-url http://localhost:3000
```

本地调试 Webhook 时，把 `--base-url` 换成公网隧道地址。

## 四、生产构建与运行

```bash
npm install
npm run build
npm run start
```

默认监听 `3000`。可用环境变量：

```bash
PORT=3000 HOSTNAME=0.0.0.0 npm run start
```

### 反向代理建议

- 终结 HTTPS（Nginx / Caddy / Cloudflare）
- 将 `X-Forwarded-*` 正确传给 Node
- `/setup` 中填写的**站点地址**必须与对外访问 URL 一致（含协议与域名），否则 OAuth / Cookie 会异常
- 不要把同一套安装同时绑「自定义域名」和「平台临时域名」混用

### 安全注意

1. **务必**在公网暴露前完成 `/setup`，避免被抢注管理员。
2. `CRYPTO_KEY`、`DATABASE_URL` 仅放在服务器环境或密钥管理，勿提交仓库。
3. 生产勿开启 `LOCAL_DEV_BYPASS_AUTH`。
4. `LOCAL_REPO_ALLOW_ANY_USER` 仅适合单用户主机；生产还需显式 `LOCAL_REPO_ALLOW_ANY_USER_IN_PRODUCTION=true`。
5. 工作区默认可选任意可写目录；若需收紧，再配置 `LOCAL_REPO_ALLOWED_ROOTS`。

## 五、部署形态参考

### 单机 Node

适合 VPS：Postgres + `npm run build && npm run start` + systemd / pm2。

### Docker Compose（示意）

自行编写即可，核心是：

- Postgres 服务
- App 服务挂载 `.env`，执行 `npm run build && npm run start`
- 持久化 Postgres volume；本地仓模式需挂载博客目录

### Vercel / 类似平台

本仓库含 `.vercelignore`。平台部署时：

- 配置 `DATABASE_URL`、`CRYPTO_KEY`
- 确保平台提供的 Postgres 可达
- 在 `/setup` 填写平台分配的 HTTPS 站点 URL
- 配置 GitHub App 的 Callback / Webhook 指向该 URL

## 六、升级

1. 拉取新代码，`npm install`
2. `npm run db:migrate`（或 `npm run build`）
3. 重启 `npm run start`
4. 如遇配置缓存异常，再执行 `npm run db:clear-cache`

## 七、故障排查

| 现象 | 处理 |
|------|------|
| 无法登录 / OAuth 回调错误 | 检查 `/setup` 中站点 URL 是否与访问域名一致 |
| 提示未配置 CRYPTO_KEY | 补齐 `.env` 中 `CRYPTO_KEY` 并重启 |
| 数据库连接失败 | 检查 `DATABASE_URL`、防火墙、Postgres 是否监听 |
| 本地仓打不开 | 确认 `LOCAL_REPO_MODE`、路径存在且可写，且在允许根目录内 |
| 初始化已完成仍进 setup | 检查 `app_config.setup_complete`；勿随意执行 reset 脚本 |

更多使用说明见 [USAGE.md](./USAGE.md)。
