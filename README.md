# 砚

**会思考的笔记本** — 记下即整理，不再让你管标签、文件夹、关联。

## 特性

- **零摩擦捕获** — 文字、语音、拍照，从「想记」到「开始记」不超过 1 秒
- **AI 自动整理** — 保存后自动分类、打标签、生成摘要、提取人名
- **问砚（RAG）** — 用自然语言翻阅你的笔记，AI 引用原文回答
- **Tag Curator** — 每周自动分析标签使用，建议合并/重命名/归档
- **月度洞察** — 每月自动生成写作回顾，安静等被读
- **WebDAV 同步** — 笔记以 Markdown 存于你自己的 WebDAV，Obsidian 可读
- **BYOK 多供应商** — 支持魔搭、DeepSeek、Moonshot、智谱、通义等 9 家 AI 供应商
- **隐私优先** — 零 telemetry，数据只流向你的 WebDAV 和你的 AI 供应商
- **离线可用** — PWA 离线可读可写，AI 失效时自动降级到规则版

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建产物
npm run preview
```

## 技术栈

| 用途 | 选型 |
|---|---|
| 构建 | Vite 6 |
| 视图 | React 18 |
| 本地存储 | IndexedDB（`idb`） |
| Markdown | `gray-matter` + `marked` |
| WebDAV | `webdav` |
| 全文检索 | `minisearch` |
| 加密 | Web Crypto API（PBKDF2 + AES-GCM） |
| AI 协议 | OpenAI 兼容（`/v1/chat/completions`） |

总依赖 6 个 npm 包。生产 bundle ~488KB（gzip ~149KB）。

## 目录结构

```
src/
├── main.jsx              # 入口
├── app.jsx               # Shell、路由、全局状态
├── components.jsx        # UI 原子组件
├── icons.jsx             # 手绘 SVG 图标
├── tokens.jsx            # 设计令牌 + 日期工具
├── db.js                 # IndexedDB 数据层
├── note-format.js        # Markdown frontmatter 序列化
├── store.jsx             # 笔记 CRUD（IndexedDB 后端）
├── migrate.js            # localStorage → IndexedDB 迁移
├── sync.js               # WebDAV 同步引擎
├── crypto.js             # 主密码加密
├── ai.js                 # BYOK AI 服务
├── curator.js            # Tag Curator
├── rag.js                # RAG Tier 1
├── screen-capture.jsx    # 记一笔
├── screen-list.jsx       # 时间线列表
├── screen-detail.jsx     # 笔记详情
├── screen-yan.jsx        # 砚（洞察 + 问砚）
├── screen-settings.jsx   # 设置
├── screen-search.jsx     # 搜索
├── screen-tags.jsx       # 标签浏览
├── screen-trash.jsx      # 回收站
└── screen-onboard.jsx    # 首次引导
```

## 数据模型

每条笔记 = 一个 `.md` 文件，YAML frontmatter + Markdown 正文：

```markdown
---
id: 2026-05-03-1742-a3f
created: 2026-05-03T17:42:13+08:00
kind: text
category: 工作
tags: [产品, 首屏, 决策]
people: [阿宁]
---

晚饭后又重新想了一遍首屏……
```

## 部署

纯静态构建，`dist/` 目录可部署到任何静态托管：

- Cloudflare Pages
- Vercel
- GitHub Pages
- 自托管 nginx

需要 HTTPS（PWA 必需）。因为 BYOK + WebDAV，部署后无任何后端开销。

## 配置

首次使用可按需配置（无强制顺序）：

1. **AI 供应商** — 设置页填入 API Key，自动拉取模型列表
2. **WebDAV** — 填入服务器地址和凭据，笔记开始同步
3. **主密码** — 加密 API Key，多设备安全同步
4. **大分类** — 默认 7 类（学习/工作/生活/想法/AI/开发/收藏），可自定义

## 许可

个人作品，自用为主。
