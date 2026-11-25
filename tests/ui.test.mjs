import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { renderMarkdown } from "../web/markdown.js";

const { JSDOM } = createRequire(import.meta.url)("jsdom");

test("toolbar opens node dialog; chat is explicit; close discards stale replies", async () => {
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const { window } = dom;
    window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    window.HTMLDialogElement.prototype.close = function () {
        this.open = false;
        this.dispatchEvent(new window.Event("close"));
    };
    let extension;
    const calls = [];
    let pending;
    const app = { canvas: {}, registerExtension: (value) => { extension = value; } };
    const api = { fetchApi: async (path, options) => {
        calls.push({ path, options });
        if (path.endsWith("status")) return { ok: true, json: async () => ({ configured: false }) };
        return new Promise((resolve) => { pending = resolve; });
    } };
    const sandbox = vm.createContext({ document: window.document, URL, AbortController, console });
    const module = new vm.SourceTextModule(await readFile(new URL("../web/assistant.js", import.meta.url), "utf8"), {
        context: sandbox,
        initializeImportMeta(meta) { meta.url = new URL("../web/assistant.js", import.meta.url).href; },
    });
    await module.link(async (specifier) => {
        if (specifier === "./markdown.js") return new vm.SyntheticModule(["renderMarkdown"], function () {
            this.setExport("renderMarkdown", renderMarkdown);
        }, { context: sandbox });
        if (specifier === "./context.js") return new vm.SourceTextModule(
            await readFile(new URL("../web/context.js", import.meta.url), "utf8"), { context: sandbox });
        const name = specifier.includes("app.js") ? "app" : "api";
        return new vm.SyntheticModule([name], function () { this.setExport(name, name === "app" ? app : api); }, { context: sandbox });
    });
    await module.evaluate();
    extension.setup();
    const node = { id: 1, type: "Demo", title: "<img src=x onerror=alert(1)>", mode: 0, inputs: [],
        outputs: [], widgets: [{ name: "prompt", value: "private" }] };
    await extension.beforeRegisterNodeDef(null, { name: "Demo", description: "示例描述" });
    assert.equal(extension.getSelectionToolboxCommands(node)[0], "NodeAssistant.Open");
    assert.equal(extension.getSelectionToolboxCommands({}).length, 0);
    extension.commands[0].function(node);
    const settle = () => new Promise((resolve) => setImmediate(resolve));
    await settle();
    assert.equal(window.document.querySelector("dialog").open, true);
    assert.equal(window.document.querySelector("h2 img"), null);
    assert.match(window.document.querySelector("pre").textContent, /示例描述/);
    assert.equal(calls.filter((c) => c.path.endsWith("chat")).length, 0);
    window.document.querySelector(".na-actions button").click();
    await settle();
    const body = JSON.parse(calls.at(-1).options.body);
    assert.equal(body.node.parameters[0].value, "[未发送参数值]");
    pending({ ok: true, json: async () => ({ answer: "## 节点解释\n\n**加粗**与 `代码`\n\n- 列表" }) });
    await settle();
    assert.match(window.document.querySelector(".na-transcript").textContent, /节点解释/);
    assert.equal(window.document.querySelector(".na-markdown h2").textContent, "节点解释");
    assert.equal(window.document.querySelector(".na-markdown strong").textContent, "加粗");
    assert.equal(window.document.querySelector(".na-markdown li").textContent, "列表");
    window.document.querySelector("textarea").value = "继续解释";
    window.document.querySelector("form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await settle();
    assert.equal(JSON.parse(calls.at(-1).options.body).messages.length, 3);
    window.document.querySelector("dialog").close();
    pending({ ok: true, json: async () => ({ answer: "不应出现的过期结果" }) });
    await settle();
    assert.doesNotMatch(window.document.querySelector(".na-transcript").textContent, /过期结果/);
    dom.window.close();
});

test("Markdown renders GFM while blocking scripts, remote images and unsafe links", () => {
    const dom = new JSDOM("<div id='result'></div>");
    const target = dom.window.document.getElementById("result");
    renderMarkdown(target, "## 标题\n\n**粗体** *斜体* `inline`\n\n1. 一\n2. 二\n\n> 引用\n\n```js\n<script>alert(1)</script>\n```\n\n| 参数 | 值 |\n| --- | --- |\n| steps | 20 |\n\n[正常](https://example.com) [危险](javascript:alert(1))\n\n<img src='https://example.com/track' onerror='alert(1)'><script>alert(1)</script><svg onload='alert(1)'></svg>");
    assert.equal(target.querySelectorAll("ol li").length, 2);
    assert.equal(target.querySelector("td").textContent, "steps");
    assert.equal(target.querySelector("blockquote").textContent.trim(), "引用");
    assert.match(target.querySelector("pre code").textContent, /<script>/);
    assert.equal(target.querySelectorAll("script,img,svg,[onerror],[onload]").length, 0);
    assert.equal(target.querySelector("a").getAttribute("rel"), "noopener noreferrer");
    assert.equal(target.querySelectorAll('a[href^="javascript:"]').length, 0);
    dom.window.close();
});
