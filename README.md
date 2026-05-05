# 砚

**会思考的本地优先笔记本。** 砚是一款移动端优先的 PWA 笔记应用：随手记录文字、语音和照片，本地保存到 IndexedDB，再按需用你自己的 AI Key 做标题、分类、标签、摘要、问答和月度洞察。同步走 WebDAV，笔记以 Markdown + YAML frontmatter 形式落在你自己的存储里；部署到 Cloudflare Pages 时可用 Pages Functions 补齐 WebDAV 代理和 Workers AI 语音转写。

## 当前能力

- **零摩擦捕获**：首页全能输入支持文字、语音、照片和文件名备注；照片会在浏览器内压缩为 JPEG，语音优先使用 Web Speech API，缺失时走同源 `/api/transcribe` 的 Cloudflare Workers AI 分段转写；长文本可进入全屏落笔，并支持列表自动编号续写。
- **自动整理**：保存后先本地生成标题、标签、人物线索和摘要；配置 AI 后可执行分类、取标题、打标签、摘要生成和人物提取，并按任务分配不同模型。
- **笔记本视图**：按时间线浏览，支持置顶、分类筛选、上下文标签筛选、全文搜索、标签管理、卡片密度切换、100 条以上虚拟列表、下拉同步、左滑钉住/删除和长按菜单。
- **详情编辑**：详情页支持 Markdown 渲染、分类切换、相关笔记、全屏编辑、左右滑动翻页、软删除和回收站恢复。
- **问砚与洞察**：砚页提供本月统计、热力图、常用标签、AI 月度洞察、问砚 RAG 问答和洞察长图导出。
- **Tag Curator**：AI 定期分析标签统计和共现关系，给出合并、重命名、归档、新增等整理建议；标签管理页也会提示本地可判断的相似标签。
- **WebDAV 同步**：通过同源 `/dav/<encoded-server>/...` 代理访问 WebDAV，本地由 Vite 代理，Cloudflare Pages 生产环境由 Pages Function 代理；双向同步笔记、照片附件、分类、洞察、偏好和回收站，并把冲突副本写入远程 `conflicts/`。
- **数据管理**：设置页提供 Markdown 导出、分类管理、回收站、示例数据重置、全量清空、PWA 安装入口和主密码管理。
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

本地开发默认由 Vite 提供地址，通常是 `http://localhost:5173/`。生产构建输出到 `dist/`；如果要使用 WebDAV 代理或 Workers AI 转写，部署目标需要支持 Cloudflare Pages Functions。

## 验证命令

```bash
# 构建验证
npm run build

# 当前仓库的 node:test 用例
node --test tests/*.test.mjs
```

`package.json` 目前只定义了 `dev`、`build`、`preview` 三个脚本，所以测试命令暂时需要直接调用 `node --test`。现有测试覆盖长图导出、Markdown frontmatter、WebDAV 代理、Cloudflare Pages Functions、个性化设置移除和详情页层级关系。

## 运行要求

- Node.js 18+。
- 现代浏览器，需支持 IndexedDB、Web Crypto、Service Worker、MediaRecorder 或 Web Speech API。
- PWA、麦克风、摄像头和 Service Worker 在生产环境需要 HTTPS；`localhost` 开发环境除外。
- AI 供应商需要允许浏览器跨域访问；WebDAV 在本地开发和 `vite preview` 下走内置同源代理，Cloudflare Pages 生产环境通过 `functions/dav/[[path]].js` 提供同等 `/dav/<encoded-server>/...` 反向代理。
- Cloudflare Workers AI 转写需要给 Pages 项目绑定名为 `AI` 的 Workers AI binding；本地调试 Pages Functions 时使用 `wrangler pages dev dist --ai=AI`。

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

可配置默认模型，也可为不同任务单独分配模型：分类、打标签、摘要、取标题、月度洞察、问砚、标签整理。未配置 AI 时，应用仍会使用本地规则完成基础标题、标签、摘要、人物提取和搜索。

### WebDAV

WebDAV 配置包含服务器地址、用户名、密码和远程根路径，默认根路径是 `/yan`。开发环境和 `vite preview` 会把浏览器请求从同源 `/dav/<encoded-server>/...` 转发到真实服务器，Cloudflare Pages 生产环境由 `functions/dav/[[path]].js` 负责同样的转发，避免坚果云这类服务缺少 CORS 响应头导致 `PROPFIND` 预检失败。Service Worker 会跳过 `/dav/` 流量，不缓存同步请求。同步路径约定如下：

```text
<root>/notes/<year>/<month>/<id>.md        # 正常笔记
<root>/trash/<id>.md                       # 回收站
<root>/attachments/<id>/<filename>         # 照片附件
<root>/categories.json                     # 分类
<root>/insights/<YYYY-MM>.md               # 月度洞察
<root>/preferences.md                      # 偏好
<root>/conflicts/<local|remote>-<modified>-<id>.md  # 冲突副本
```

Cloudflare 代理默认只允许 `https:` WebDAV 目标，并拒绝 localhost、内网 IP 等私有目标，避免把站点变成内网探测代理。可选环境变量：

- `DAV_ALLOWED_HOSTS`：逗号分隔的允许域名列表，例如 `dav.jianguoyun.com,example.com`；不配置时允许公网 HTTPS 主机。
- `DAV_ALLOW_INSECURE_HTTP=1`：允许代理 `http:` 目标，仅用于明确知道风险的自建环境。

### Cloudflare Workers AI 转写

没有 Web Speech API 的浏览器会用 MediaRecorder 录制 `audio/webm`，录音过程中按约 4.5 秒切成独立片段，连续 POST 到同源 `/api/transcribe`，并把返回文本逐段追加到输入框。停止录音时只等待最后一段完成；取消录音会停止麦克风并丢弃当前片段，不再发起转写。Cloudflare Pages Function 读取音频后调用 `context.env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio, language: 'zh', vad_filter: true, condition_on_previous_text: false })`，返回 `{ text }` 给前端。旧的第三方音频转写兜底已经删除；如果 Pages Function 或 `AI` binding 不可用，前端会提示转写失败。

Pages 项目需要在 Cloudflare 控制台添加 Workers AI binding，变量名必须是 `AI`。仓库的 `wrangler.toml` 已声明：

```toml
[ai]
binding = "AI"
```

### 主密码

主密码通过 Web Crypto API 派生密钥，使用 PBKDF2 + AES-GCM 加密 API Key 等敏感信息。密码本身不存储；忘记后需要重新输入相关 Key。

### 大分类

默认分类为：学习、工作、生活、想法、AI、开发、收藏。设置页可新增、编辑、删除分类；删除分类时，该分类下笔记会迁移到保底分类。

## 数据格式

每条笔记会序列化为 Markdown + YAML frontmatter，标签使用裸字符串数组，方便 Obsidian 等工具读取。照片会作为附件同步，frontmatter 中用 `photo` / `attachments` 记录文件名。

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
photo: null
ai:
  summary: 今天重新确认了首屏信息架构。
  generated_at: '2026-05-04T10:35:00.000Z'
  model: deepseek-chat
---

晚饭后又重新想了一遍首屏……
```

软删除笔记会额外带 `deleted_at` 字段，并同步到 `<root>/trash/`。

## 技术栈

| 用途 | 选型 |
|---|---|
| 构建 | Vite 6 |
| 视图 | React 18 |
| 本地存储 | IndexedDB + `idb` |
| 全文检索 | `minisearch` |
| Markdown 渲染 | `marked` + `dompurify` |
| Markdown 数据 | YAML frontmatter + `yaml` |
| 长图导出 | `html2canvas` |
| 加密 | Web Crypto API（PBKDF2 + AES-GCM） |
| AI 协议 | OpenAI 兼容 `/v1/chat/completions` |
| 语音转写 | Web Speech API，Cloudflare Workers AI 分段 `/api/transcribe` |
| 同步 | 浏览器 fetch + 同源 WebDAV 代理 |
| PWA | Web App Manifest + Service Worker |

## 目录结构

```text
.
├── index.html                 # HTML 入口、CSP、PWA 注册
├── styles.css                 # 全局样式和移动端布局
├── vite.config.js             # Vite 配置，base='./'
├── wrangler.toml              # Cloudflare Pages Functions 和 Workers AI binding
├── functions/
│   ├── api/transcribe.js      # Workers AI 语音转写接口
│   └── dav/[[path]].js        # Cloudflare Pages WebDAV 代理
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
│   ├── note-id.js             # 跨设备唯一笔记 ID
│   ├── note-format.js         # Markdown/frontmatter 序列化
│   ├── search.js              # MiniSearch 索引
│   ├── filter-stats.js        # 分类/标签筛选统计
│   ├── gestures.js            # 滑动、长按、详情翻页手势
│   ├── sync.js                # WebDAV 同步引擎
│   ├── audio-transcription.js # Workers AI 分段转写客户端
│   ├── crypto.js              # 主密码和密钥加密
│   ├── ai.js                  # BYOK AI 配置与任务调用
│   ├── ai-tagger.js           # 规则/AI 自动整理
│   ├── rag.js                 # 问砚 RAG 查询与回答
│   ├── curator.js             # 标签整理建议
│   ├── export-screenshot.js   # 洞察长图导出
│   ├── tag-colors.js          # 标签颜色与分类词典
│   ├── screen-capture.jsx     # 首页捕获
│   ├── screen-list.jsx        # 笔记本、筛选、同步入口
│   ├── screen-detail.jsx      # 详情、编辑、翻页
│   ├── screen-search.jsx      # 全文搜索
│   ├── screen-tags.jsx        # 标签管理
│   ├── screen-trash.jsx       # 回收站
│   ├── screen-yan.jsx         # 洞察与问砚
│   ├── screen-settings*.jsx   # 设置页及子页面
│   └── settings-*.jsx         # 设置页通用组件与安全弹层
├── tests/
│   ├── detail-menu-layer.test.mjs
│   ├── export-screenshot.test.mjs
│   ├── note-format.test.mjs
│   ├── personalization-removal.test.mjs
│   ├── webdav-proxy-config.test.mjs
│   └── cloudflare-functions.test.mjs
└── docs/
    ├── specs/                 # 产品规格
    └── superpowers/           # 实现计划
```

## 部署

核心前端仍是静态 Vite 应用。运行 `npm run build` 后，把 `dist/` 部署到 Cloudflare Pages；WebDAV 代理和 Workers AI 转写依赖仓库根目录的 `functions/`，因此生产部署建议使用 Cloudflare Pages Git 集成或 Wrangler，而不是只上传 `dist/`。

注意事项：

- 生产环境需要 HTTPS。
- `vite.config.js` 使用 `base: './'`，适合部署到子路径；本地开发和 `vite preview` 还会挂载 WebDAV 同源代理。
- `index.html` 的 CSP 允许 `connect-src 'self' https:`，AI 和 WebDAV endpoint 需要使用 HTTPS。
- 静态托管必须能正确提供 `manifest.webmanifest`、`sw.js`、PWA 图标和 `assets/*`。
- 纯静态托管无法替第三方 WebDAV 补 CORS，也不能调用 Workers AI。生产环境若要支持坚果云等服务和免费边缘转写，需要启用 Cloudflare Pages Functions，并确保 `/dav/*` 和 `/api/transcribe` 不被 Service Worker 或 CDN 缓存。

## 许可

个人作品，自用为主。
