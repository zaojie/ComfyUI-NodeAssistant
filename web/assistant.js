import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { isNode, snapshot, describe } from "./context.js";
import { renderMarkdown } from "./markdown.js";

const definitions = new Map();
const conversations = new WeakMap();
let dialog;
let current;
let controller;
let generation = 0;
let transcript, summary, heading, status, question, send, includeValues;

function element(tag, text, parent, className) {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    parent?.append(el);
    return el;
}

function history() {
    if (!conversations.has(current)) conversations.set(current, []);
    return conversations.get(current);
}

function renderHistory() {
    transcript.replaceChildren();
    for (const message of history()) {
        const row = element("div", null, transcript, `na-message na-${message.role}`);
        element("strong", message.role === "user" ? "你" : "节点助手", row);
        const body = element("div", message.content, row);
        if (message.role === "assistant") {
            body.className = "na-markdown";
            renderMarkdown(body, message.content);
        }
    }
    transcript.scrollTop = transcript.scrollHeight;
}

function cancel() {
    generation++;
    controller?.abort();
    controller = null;
    if (send) send.disabled = false;
}

function context(include) {
    return snapshot(current, definitions.get(current.comfyClass || current.type), include);
}

async function submit(text) {
    if (!text.trim() || send.disabled) return;
    const messages = history();
    if (text.length > 12000) {
        status.textContent = "问题过长，请控制在 12000 字符内。";
        return;
    }
    const next = [...messages.slice(-18), { role: "user", content: text.trim() }];
    const requestId = ++generation;
    controller = new AbortController();
    send.disabled = true;
    status.textContent = "正在请求 AI…";
    try {
        const response = await api.fetchApi("/node-assistant/chat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node: context(includeValues.checked), messages: next }),
            signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (typeof data.answer !== "string") throw new Error("模型响应缺少文本。");
        if (requestId !== generation) return;
        messages.push(next.at(-1), { role: "assistant", content: data.answer });
        if (messages.length > 20) messages.splice(0, messages.length - 20);
        question.value = "";
        status.textContent = "回答完成 · AI 建议请结合实际节点核对";
        renderHistory();
    } catch (error) {
        if (requestId === generation && error.name !== "AbortError") status.textContent = error.message;
    } finally {
        if (requestId === generation) { send.disabled = false; controller = null; }
    }
}

function buildDialog() {
    const css = element("link", null, document.head);
    css.rel = "stylesheet";
    css.href = new URL("./style.css?v=2", import.meta.url).href;
    dialog = element("dialog", null, document.body, "na-dialog");
    dialog.setAttribute("aria-labelledby", "na-heading");
    const header = element("header", null, dialog);
    const title = element("div", null, header);
    element("small", "NODE ASSISTANT / 节点助手", title);
    heading = element("h2", "", title);
    heading.id = "na-heading";
    const close = element("button", "关闭", header);
    close.onclick = () => dialog.close();
    dialog.addEventListener("close", cancel);
    const details = element("details", null, dialog, "na-details");
    details.open = true;
    element("summary", "节点说明 · 当前参数 · 连接关系", details);
    summary = element("pre", "", details);
    const actions = element("div", null, dialog, "na-actions");
    for (const [label, prompt] of [
        ["解释这个节点", "解释这个节点现在的作用、当前参数的意义，以及它能做什么。"],
        ["怎么连接", "根据当前输入和输出，解释这个节点应该如何连接，哪些地方需要检查？"],
        ["参数怎么调", "解释关键参数如何调整，以及分别会影响什么。缺少参数值时不要猜测。"],
    ]) {
        const button = element("button", label, actions);
        button.onclick = () => submit(prompt);
    }
    transcript = element("div", null, dialog, "na-transcript");
    transcript.setAttribute("role", "log");
    transcript.setAttribute("aria-live", "polite");
    const privacy = element("label", null, dialog, "na-privacy");
    includeValues = element("input", null, privacy);
    includeValues.type = "checkbox";
    privacy.append(document.createTextNode("向 AI 发送当前参数值（可能包含提示词和文件名）"));
    element("small", "发送时会附带节点描述、名称及直接连接信息；不上传图片和完整工作流。", dialog, "na-note");
    const form = element("form", null, dialog);
    question = element("textarea", null, form);
    question.placeholder = "问问这个节点…（Ctrl / ⌘ + Enter 发送）";
    question.setAttribute("aria-label", "向节点助手提问");
    question.maxLength = 12000;
    question.rows = 3;
    question.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault(); submit(question.value);
        }
        event.stopPropagation();
    });
    const footer = element("div", null, form, "na-actions");
    send = element("button", "发送", footer, "na-primary");
    send.type = "submit";
    const stop = element("button", "停止等待", footer);
    stop.type = "button";
    stop.onclick = () => { cancel(); status.textContent = "已停止等待；服务端请求可能仍在完成。"; };
    const clear = element("button", "清空对话", footer);
    clear.type = "button";
    clear.onclick = () => { cancel(); conversations.delete(current); renderHistory(); status.textContent = "对话已清空。"; };
    form.onsubmit = (event) => { event.preventDefault(); submit(question.value); };
    status = element("div", "", dialog, "na-status");
    status.setAttribute("role", "status");
}

async function openAssistant(node) {
    if (!isNode(node)) return;
    if (!dialog) buildDialog();
    cancel();
    current = node;
    question.value = "";
    includeValues.checked = false;
    heading.textContent = `${node.title || node.type} · #${node.id}`;
    summary.textContent = describe(context(true));
    renderHistory();
    if (!dialog.open) dialog.showModal();
    question.focus();
    status.textContent = "检查 API 配置…";
    const requestId = generation;
    try {
        const response = await api.fetchApi("/node-assistant/status");
        if (!response.ok) throw new Error("插件后端未加载，请重启 ComfyUI 并检查启动日志。");
        const data = await response.json();
        if (requestId !== generation) return;
        status.textContent = data.configured ? `API 已配置：${data.model} · 点击提问才会调用 API`
            : data.error || "基础查看模式 · 在插件目录配置 config.json 后即可与 AI 对话，无需重启。";
    } catch (error) {
        if (requestId === generation) status.textContent = error.message;
    }
}

app.registerExtension({
    name: "NodeAssistant.ExplainAndChat",
    async beforeRegisterNodeDef(nodeType, nodeData) { definitions.set(nodeData.name, nodeData); },
    commands: [{
        id: "NodeAssistant.Open", label: "解释节点 / AI 对话", icon: "na-toolbar-icon",
        function: (item) => {
            const selected = [...(app.canvas.selectedItems || Object.values(app.canvas.selected_nodes || {}))].filter(isNode);
            openAssistant(isNode(item) ? item : selected[0]);
        },
    }],
    getSelectionToolboxCommands(item) { return isNode(item) ? ["NodeAssistant.Open"] : []; },
    getNodeMenuItems(node) { return [{ content: "解释节点 / AI 对话", callback: () => openAssistant(node) }]; },
    setup() {
        const style = element("style", null, document.head);
        style.textContent = '.na-toolbar-icon::before { content: "✦"; font-style: normal; font-size: 18px; color: #7dd3fc; }';
    },
});
