# 提问箱 - Neon PostgreSQL 部署指南

## 环境变量配置

部署前需要在 Railway 和 Render 都设置这个环境变量：

```
DATABASE_URL=postgresql://neondb_owner:npg_3fEQDpirok6T@ep-raspy-boat-aoka9cal-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

**注意**：用 Pooler host（带 `-pooler` 的地址），连接更稳定。

---

## Railway 部署步骤

1. 进入 Railway Dashboard → 你的项目 → Variables
2. 添加 `DATABASE_URL`，值用上面的连接字符串
3. 重新部署

---

## Render 部署步骤

1. 进入 Render Dashboard → 你的 Web Service → Environment
2. 添加 `DATABASE_URL`，值用上面的连接字符串
3. 手动重新部署（Clear Build Cache & Deploy）

---

## 验证数据同步

1. 在 Railway 的提问箱提一个问题
2. 去 Render 的提问箱刷新，应该能看到同一个问题
3. 两边数据实时同步

---

## 注意事项

- 图片上传还是存在各自平台的本地磁盘上（背景图等），不共享
- 如果需要图片也共享，需要接云存储（Cloudinary/AWS S3等）
- Neon 免费版有 500MB 存储，提问箱数据很小，够用很久
