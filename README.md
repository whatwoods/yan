# 砚

**会思考的本地优先笔记本。** 砚是一款移动端优先的 PWA 笔记应用：随手记录文字、语音和照片，本地保存到 IndexedDB，再按需用你自己的 AI Key 做分类、标签、摘要、问答和月度洞察。同步走 WebDAV，笔记以 Markdown 形式落在你自己的存储里。

## 当前能力

- **零摩擦捕获**：首页全能输入支持文字、语音和照片；照片会在浏览器内压缩为 JPEG，语音优先使用 Web Speech API，缺失时尝试走 OpenAI 兼容的音频转写接口。
- **自动整理**：保存后先本地生成标题、标签、人物线索和摘要；配置 AI 后并行执行分类、打标签、摘要生成和人物提取。
- **笔记本视图**：按时间线浏览，支持置顶、分类筛选、标签筛选、全文搜索、详情编辑、Markdown 渲染和软删除回收站。
- **问砚与洞察**：砚页提供本月统计、热力图、常用标签、AI 月度洞察、问砚 RAG 问答和洞察长图导出。
- **Tag Curator**：AI 定期分析标签统计和共现关系，给出合并、重命名、归档、新增等整理建议。
- **WebDAV 同步**：通过同源 `/dav/<encoded-server>/...` 代理访问 WebDAV，双向同步笔记、分类、洞察、偏好和回收站，并把冲突副本写入 `/yan/conflicts/`。
- **隐私优先**：应用没有自带后端；笔记默认只在本机 IndexedDB，AI 请求只发往你配置的供应商，敏感 Key 可用主密码加密。
- **离线可用**：Service Worker 缓存应用壳和构建产物，支持 PWA 安装和离线读写。

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览 dist/
npm run preview
```

本地开发默认由 Vite 提供地址，通常是 `http://localhost:5173/`。生产构建输出到 `dist/`，可部署到任何静态托管。

## 验证命令

```bash
# 构建验证
npm run build

# 当前仓库的 node:test 用例
node --test tests/*.test.mjs
```

`package.json` 目前只定义了 `dev`、`build`、`preview` 三个脚本，所以测试命令暂时需要直接调用 `node --test`。

## 运行要求

- Node.js 18+。
- 现代浏览器，需支持 IndexedDB、Web Crypto、Service Worker、MediaRecorder 或 Web Speech API。
- PWA、麦克风、摄像头和 Service Worker 在生产环境需要 HTTPS；`localhost` 开发环境除外。
- AI 供应商需要允许浏览器跨域访问；WebDAV 在本地开发和 `vite preview` 下走内置同源代理，生产部署需要提供同等的 `/dav/<encoded-server>/...` 反向代理，或使用本身允许浏览器跨域访问的 WebDAV 服务。

## 配置项

### AI

设置页支持 BYOK，内置以下 OpenAI 兼容供应商入口：

- 魔搭 ModelScope
- DeepSeek
- Moonshot Kimi
- 智谱 GLM
- 通义千问
- MiniMax
- 小米
- OpenRouter
- OpenAI
- 自定义 endpoint

可配置默认模型，也可为不同任务单独分配模型：分类、打标签、摘要、月度洞察、问砚、标签整理。未配置 AI 时，应用仍会使用本地规则完成基础标题、标签、摘要和搜索。

### WebDAV

WebDAV 配置包含服务器地址、用户名和密码。开发环境会把浏览器请求从同源 `/dav/<encoded-server>/...` 转发到真实服务器，避免坚果云这类服务缺少 CORS 响应头导致 `PROPFIND` 预检失败。同步路径约定如下：

```text
/yan/notes/<year>/<month>/<id>.md     # 正常笔记
/yan/trash/<id>.md                    # 回收站
/yan/categories.json                  # 分类
/yan/insights/<YYYY-MM>.md            # 月度洞察
/yan/preferences.md                   # 偏好
/yan/conflicts/<id>.md                # 冲突副本
```

### 主密码

主密码通过 Web Crypto API 派生密钥，使用 PBKDF2 + AES-GCM 加密 API Key 等敏感信息。密码本身不存储；忘记后需要重新输入相关 Key。

### 大分类

默认分类为：学习、工作、生活、想法、AI、开发、收藏。设置页可新增、编辑、删除分类；删除分类时，该分类下笔记会迁移到保底分类。

## 数据格式

每条笔记会序列化为 Markdown + YAML frontmatter，标签使用裸字符串数组，方便 Obsidian 等工具读取。

```markdown
---
id: 2026-05-550e8400-e29b-41d4-a716-446655440000
created: '2026-05-04T10:30:00.000Z'
modified: '2026-05-04T10:35:00.000Z'
kind: text
category: 工作
tags:
  - 产品
  - 决策
people:
  - 阿宁
pinned: false
attachments: []
ai:
  summary: 今天重新确认了首屏信息架构。
  generated_at: '2026-05-04T10:35:00.000Z'
  model: deepseek-chat
---

晚饭后又重新想了一遍首屏……
```

软删除笔记会额外带 `deleted_at` 字段，并同步到 `/yan/trash/`。

## 技术栈

| 用途 | 选型 |
|---|---|
| 构建 | Vite 6 |
| 视图 | React 18 |
| 本地存储 | IndexedDB + `idb` |
| 全文检索 | `minisearch` |
| Markdown 渲染 | `marked` + `dompurify` |
| 长图导出 | `html2canvas` |
| 加密 | Web Crypto API（PBKDF2 + AES-GCM） |
| AI 协议 | OpenAI 兼容 `/v1/chat/completions` |
| 同步 | 浏览器 fetch + 同源 WebDAV 代理 |
| PWA | Web App Manifest + Service Worker |

## 目录结构

```text
.
├── index.html                 # HTML 入口、CSP、PWA 注册
├── styles.css                 # 全局样式和移动端布局
├── vite.config.js             # Vite 配置，base='./'
├── public/
│   ├── manifest.webmanifest   # PWA manifest
│   ├── sw.js                  # 离线缓存 Service Worker
│   └── icon-*.png             # PWA 图标
├── src/
│   ├── main.jsx               # React 入口
│   ├── app.jsx                # Shell、路由、全局状态
│   ├── components.jsx         # 通用 UI 组件
│   ├── icons.jsx              # 图标组件
│   ├── tokens.jsx             # 设计令牌、人格、日期工具
│   ├── db.js                  # IndexedDB 封装
│   ├── store.jsx              # 笔记 CRUD、设置、分类、迁移入口
│   ├── migrate.js             # localStorage 到 IndexedDB 迁移
│   ├── note-format.js         # Markdown/frontmatter 序列化
│   ├── search.js              # MiniSearch 索引
│   ├── sync.js                # WebDAV 同步引擎
│   ├── crypto.js              # 主密码和密钥加密
│   ├── ai.js                  # BYOK AI 配置与任务调用
│   ├── ai-tagger.js           # 规则/AI 自动整理
│   ├── rag.js                 # 问砚 RAG 查询与回答
│   ├── curator.js             # 标签整理建议
│   ├── export-screenshot.js   # 洞察长图导出
│   ├── screen-*.jsx           # 各页面
│   └── settings-*.jsx         # 设置页拆分组件
├── tests/
│   └── export-screenshot.test.mjs
└── docs/
    └── specs、superpowers     # 产品规格与实现计划
```

## 部署

这是纯静态应用。运行 `npm run build` 后，把 `dist/` 部署到 Cloudflare Pages、Vercel、GitHub Pages、Nginx 或任意静态托管即可。

注意事项：

- 生产环境需要 HTTPS。
- `vite.config.js` 使用 `base: './'`，适合部署到子路径；本地开发和 `vite preview` 还会挂载 WebDAV 同源代理。
- `index.html` 的 CSP 允许 `connect-src 'self' https:`，AI 和 WebDAV endpoint 需要使用 HTTPS。
- 静态托管必须能正确提供 `manifest.webmanifest`、`sw.js` 和 `assets/*`。
- 纯静态托管无法替第三方 WebDAV 补 CORS。生产环境若要支持坚果云等服务，需要在同一域名下配置 `/dav/<encoded-server>/...` 反向代理。

## 许可

个人作品，自用为主。
