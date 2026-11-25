import test from "node:test";
import assert from "node:assert/strict";
import { snapshot, describe, isNode } from "../web/context.js";

function fixture() {
    return {
        id: 3, type: "KSampler", title: "采样", mode: 4,
        inputs: [{ name: "model", type: "MODEL", link: 0 }],
        outputs: [{ name: "LATENT", type: "LATENT", links: [1] }],
        widgets: [{ name: "seed", value: 123 }, { name: "api_key", value: "secret" },
            { name: "prompt", value: "private prompt" }, { name: "nested", value: {} }],
        graph: {
            links: { 0: { origin_id: 1, origin_slot: 0 }, 1: { target_id: 5, target_slot: 0 } },
            getNodeById: (id) => ({ id, type: "Neighbor", title: "邻居" }),
        },
    };
}

test("default context excludes values and always redacts credentials", () => {
    const node = fixture();
    assert.equal(snapshot(node).parameters[0].value, "[未发送参数值]");
    const info = snapshot(node, { description: "采样描述" }, true);
    assert.equal(info.parameters[0].value, "123");
    assert.equal(info.parameters[1].value, "[敏感字段已隐藏]");
    assert.equal(info.parameters[3].value, "[非文本值]");
    assert.ok(!JSON.stringify(info).includes("secret"));
    assert.equal(info.inputs[0].from.id, 1);
    assert.equal(info.outputs[0].to[0].id, 5);
    assert.match(describe(info), /旁路/);
    assert.match(describe(info), /采样描述/);
});

test("Map links, disconnected inputs, unknown metadata and groups", () => {
    const node = fixture();
    node.graph.links = new Map(Object.entries(node.graph.links).map(([key, value]) => [Number(key), value]));
    assert.equal(snapshot(node).inputs[0].from.id, 1);
    node.inputs[0].link = null;
    assert.equal(snapshot(node).inputs[0].from, null);
    assert.match(describe(snapshot(node)), /未提供功能描述/);
    assert.equal(isNode(node), true);
    assert.equal(isNode({ title: "group", id: 1 }), false);
});
