# 本地异步任务演示

需要 Node.js 24、pnpm 11、已启动的 Docker Desktop（Linux containers）。在仓库根目录执行：

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm infra:up
pnpm build:packages
pnpm db:migrate
pnpm dev
```

已有 `.env` 时请手动合并缺失字段，避免覆盖本地凭据。Web 和 Worker 都从仓库根目录 `.env` 加载设置。打开 http://localhost:3000 。

1. 保持 `PROCESSOR_MODE=fixture`，提交 `hello` 和一句英语，观察逐项完成。
2. 提交两行 `hello` / `fixture:fail`，可验证部分完成和“重试失败项目”。这个固定标记在每次尝试都会产生演示失败。
3. 关闭 Worker 后提交任务，任务留在数据库/outbox；重新启动 Worker 后继续处理。
4. Worker 未运行时提交任务并取消，重启 Worker 后任务应保持取消。
5. 刷新带 `?run=...` 的页面，可恢复当前会话中的任务；其他浏览器会话不能读取它。

真实词典和模型尚未接入；演示内容不能用于评估英语教学质量。

## 自动化验证

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

`pnpm test` 不依赖容器。`pnpm test:integration` 必须连接真实 PostgreSQL/Redis，缺少依赖时会失败；不会静默跳过。每组测试创建随机 PostgreSQL schema 和 UUID 队列，结束后只删除这些测试资源，不清空应用数据或应用队列。应用 Worker 可同时运行。可使用 `TEST_DATABASE_URL` / `TEST_REDIS_URL` 指向独立测试实例；测试数据库用户需拥有创建 schema 的权限。

生产构建运行：分别执行 `pnpm --filter @english-teacher/web start` 与 `pnpm --filter @english-teacher/worker start`。

## 数据与停止

`pnpm infra:down` 停止项目容器并保留命名卷，再次 `pnpm infra:up` 可恢复数据。不要在需要保留任务时执行 `docker compose down -v`。本地示例凭据仅供开发使用，数据库与 Redis 端口只绑定本机回环地址。

迁移通过 PostgreSQL 事务和 advisory lock 串行执行，并在 schema_migrations 中记录版本；重复执行无副作用。应用回滚保留数据库表，后续 schema 变更使用向前兼容迁移。

## 排障

- Docker 引擎不可用：先确认 Docker Desktop 显示 Running，再执行 `docker info`。
- socket 启动错误：本次开发遇到 `sailor-ingest.sock` 和 `docker-secrets-engine/engine.sock` 残留导致启动失败。停止 Docker Desktop 及其后端后，将本机 `AppData/Local/Docker/run` 和 `AppData/Local/docker-secrets-engine` 两个运行时目录重命名备份，再启动 Docker 后恢复。仅在日志确认同类错误时检查这两个目录，勿删除 Docker 数据目录或命名卷；本次备份保留在原目录旁。
- 数据库认证错误：核对 `.env` 与 Compose 凭据；已有命名卷不会因环境变量改变而自动修改数据库密码。
- 任务长期排队：确认 Worker 正在运行、迁移已执行、数据库和 Redis 健康；日志中的 `outbox.tick_failed` / `worker.connection_error` 不包含原始文本或连接凭据。
- SSE 被反向代理缓冲：禁用 SSE 路由缓冲，保留 `text/event-stream`、`Cache-Control: no-store, no-transform` 和 `X-Accel-Buffering: no`。
- HSTS 与严格 nonce CSP 需随实际 HTTPS 部署配置；当前沿用 Next.js 静态兼容 CSP，包含 `unsafe-inline`，不可当作严格 XSS 防线。
