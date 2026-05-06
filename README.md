# 砚

**会思考的本地优先笔记本。** 砚是一款移动端优先的 PWA 笔记应用：随手记录文字、语音和照片，本地保存到 IndexedDB，再按需用你自己的 AI Key 做标题、分类、标签、摘要、问答和月度洞察。同步走 WebDAV，笔记以 Markdown + YAML frontmatter 形式落在你自己的存储里；语音转写统一走 Azure AI Speech 实时识别，部署到 Cloudflare Pages 时可用 Pages Functions 签发短期 Speech token。

## 当前能力

- **零摩擦捕获**：首页全能输入支持文字、语音、照片和文件名备注；照片会在浏览器内压缩为 JPEG，语音通过 Azure Speech SDK 持续识别，由 SDK 自行采集麦克风音频并实时返回识别结果；长文本可进入全屏落笔，并支持列表自动编号续写。
- **自动整理**：保存后先本地生成标题、标签、人物线索和摘要；配置 AI 后可执行分类、取标题、打标签、摘要生成和人物提取，并按任务分配不同模型。
- **笔记本视图**：按时间线浏览，支持置顶、分类筛选、上下文标签筛选、全文搜索、标签管理、卡片密度切换、100 条以上虚拟列表、下拉同步、左滑钉住/删除和长按菜单。
- **详情编辑**：详情页支持 Markdown 渲染、分类切换、相关笔记、全屏编辑、左右滑动翻页、软删除和回收站恢复。
- **问砚与洞察**：砚页提供本月统计、热力图、常用标签、AI 月度洞察、问砚 RAG 问答和洞察长图导出。
- **Tag Curator**：AI 定期分析标签统计和共现关系，给出合并、重命名、归档、新增等整理建议；标签管理页也会提示本地可判断的相似标签。
- **WebDAV 同步**：通过同源 `/dav/<encoded-server>/...` 代理访问 WebDAV，本地由 Vite 代理，Cloudflare Pages 生产环境由 Pages Function 代理；本地新增、编辑、删除会延迟自动同步；远端用索引和删除墓碑追踪全量笔记，并把冲突副本写入远程 `conflicts/`。
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

本地开发默认由 Vite 提供地址，通常是 `http://localhost:5173/`。生产构建输出到 `dist/`；如果要使用 WebDAV 代理或 Azure Speech token 签发接口，部署目标需要支持 Cloudflare Pages Functions。

## 验证命令

```bash
# 构建验证
npm run build

# 当前仓库的 node:test 用例
node --test tests/*.test.mjs
```

`package.json` 目前只定义了 `dev`、`build`、`preview` 三个脚本，所以测试命令暂时需要直接调用 `node --test`。现有测试覆盖长图导出、Markdown frontmatter、WebDAV 代理、Cloudflare Pages Functions、个性化设置移除和详情页层级关系。

## 运行要求

- Node.js 20+（Azure Speech SDK 依赖链包含要求 Node 20+ 的包）。
- 现代浏览器，需支持 IndexedDB、Web Crypto、Service Worker、Azure Speech SDK、Web Audio API 和麦克风权限。
- PWA、麦克风、摄像头和 Service Worker 在生产环境需要 HTTPS；`localhost` 开发环境除外。
- AI 供应商需要允许浏览器跨域访问；WebDAV 在本地开发和 `vite preview` 下走内置同源代理，Cloudflare Pages 生产环境通过 `functions/dav/[[path]].js` 提供同等 `/dav/<encoded-server>/...` 反向代理。
- Azure Speech 识别需要在运行环境配置 `AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION` 和 Azure 中国区 endpoint；本地 `npm run dev` / `npm run preview` 会读取同名环境变量并提供 `/api/transcribe` token 签发接口。

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
<root>/index.json                          # 全量笔记索引
<root>/deletions.json                      # 永久删除墓碑
<root>/categories.json                     # 分类，带 modified 版本信息
<root>/insights/<YYYY-MM>.md               # 月度洞察
<root>/insights/<YYYY-MM>.json             # 月度洞察，带 modified 版本信息
<root>/preferences.json                    # 偏好，带 modified 版本信息
<root>/preferences.md                      # 偏好兼容副本
<root>/conflicts/<local|remote>-<modified>-<id>.md  # 冲突副本
```

笔记同步会优先读取 `<root>/index.json`，避免只扫描最近目录导致旧笔记漏拉。远端还没有索引时，会回退遍历 `<root>/notes/` 下所有年份和月份目录；同步完成后重新生成索引。永久删除会写入 `<root>/deletions.json`，下一次同步会同时删除远端正常笔记和回收站副本，避免已删除笔记从另一台设备复活。

添加、编辑、软删除、恢复、永久删除、分类变更和偏好变更会在本地保存成功后标记为待同步，并在约 5 秒后自动触发一次 WebDAV 同步；短时间连续编辑会合并成一次同步。自动同步需要 WebDAV 配置完整，若主密码已启用但尚未解锁，则只保留待同步状态，等用户解锁或手动同步后再执行。

Cloudflare 代理默认只允许 `https:` WebDAV 目标，并拒绝 localhost、内网 IP 等私有目标，避免把站点变成内网探测代理。可选环境变量：

- `DAV_ALLOWED_HOSTS`：逗号分隔的允许域名列表，例如 `dav.jianguoyun.com,example.com`；不配置时允许公网 HTTPS 主机。
- `DAV_ALLOW_INSECURE_HTTP=1`：允许代理 `http:` 目标，仅用于明确知道风险的自建环境。

### Azure Speech 实时语音识别

录音时浏览器使用 Azure Speech SDK 进行持续识别（continuous recognition），SDK 自行采集麦克风音频、管理连接并返回实时识别结果。`/api/transcribe` 负责用服务端环境变量向 Azure Speech 服务签发短期 STS token，避免把 Speech Key 打进前端包；token 默认有效期约 10 分钟，长时间录音会在 9 分钟时自动刷新。识别结果实时追加到输入框，并经过 TrueText 后处理提升可读性。取消录音会立即停止识别；停止录音会等待最终结果返回。

需要在 Azure 门户创建 Speech 资源，然后配置以下变量：

```bash
AZURE_SPEECH_KEY=你的 Speech Key
AZURE_SPEECH_CLOUD=azure-china
AZURE_SPEECH_REGION=你的区域（chinaeast2 / chinanorth2 / chinanorth3）
AZURE_SPEECH_ENDPOINT=你的 Azure 中国区 Speech 终结点
```

可选变量：

- `AZURE_SPEECH_LANGUAGE`：主要识别语言，默认 `zh-CN`。
- `AZURE_SPEECH_CANDIDATE_LANGUAGES`：逗号分隔的候选语言列表，用于 at-start 语言识别，默认 `zh-CN,en-US`。
- `AZURE_SPEECH_TRUE_TEXT`：是否启用 TrueText 后处理，默认 `true`。

默认按由世纪互联运营的 Azure 中国区配置，支持区域为 `chinaeast2`、`chinanorth2`、`chinanorth3`。如果使用全球 Azure，需要显式设置 `AZURE_SPEECH_CLOUD=global`；此时不配置 `AZURE_SPEECH_ENDPOINT` 时会按 `https://<region>.api.cognitive.microsoft.com/` 推导标准终结点。

生产环境建议在 Cloudflare Pages 的环境变量里配置；本地 PowerShell 可在启动前设置：

```powershell
$env:AZURE_SPEECH_KEY='...'
$env:AZURE_SPEECH_CLOUD='azure-china'
$env:AZURE_SPEECH_REGION='chinaeast2'
$env:AZURE_SPEECH_ENDPOINT='https://chinaeast2.api.cognitive.azure.cn/'
npm run dev
```

> **隐私说明**：语音识别过程中，麦克风音频会实时发送到 Azure AI Speech 服务进行处理；识别完成后，只有最终文本结果保存在本地 IndexedDB，音频数据不会被持久化存储。

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
| 语音转写 | Azure AI Speech SDK + 同源 `/api/transcribe` token 签发 |
| 同步 | 浏览器 fetch + 同源 WebDAV 代理 |
| PWA | Web App Manifest + Service Worker |

## 目录结构

```text
.
├── index.html                 # HTML 入口、CSP、PWA 注册
├── styles.css                 # 全局样式和移动端布局
├── vite.config.js             # Vite 配置，base='./'
├── wrangler.toml              # Cloudflare Pages 配置
├── functions/
│   ├── api/transcribe.js      # Azure Speech token 签发接口
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
│   ├── audio-transcription.js # provider-neutral 实时转写门面 (Azure Speech SDK)
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

核心前端仍是静态 Vite 应用。运行 `npm run build` 后，把 `dist/` 部署到 Cloudflare Pages；WebDAV 代理和 Azure Speech token 签发依赖仓库根目录的 `functions/`，因此生产部署建议使用 Cloudflare Pages Git 集成或 Wrangler，而不是只上传 `dist/`。

注意事项：

- 生产环境需要 HTTPS。
- `vite.config.js` 使用 `base: './'`，适合部署到子路径；本地开发和 `vite preview` 还会挂载 WebDAV 同源代理。
- `index.html` 的 CSP 允许 `connect-src 'self' https:`，AI 和 WebDAV endpoint 需要使用 HTTPS。
- 静态托管必须能正确提供 `manifest.webmanifest`、`sw.js`、PWA 图标和 `assets/*`。
- 纯静态托管无法替第三方 WebDAV 补 CORS，也不能保护 Azure Speech Key。生产环境若要支持坚果云等服务和语音识别，需要启用 Cloudflare Pages Functions，并确保 `/dav/*` 和 `/api/transcribe` 不被 Service Worker 或 CDN 缓存。

## 许可

个人作品，自用为主。
