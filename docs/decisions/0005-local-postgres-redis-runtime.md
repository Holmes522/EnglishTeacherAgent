# ADR-005：本地 PostgreSQL、Redis 与 BullMQ 任务链路

状态：Accepted（用户于 2026-09-11 确认推荐的本地开发方案；不代表生产部署批准）

## 决策

- Docker Compose 启动 PostgreSQL 17 与 Redis 7，固定补丁版本，端口只绑定 127.0.0.1，数据存入命名卷。
- 使用 node-postgres 参数化 SQL。同一个数据库事务写入任务、条目、初始事件和 outbox。
- PostgreSQL 是事实来源；Redis/BullMQ 仅传递 item ID。发布确认丢失时可重发，最终结果由数据库租约 token 保证只提交一次。
- 每次尝试记录在 processing_attempts；Worker 每 8 秒续期，租约 30 秒，单项处理超时 20 秒。取消立即终结未完成项，迟到结果不能覆盖它。
- 匿名 HttpOnly Cookie 使用 256 位随机值；数据库只存 SHA-256 哈希。首次提交前先建立会话，避免首个 POST 响应丢失导致会话和幂等键一起丢失。
- 幂等键按会话范围原子认领；同键不同请求返回 422。重试产生关联的新 run，只包含可重试失败项，历史数据保持不变。
- SSE 事件在持有 run 行锁的事务内分配逐 run 单调编号，支持 Last-Event-ID；GET 获取最终状态。服务端最长保持连接 25 秒，客户端自动重连并通过 GET 补读。
- 本地 fixture 模式必须显式启用。默认处理器返回 NOT_ENABLED；fixture 只提供带明确提示的演示结果。

## 取舍

当前最多 20 个 item，因此单个 run 行锁用于串行化状态写入；业务计算仍可并发 4 项。JSONB 保存版本化条目/结果，避免首次纵向切片就引入 ORM 和多表结果映射。

匿名任务默认保留 7 天，Worker 定期删除到期任务及级联关联记录。该默认仅用于本地验证，生产保留策略、数据库备份、TLS、限流、部署区域和真实供应商仍需独立落实。

## 官方依据

- [node-postgres 事务与单连接要求](https://node-postgres.com/features/transactions)
- [BullMQ 连接设置](https://docs.bullmq.io/guide/connections)
- [BullMQ 幂等任务](https://docs.bullmq.io/patterns/idempotent-jobs)
- [Docker Compose 健康检查与启动顺序](https://docs.docker.com/compose/how-tos/startup-order/)
