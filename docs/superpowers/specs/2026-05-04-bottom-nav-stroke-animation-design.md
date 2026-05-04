# 底栏图标描边绘制动画设计

## 目标

为底部导航栏的四个图标（记、本、砚、设）添加切换时的 SVG 描边绘制动画，增强交互反馈和视觉表现力。

## 视觉行为

- **切换到某 tab 时**：该图标的 SVG 描边从无到有逐渐绘制（stroke-dashoffset 动画），约 400ms
- **颜色过渡**：从 `ink-mute` 渐变到 `seal`（选中色），与描边动画同步
- **切换离开时**：颜色淡出回 `ink-mute`，无反向描边动画
- **未选中图标**：保持静态，无动画

## 技术方案

### 修改文件

1. **src/components.jsx** — `BottomNav` 组件
   - 添加 `useRef` 追踪上一个 active 值
   - 添加 `useEffect` 监听 active 变化，对新选中图标的 SVG paths 触发描边动画
   - 动画触发逻辑：遍历目标按钮内所有 `<path>` 和 `<circle>` 等可描边元素，计算 `getTotalLength()`，设置 `stroke-dasharray` 和初始 `stroke-dashoffset`，然后通过 CSS transition 动画到 0

2. **styles.css** — 添加动画相关样式
   - `.nav-btn svg path, .nav-btn svg circle, .nav-btn svg rect` 添加 `transition: stroke-dashoffset 0.4s ease-out, stroke 0.25s ease`
   - 确保非选中态的 SVG 元素没有 dasharray/dashoffset 残留

### 实现要点

- 使用原生 `SVGGeometryElement.getTotalLength()` API
- 动画触发后需清除 `stroke-dasharray`/`stroke-dashoffset`（设为空字符串），避免后续重绘异常
- 只在 active 真正变化时触发动画，避免首次渲染时播放
- 四个图标的路径长度不同，动态计算而非硬编码
