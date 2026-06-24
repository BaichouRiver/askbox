# 提问箱 v2.0 — 全栈版

一个完整的匿名提问箱 Web 应用，支持部署到公网让别人来提问。

## 快速启动

```bash
cd askbox
npm install
node server.js
```

打开 `http://localhost:3000`

## 部署到公网（让别人可以访问）

### 方案一：Railway（推荐 ✅）

1. 把 `askbox/` 文件夹推送到 GitHub
2. 注册 [railway.app](https://railway.app)（免费额度够用）
3. 新建项目 → Deploy from GitHub repo
4. Railway 会自动识别 Node.js 项目
5. 部署完就有公网链接了

### 方案二：Render

1. 推送到 GitHub
2. 注册 [render.com](https://render.com)
3. New Web Service → 选你的仓库
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. 选 Free 套餐即可

### 方案三：VPS / 云服务器

把 `askbox/` 上传到服务器，安装 Node.js 后：

```bash
npm install
node server.js &
```

用 nginx 反代到域名即可。

### 方案四：局域网临时共享

在同一 Wi-Fi 下让别人访问你的 IP+端口：
```
http://你电脑的IP:3000
```

## 管理后台

访问 `http://你的域名:3000` → 底部导航「管理」

**默认密码：admin123**（可在设置页修改）

## 数据存储

所有数据存在 `data/db.json`，定期备份这个文件即可。

## 制作抖音内容的流程

1. 分享链接给朋友，他们来提问（或自己生成测试提问）
2. 在管理后台写回答
3. 切换到「卡片」页选提问、调背景
4. 下载 PNG 卡片
5. 发抖音
