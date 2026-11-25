# ComfyUI 节点助手

在节点浮动工具栏添加 **✦「解释节点 / AI 对话」**，点击打开中文弹窗。也可以右键节点选择同名菜单。

无需配置 API 即可查看节点自身描述、当前参数、直接上下游连接。配置兼容 Chat Completions 协议的大模型 API 后，可以解释节点、询问连接方法、讨论参数并连续追问。插件不会执行或修改工作流。助手回复支持 Markdown 标题、加粗、列表、引用、代码块和表格；用户问题仍以纯文本显示。渲染使用随包附带的 marked 18.3.0 与 DOMPurify 3.5.0，无需访问 CDN。

## 从 GitHub 安装

在 ComfyUI 的 `custom_nodes` 目录执行：

```bash
git clone https://github.com/zaojie/ComfyUI-NodeAssistant.git
```

然后重启 ComfyUI 服务并刷新浏览器。更新时进入插件目录执行 `git pull`，个人 `config.json` 不受影响。

## ZIP 安装到 AutoDL / 本地 ComfyUI

1. 找到实际运行的 ComfyUI 目录，里面应有 `main.py` 和 `custom_nodes`。不同整合包路径可能不同。
2. 将本插件文件夹放到 `custom_nodes/ComfyUI-NodeAssistant`，确保 `__init__.py` 直接位于该目录下，不要多套一层文件夹。
3. 重启 **ComfyUI 服务**，再刷新浏览器。仅刷新网页不会加载新增 Python 路由。
4. 选中一个节点，在上方工具栏点击 **✦**；或右键 → **解释节点 / AI 对话**。

如果上传的是发布 ZIP，可在 JupyterLab 终端执行（先把路径换成真实路径）：

```bash
unzip ComfyUI-NodeAssistant.zip -d /实际路径/ComfyUI/custom_nodes/
```

插件仅依赖 ComfyUI 已使用的 `aiohttp`，无需额外安装大模型 SDK，也无需下载模型。

## 配置大模型 API

将插件目录下的 `config.example.json` 复制为 **`config.json`**，编辑：

```json
{
  "base_url": "https://你的服务商域名/v1",
  "api_key": "你的 API 密钥",
  "model": "服务商提供的模型 ID"
}
```

`base_url` 填接口根地址，插件会在后面加 `/chat/completions`，不要重复填写该后缀。服务商地址不一定包含 `/v1`，以其文档为准。远程服务须使用 HTTPS；本机 HTTP 服务只允许 localhost/127.0.0.1/::1。第一版支持文本、非流式 Chat Completions；原生 Anthropic / Gemini 等不同协议需使用兼容接口。

也可使用环境变量覆盖上述配置：

- `NODE_ASSISTANT_BASE_URL`
- `NODE_ASSISTANT_API_KEY`
- `NODE_ASSISTANT_MODEL`

保存配置文件后，重新打开助手即可，无需重启。环境变量要在启动 ComfyUI 前设置。密钥只在后端读取，不返回浏览器，不写入工作流；`config.json` 已加入 Git 忽略规则。

## 使用和数据范围

- 点选节点 → 工具栏 ✦ → 查看基础信息 → 点击「解释这个节点」或输入问题。
- **只有点击提问才会调用付费 API**。打开弹窗本身不会调用模型。
- 默认发送节点类型、标题、描述、插槽、参数名称和直接邻居信息。参数值默认不发送，勾选后才发送，可能包含提示词和文件名。
- 密钥、token、password 等常见敏感字段按名称过滤，但无法识别所有自定义命名或正文里的秘密。发送前检查内容。
- 不发送图片、视频、完整工作流、节点源码或运行日志；因此助手无法看到实际图像或确认内部实现。
- 每次提问重新读取当前节点信息。界面上的基础信息在重新打开弹窗时刷新。
- 对话按节点保存在当前网页内存中，保留最近 10 轮；刷新网页即清空，不写入工作流或磁盘。
- Esc / 关闭退出；Ctrl / ⌘ + Enter 发送。「停止等待」停止浏览器等待，已发往模型的请求可能仍计费。

## 兼容性与排错

使用 ComfyUI 官方 `getSelectionToolboxCommands`、`getNodeMenuItems` 扩展接口，不修改 ComfyUI 源码。

- 没有 ✦：检查设置 `Comfy.Canvas.SelectionToolbox` 是否启用、插件前端是否启用，强制刷新后重试；也可使用右键菜单。
- 两个入口都没有：检查启动日志中的插件导入错误；旧版整合包可能需要更新前端，更新前先备份。
- 提示后端未加载：确认插件层级并重启 ComfyUI 服务。
- HTTP 401/403：检查密钥及权限；404：检查地址和模型 ID；429：检查额度或服务商限流。
- 未知自定义节点不保证有说明。插件会展示现有元数据，AI 会被要求区分事实与推测。
- 普通节点是首版目标；子图显示直接边界连接，不递归展开内部节点。

**部署边界：** 本插件沿用 ComfyUI / AutoDL 入口访问控制，没有独立用户鉴权。能访问此实例的人都能使用已配置的 API 额度。不要将带密钥的实例公开分享；发布 ZIP 不包含你的 `config.json`。

## 开发验证

```bash
python3 -m unittest discover -s tests -v
node --test tests/context.test.mjs
node --check web/assistant.js
```

Python 测试需 `aiohttp`（ComfyUI 环境已自带）。HTTP 测试使用本机模拟服务，不调用真实付费 API。

可选 UI 冒烟测试需开发依赖 `jsdom`（插件运行不需要）：安装后执行 `node --experimental-vm-modules --test tests/ui.test.mjs`。测试模拟 ComfyUI 扩展宿主与 DOM，覆盖入口、弹窗、发送、多轮历史和关闭后的过期响应；不代替真实整合包验收。

官方接口文档：https://docs.comfy.org/custom-nodes/js/javascript_selection_toolbox
