const sensitive = /api.?key|token|secret|password|authorization|credential/i;
const clip = (value, size = 2000) => String(value ?? "").slice(0, size);

export function isNode(item) {
    return !!item && item.id != null && typeof item.type === "string" && Array.isArray(item.inputs);
}

export function snapshot(node, definition = {}, includeValues = false) {
    const graph = node.graph;
    const linkById = (id) => graph?.links?.get?.(id) ?? graph?.links?.[id];
    const neighbor = (id) => {
        const other = graph?.getNodeById(id);
        return other ? { id: other.id, type: other.comfyClass || other.type, title: clip(other.title, 200) } : { id };
    };
    return {
        id: node.id,
        type: node.comfyClass || node.type,
        title: clip(node.title, 200),
        description: clip(definition.description, 6000),
        category: clip(definition.category, 200),
        mode: ({ 0: "正常", 2: "禁用", 4: "旁路" })[node.mode] ?? String(node.mode),
        inputs: (node.inputs || []).slice(0, 64).map((input) => {
            const link = input.link != null ? linkById(input.link) : null;
            return { name: clip(input.name, 200), type: clip(input.type, 200),
                from: link ? { ...neighbor(link.origin_id), output_slot: link.origin_slot } : null };
        }),
        outputs: (node.outputs || []).slice(0, 64).map((output) => ({
            name: clip(output.name, 200), type: clip(output.type, 200),
            to: (output.links || []).slice(0, 32).map(linkById).filter(Boolean)
                .map((link) => ({ ...neighbor(link.target_id), input_slot: link.target_slot })),
        })),
        parameters: (node.widgets || []).filter((w) => w.type !== "button").slice(0, 80).map((widget) => ({
            name: clip(widget.name, 200),
            value: sensitive.test(widget.name) || widget.type === "password" ? "[敏感字段已隐藏]"
                : !includeValues ? "[未发送参数值]"
                    : ["string", "number", "boolean"].includes(typeof widget.value) ? clip(widget.value) : "[非文本值]",
        })),
    };
}

export function describe(info) {
    const input = info.inputs.map((i) => `${i.name} (${i.type}) ← ${i.from ? `${i.from.title || i.from.type || i.from.id} #${i.from.id}` : "未连接"}`).join("\n");
    const output = info.outputs.map((o) => `${o.name} (${o.type}) → ${o.to.length ? o.to.map((n) => `${n.title || n.type || n.id} #${n.id}`).join("、") : "未连接"}`).join("\n");
    return [info.description || "该节点未提供功能描述。接入 AI 后可辅助分析；仅凭名称无法确定自定义节点的内部行为。",
        `当前状态：${info.mode}`,
        `输入与来源\n${input || "无输入插槽"}`,
        `输出与去向\n${output || "无输出插槽"}`,
        `当前参数（仅本地展示）\n${info.parameters.map((p) => `${p.name}: ${p.value}`).join("\n") || "无参数"}`,
    ].join("\n\n");
}
