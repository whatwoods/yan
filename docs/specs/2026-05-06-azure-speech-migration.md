# Azure Speech 语音识别迁移设计

- **日期**：2026-05-06
- **状态**：已实现（本地自动化验收通过；真实 Azure 凭据实录需在配置环境变量后验收）
- **范围**：将首页语音捕获从讯飞实时听写迁移到 Azure AI Speech，并利用微软官方能力改善实时转写可读性

## 1. 背景与目标

砚当前语音链路已经从 Web Speech / MediaRecorder fallback 收敛到讯飞实时听写：`src/audio-transcription.js` 负责 Web Audio 采集、16k PCM 降采样、1280 字节分帧和讯飞 WebSocket 协议；`functions/api/transcribe.js` 负责签发讯飞 WebSocket URL；`src/screen-capture.jsx` 只消费 `createXfyunRealtimeTranscriber` 的 `start / stop / onTranscript / onStatus / onError` 接口。

迁移目标不是简单换供应商，而是把语音能力从“手写单一厂商协议”升级为“SDK 驱动、服务端 token、边界清晰”的语音层：

- 保持首页录音体验：点击录音、实时看到中间结果、停止后正文落入输入框、失败后回到手动输入。
- 不在浏览器暴露 Azure Speech key，只通过同源 `/api/transcribe` 签发短期 token。
- 删除讯飞专用协议代码，保留前端调用边界，降低后续维护成本。
- 先等价替换，再在明确阶段内启用 at-start 语言识别和 TrueText 后处理。
- 继续保持“语音笔记只保存转写文本，不保存音频文件”的数据原则。

## 2. 官方依据

本设计按 2026-05-06 核对的 Microsoft Learn 文档制定：

| 文档 | 对设计的约束 |
|---|---|
| [How to recognize speech](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-recognize-speech) | 浏览器 JavaScript 支持从麦克风识别；Node.js 不支持麦克风识别；连续识别通过 `recognizing / recognized / canceled / sessionStopped` 事件和 `startContinuousRecognitionAsync / stopContinuousRecognitionAsync` 控制。 |
| [Speech SDK for JavaScript](https://learn.microsoft.com/en-us/javascript/api/overview/azure/microsoft-cognitiveservices-speech-sdk-readme?view=azure-node-latest) | 官方 npm 包是 `microsoft-cognitiveservices-speech-sdk`；当前 `npm view` 查询最新版本为 `1.49.0`。 |
| [SpeechConfig JavaScript API](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechconfigimpl?view=azure-node-latest) | SDK 支持 `fromAuthorizationToken(token, region)`；token 过期前需要刷新，已创建的 recognizer 也要刷新自身 token。 |
| [Speech to text REST API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text) | REST API 最新 GA 版本为 `2025-10-15`，定位是 fast transcription、batch transcription、custom speech，不作为首页实时语音主链路。 |
| [Short audio REST API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short) | 短音频 REST 适合不能使用 SDK 的场景，有 60 秒限制，不适合替代当前实时转写体验。 |
| [Language identification](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-identification) | JavaScript Speech SDK 支持 at-start 和 continuous LID；at-start 最多 4 个候选语言，continuous 最多 10 个候选语言；continuous LID 不支持同一句内逐词切换。 |
| [Post-processing](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-post-processing) | SDK 支持 `SpeechServiceResponse_PostProcessingOption = TrueText`，用于标点、大小写等更可读的显示文本；REST 不支持该配置。 |
| [Sovereign clouds](https://learn.microsoft.com/zh-cn/azure/ai-services/speech-service/sovereign-clouds) | 由世纪互联运营的 Azure 中国区支持 `chinaeast2`、`chinanorth2`、`chinanorth3`；token endpoint 使用 `api.cognitive.azure.cn`；Speech SDK 需使用 endpoint 初始化。 |

## 3. 关键决策速览

| 维度 | 决定 |
|---|---|
| 主方案 | Azure AI Speech SDK 浏览器连续识别 |
| 不选方案 | 不用短音频 REST 替代首页录音；音频文件导入不进入本 spec |
| 前端鉴权 | 浏览器拿短期 token，不拿 Speech key |
| 服务端接口 | 保留同源 `/api/transcribe`，响应从讯飞签名 URL 改为 Azure token session |
| SDK 版本 | 引入 `microsoft-cognitiveservices-speech-sdk@^1.49.0` |
| 默认云环境 | 优先支持由世纪互联运营的 Azure 中国区；全球 Azure 通过配置切换 |
| 中国区区域 | `chinaeast2`、`chinanorth2`、`chinanorth3` |
| 默认语言 | `zh-CN` |
| 第一版高级能力 | TrueText 默认开启；at-start LID 可配置开启 |
| 后续高级能力 | 不在本迁移计划内；continuous LID 仅作为文档说明，不进入任务列表 |
| VAD 策略 | 第一阶段不做独立本地 VAD；依赖 Azure Speech SDK 连续识别的默认端点处理 |
| 数据存储 | 不保存音频；第一阶段只把最终文本写入现有 note body；识别元信息不进入第一阶段 |
| 错误策略 | 启动失败回到文本输入；运行中 canceled 只提示“部分转写失败”，已确认文本保留 |

## 3.1 范围边界

本 spec 的实现范围只包含两个阶段：

1. **阶段 A：等价迁移**。把讯飞实时听写替换为 Azure Speech SDK，保持现有首页录音体验。
2. **阶段 B：可读性优化**。启用 TrueText 和 at-start LID，改善普通转写文本质量。

以下内容不属于本 spec 的实现范围：

- continuous LID 的 UI、设置项或运行时逻辑。
- 音频文件导入、REST fast transcription、batch transcription。
- custom speech model 训练或模型管理。
- 会议/访谈模式、多人记录、diarization。
- 本地 VAD、常驻监听、唤醒词、语音助手轮次判断。
- 长语音优化、semantic segmentation、录音长度归类。

后续如果要做上述任一方向，必须新开独立 spec，不能在执行本迁移计划时顺手加入。

## 4. 目标体验

### 4.1 普通随手记

1. 用户点击首页麦克风。
2. 应用进入 recording 模式，显示“正在连接语音识别…”。
3. `/api/transcribe` 返回 Azure token、region、endpoint、language。
4. 前端创建 `SpeechRecognizer`，调用 `startContinuousRecognitionAsync`。
5. `recognizing` 事件更新灰色临时文本，不写入正文。
6. `recognized` 事件将最终文本 append 到正文。
7. 用户点击停止，前端调用 `stopContinuousRecognitionAsync`，完成后 toast “转写完成”。

### 4.2 中英混合笔记

第一版启用 at-start LID，候选语言默认 `zh-CN,en-US`。它解决“整段英文口述 / 整段中文口述”的自动切换，不承诺一句中文里夹英文单词能逐词识别。

continuous LID 不进入本迁移计划。它需要 `SpeechServiceConnection_LanguageIdMode = Continuous` 和更复杂的结果归属处理，后续若确实需要一段录音内多语言段落交替识别，应单独写 spec。

## 5. 架构设计

### 5.1 模块边界

```text
src/screen-capture.jsx
  只负责录音 UI 状态、正文拼接、错误 toast
      |
      v
src/audio-transcription.js
  provider-neutral 转写门面，内含 Azure Speech SDK adapter，封装 token、SpeechConfig、SpeechRecognizer 事件
      |
      v
/api/transcribe
  Cloudflare Pages Function / Vite middleware token broker
      |
      v
Azure AI Speech STS issueToken + Speech SDK WebSocket
```

保持 `screen-capture.jsx` 不知道供应商细节。迁移后的首页只从：

```js
import { createXfyunRealtimeTranscriber } from './audio-transcription.js';
```

改为：

```js
import { createRealtimeTranscriber } from './audio-transcription.js';
```

### 5.2 `/api/transcribe` 响应协议

请求：

```http
GET /api/transcribe
Accept: application/json
```

成功响应：

```json
{
  "provider": "azure-speech",
  "token": "eyJ...",
  "cloud": "azure-china",
  "region": "chinaeast2",
  "endpoint": "https://chinaeast2.api.cognitive.azure.cn/",
  "language": "zh-CN",
  "candidateLanguages": ["zh-CN", "en-US"],
  "features": {
    "trueText": true,
    "languageIdentification": "AtStart"
  },
  "expiresInSeconds": 540
}
```

失败响应：

```json
{
  "error": "语音识别连接失败",
  "detail": "Azure Speech credentials are not configured"
}
```

状态码：

| 场景 | 状态码 |
|---|---|
| OPTIONS | 204 |
| GET 成功 | 200 |
| 非 GET | 405 |
| 凭据缺失 / token 签发失败 | 503 |

`expiresInSeconds` 返回 540 秒而不是 600 秒，前端按 9 分钟刷新，给官方 10 分钟 token 留出安全余量。

### 5.3 环境变量

必填：

```powershell
$env:AZURE_SPEECH_KEY='...'
$env:AZURE_SPEECH_CLOUD='azure-china'
$env:AZURE_SPEECH_REGION='chinaeast2'
$env:AZURE_SPEECH_ENDPOINT='https://chinaeast2.api.cognitive.azure.cn/'
```

可选：

```powershell
$env:AZURE_SPEECH_LANGUAGE='zh-CN'
$env:AZURE_SPEECH_CANDIDATE_LANGUAGES='zh-CN,en-US'
$env:AZURE_SPEECH_TRUE_TEXT='1'
```

规则：

- `AZURE_SPEECH_CLOUD` 只接受 `azure-china` 或 `global`，默认按 `azure-china` 处理。
- `AZURE_SPEECH_REGION` 在 `azure-china` 下只接受 `chinaeast2`、`chinanorth2`、`chinanorth3`。
- `AZURE_SPEECH_ENDPOINT` 在 `azure-china` 下必填，值使用 Azure 中国门户中语音资源的终结点；示例为 `https://chinaeast2.api.cognitive.azure.cn/`。
- `global` 下若未配置 `AZURE_SPEECH_ENDPOINT`，由 `AZURE_SPEECH_REGION` 推导为 `https://<region>.api.cognitive.microsoft.com/`。
- `AZURE_SPEECH_CANDIDATE_LANGUAGES` 第一版最多接受 4 个候选语言，因为默认使用 at-start LID。

### 5.3.1 token 签发地址

`/api/transcribe` 根据 `AZURE_SPEECH_CLOUD` 和 `AZURE_SPEECH_REGION` 拼出 token 签发地址：

| 云环境 | token 签发地址 |
|---|---|
| `azure-china` | `https://<region>.api.cognitive.azure.cn/sts/v1.0/issueToken` |
| `global` | `https://<region>.api.cognitive.microsoft.com/sts/v1.0/issueToken` |

Azure 中国区只允许以下区域：

| 地理位置 | 区域 | 区域标识符 |
|---|---|---|
| 中国 | 中国东部 2 | `chinaeast2` |
| 中国 | 中国北部 2 | `chinanorth2` |
| 中国 | 中国北部 3 | `chinanorth3` |

### 5.4 SpeechConfig 初始化规则

全球 Azure 的标准区域路径可以使用：

```js
const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
speechConfig.speechRecognitionLanguage = language;
```

Azure 中国区属于主权云，必须按微软文档使用 endpoint 初始化，再设置 token：

```js
const speechConfig = SpeechSDK.SpeechConfig.fromEndpoint(new URL(endpoint), '');
speechConfig.authorizationToken = token;
speechConfig.speechRecognitionLanguage = language;
```

因此 adapter 规则是：

- `cloud === 'azure-china'`：始终走 `SpeechConfig.fromEndpoint(new URL(endpoint), '')`，再设置 `authorizationToken`。
- `cloud === 'global'` 且 endpoint 是标准 `https://<region>.api.cognitive.microsoft.com/`：走 `fromAuthorizationToken(token, region)`。
- `cloud === 'global'` 且 endpoint 是自定义终结点：走 `fromEndpoint`，再设置 `authorizationToken`。

## 6. 前端转写接口

### 6.1 对外接口

`src/audio-transcription.js` 导出：

```js
export function createRealtimeTranscriber({
  fetchSession = fetchAzureSpeechSession,
  speechSdk = SpeechSDK,
  onTranscript = () => {},
  onInterim = () => {},
  onStatus = () => {},
  onError = () => {},
  now = () => Date.now(),
} = {}) {
  return {
    start,
    stop,
    isRunning,
  };
}
```

状态集合：

| status | 含义 | UI 文案 |
|---|---|---|
| `connecting` | token / recognizer 初始化中 | 正在连接语音识别… |
| `listening` | recognizer 已启动 | 正在听你说… |
| `finishing` | 用户停止，等待 SDK 收尾 | 正在完成转写… |
| `stopped` | 正常结束 | 清空状态 |
| `cancelled` | 用户取消 | 清空状态 |

事件语义：

- `onInterim(text)`：只来自 `recognizing`，覆盖临时文本。
- `onTranscript(text, meta)`：只来自 `recognized` 且 `ResultReason.RecognizedSpeech`，append 到正文。
- `onError(error)`：来自 `canceled` 或 SDK 异常；运行中错误不抹掉已确认正文。

### 6.2 token 刷新

前端在 `start()` 时拿 token，并记录 `tokenIssuedAt`。

普通录音如果超过 8 分 30 秒仍在进行：

1. 调 `/api/transcribe` 获取新 token。
2. 若 recognizer 存在，设置 `recognizer.authorizationToken = newToken`。
3. 若刷新失败，继续当前 token 到 SDK 报错为止，同时提示“语音识别即将过期 · 可停止后重新开始”。

这个策略遵循 SDK 文档的约束：创建 recognizer 后更新 `SpeechConfig` 不会影响已创建 recognizer，需要更新 recognizer 自身 token。

### 6.3 结果去重和拼接

Azure `recognizing` 可能多次返回同一句的增长版本，所以中间结果必须覆盖，不得 append。

Azure `recognized` 返回最终句段后：

```js
function appendFinalTranscript(current, next) {
  const clean = String(next || '').trim();
  if (!clean) return current;
  if (!current.trim()) return clean;
  return `${current.trimEnd()}${needsSpace(current, clean) ? ' ' : ''}${clean}`;
}
```

`needsSpace` 规则：

- 中文、中文标点之间不加空格。
- 英文单词 / 数字之间加空格。
- 已有换行或列表符号时不额外加空格。

### 6.4 capture UI 状态拆分

当前 `screen-capture.jsx` 的 `interim` 同时存“正在连接语音识别…”和临时转写文本。迁移时拆成：

```js
const [recordingHint, setRecordingHint] = useState('');
const [interimTranscript, setInterimTranscript] = useState('');
```

显示规则：

- 正文区域：`text` 用深色，`interimTranscript` 用淡色。
- 状态区：`recordingHint` 展示连接 / 收尾 / 错误。
- 保存正文：只使用 `text`，不把未确认 `interimTranscript` 写入笔记。

## 7. 微软能力的产品化取舍

### 7.1 TrueText：默认开启

TrueText 能让识别结果更像可读文本，符合砚“语音只保存转写文本”的原则。它应该作为第一版默认能力，并在 README 中说明 Azure 会做显示文本后处理。

风险：中文口语标点仍可能不符合个人偏好。后续可继续用现有 `src/ai.js` 的语音错字修正和 AI 整理进行二次清理。

### 7.2 At-start LID：第一版可配置开启

默认候选语言：

```text
zh-CN,en-US
```

适用场景：

- 用户整段用中文口述。
- 用户整段用英文口述。
- 一次录音先中文后英文，但每段之间有明显切换。

不承诺：

- 一句中文里插入英文词时逐词识别。
- 自动识别候选列表以外的语言。

### 7.3 Fast transcription REST：暂不进入首页

Azure REST `2025-10-15` 的 fast transcription 适合“已有音频文件快速转写”。本项目当前不保存音频，也没有音频文件导入入口。因此它不属于本次迁移主线。

音频文件导入不属于本 spec。若未来新增“导入录音文件”，应新开独立 spec，再评估 REST fast transcription，而不是在本迁移中顺带实现。

### 7.4 VAD：第一阶段不做独立本地实现

本项目当前是“用户点击开始 / 用户点击停止”的笔记捕获，不是免手动唤醒、实时对话或语音助手。Azure Speech SDK 连续识别本身会处理语音端点和静音。因此第一阶段不引入自研 VAD 或浏览器侧音量阈值门控。

不做独立 VAD 的原因：

- 本地能量阈值在手机麦克风、环境噪声、蓝牙耳机和远场录音下很容易误判。
- 如果在浏览器侧把音频流硬切给 SDK，容易截掉句首音素，反而降低识别质量。
- 当前设计不保存音频，也不需要用 VAD 裁剪音频文件。
- SDK 默认麦克风路径更简单；自研 VAD 往往需要改成自定义 audio stream，扩大实现和测试面。

第一阶段只保留轻量保护：

- 启动后长时间没有任何 `recognizing / recognized` 结果时，给出“没有听到声音”的可恢复提示。
- 录音超过 token 刷新阈值时按既定策略刷新 token，不用 VAD 自动停录。
- 如果真实测试发现 Azure 默认静音处理影响普通短录音，先记录问题并新开 spec，不在本迁移内扩大到长语音优化。

只有出现以下产品形态时才重新评估 VAD：

- 免手动常驻监听或唤醒词。
- 对话式语音助手，需要自动判定用户一轮话是否结束。
- 为了显著降低云端音频流量，需要只上传含语音片段。

## 8. 实施阶段

### 阶段 A：等价迁移

目标：功能行为与现有讯飞方案等价，测试通过。

改动：

- `package.json` / `package-lock.json`：安装 `microsoft-cognitiveservices-speech-sdk@^1.49.0`。
- `functions/api/transcribe.js`：改成 Azure token broker。
- `vite.config.js`：本地 dev / preview 中间件调用新的 token session builder。
- `src/audio-transcription.js`：导出 provider-neutral 门面和 Azure adapter。
- `src/screen-capture.jsx`：替换 import，接入 `onInterim`，拆分 hint 和 interim transcript。
- `tests/*.test.mjs`：更新讯飞相关测试。
- `README.md`：更新语音转写章节和环境变量。

验收：

- `node --test tests/*.test.mjs` 通过。
- `npm run build` 通过。
- 未配置 Azure 环境变量时，点击录音应回到文本输入并提示“语音识别不可用 · 请手动输入”。
- 配置 Azure 后，真实浏览器录音能实时显示临时结果，停止后正文无重复。

### 阶段 B：可读性优化

目标：在不改变数据结构的前提下改善转写文本质量。

改动：

- 默认开启 TrueText。
- 增加 at-start LID 配置，默认候选 `zh-CN,en-US`。
- `src/ai.js` 现有“修正明显同音错字”继续在保存后 AI 流程中使用，不和 Azure 结果抢职责。
- README 说明“微软后处理 + 砚 AI 整理”的分层。

验收：

- 中文长句有标点。
- 英文整段识别不会被强制当成中文。
- 候选语言配置超过 4 个时，token broker 返回 503 并给出明确 detail。

## 9. 测试策略

### 9.1 单元测试

`tests/audio-transcription.test.mjs` 改为 fake Speech SDK：

- `fetchAzureSpeechSession` 请求 `/api/transcribe`，校验 `provider = azure-speech`。
- `createRealtimeTranscriber.start()` 创建 recognizer 并触发 `connecting -> listening`。
- fake `recognizing` 调用只更新 `onInterim`。
- fake `recognized` 调用只触发 `onTranscript`。
- fake `canceled` 增加 `errorCount`，并调用 `onError`。
- `stop()` 调用 `stopContinuousRecognitionAsync` 并关闭 recognizer。

### 9.2 Cloudflare Function 测试

`tests/cloudflare-functions.test.mjs`：

- 成功时 mock `fetch` 到 Azure STS，断言返回 token session。
- 缺少 `AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION` 或中国区 `AZURE_SPEECH_ENDPOINT` 时返回 503。
- `AZURE_SPEECH_CLOUD=azure-china` 且 region 不在 `chinaeast2 / chinanorth2 / chinanorth3` 时返回 503。
- 中国区 token 签发请求必须命中 `https://<region>.api.cognitive.azure.cn/sts/v1.0/issueToken`。
- 非 GET 返回 405。
- 响应包含 `cache-control: no-store`。

### 9.3 代码质量回归

`tests/code-quality-regressions.test.mjs`：

- 删除“只用讯飞”的断言。
- 新增断言：capture 不直接引用 Azure SDK；只通过 `createRealtimeTranscriber`。
- 新增断言：前端代码不包含 `AZURE_SPEECH_KEY`。
- 保留不回退 Web Speech / Workers AI / Whisper 的约束，避免旧 fallback 回流。

### 9.4 真实浏览器验证

阶段 A 合并前必须跑真实浏览器：

- HTTPS 或 localhost 环境下允许麦克风权限。
- 打开首页，点击录音，确认状态从连接到 listening。
- 说中文短句，确认临时文本出现，停止后正文保留最终文本。
- 取消录音，确认麦克风停止、正文不追加未确认临时文本。
- 未配置环境变量时，确认失败提示和文本输入回退。

## 10. 安全、隐私和部署

- Azure Speech key 只存在 Cloudflare Pages Functions 或本地 Node 环境变量。
- `/api/transcribe` 不缓存，Service Worker 已跳过 `/api/` 流量，继续保持。
- 不保存音频文件，不把音频写入 IndexedDB / WebDAV。
- README 需要说明音频会发送到 Azure AI Speech 进行实时识别，最终只保存文本。
- token 刷新失败不能导致应用卡死；用户至少能停止录音并保存已识别文本。
- 默认按 Azure 中国区配置，`AZURE_SPEECH_ENDPOINT` 必须来自 Azure 中国门户；全球 Azure 需要显式设置 `AZURE_SPEECH_CLOUD=global`。

## 11. 不做项

- 不把 Azure Speech key 存在前端设置页。
- 不新增手动供应商切换 UI；迁移完成后主链路就是 Azure。
- 不保存原始音频。
- 不在第一阶段实现 REST fast transcription。
- 不在第一阶段实现 custom speech model 训练。
- 不做会议/访谈模式，不接入 diarization。
- 不做长语音优化，不接入 semantic segmentation，不新增录音长度归类。
- 不承诺 continuous LID 可以逐词识别同一句里的中英混说。

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| SDK 包体增加 | build 后检查产物；必要时延迟加载 `azure-speech-transcription.js`，只在点击录音时加载 SDK。 |
| 国内网络延迟或 Azure 区域不可用 | README 给出 region / endpoint 配置；验收时用真实移动浏览器测试。 |
| token 10 分钟过期 | 9 分钟刷新 token；刷新失败给用户可恢复提示。 |
| 中间结果重复写正文 | `recognizing` 只覆盖 `interimTranscript`；`recognized` 才 append。 |
| 迁移时旧讯飞测试误导 | 同步更新 code-quality 回归测试，防止“只用讯飞”的旧断言继续约束实现。 |

## 13. 完成标准

本迁移第一阶段完成必须同时满足：

1. 仓库不再包含运行时讯飞语音识别主链路。
2. `src/screen-capture.jsx` 不直接依赖 Azure SDK，只依赖 provider-neutral transcriber。
3. `/api/transcribe` 返回 Azure token session，且不暴露 Speech key。
4. 未配置 Azure 时录音失败可恢复，用户能继续手动输入。
5. 配置 Azure 时真实浏览器录音能完成“实时临时文本 -> 最终正文 -> 保存笔记”流程。
6. `node --test tests/*.test.mjs` 通过。
7. `npm run build` 通过。
8. README 和 docs 不再把讯飞描述为当前语音主方案。
