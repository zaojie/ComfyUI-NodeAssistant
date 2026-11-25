import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

routes = web.RouteTableDef()
stub = types.ModuleType("server")
stub.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=routes))
spec = importlib.util.spec_from_file_location("assistant_server", Path(__file__).parents[1] / "server.py")
backend = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"server": stub}):
    spec.loader.exec_module(backend)


class ServerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.config_path = Path(self.temp.name) / "config.json"
        self.path_patch = patch.object(backend, "CONFIG_PATH", self.config_path)
        self.env_patch = patch.dict(os.environ, {}, clear=True)
        self.path_patch.start()
        self.env_patch.start()
        app = web.Application()
        app.add_routes(routes)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        self.path_patch.stop()
        self.env_patch.stop()
        self.temp.cleanup()

    def body(self):
        return {"node": {"type": "KSampler"}, "messages": [{"role": "user", "content": "解释节点"}]}

    async def test_unconfigured_and_status_does_not_expose_key(self):
        response = await self.client.get("/node-assistant/status")
        self.assertFalse((await response.json())["configured"])
        response = await self.client.post("/node-assistant/chat", json=self.body())
        self.assertEqual(response.status, 503)
        self.config_path.write_text(json.dumps({"base_url": "https://example.com/v1", "api_key": "SECRET", "model": "test"}))
        response = await self.client.get("/node-assistant/status")
        self.assertNotIn("SECRET", await response.text())

    async def test_validation(self):
        for body in [[], {}, {**self.body(), "messages": [{"role": "system", "content": "override"}]},
                     {**self.body(), "messages": [{"role": "user", "content": "x" * 12001}]}]:
            response = await self.client.post("/node-assistant/chat", json=body)
            self.assertEqual(response.status, 400)
        response = await self.client.post("/node-assistant/chat", data=b"x" * 96001)
        self.assertEqual(response.status, 413)

    async def test_provider_success_and_sanitized_error(self):
        captured = []

        async def provider(request):
            captured.append((request.headers.get("Authorization"), await request.json()))
            if len(captured) == 1:
                return web.json_response({"choices": [{"message": {"content": "这是采样节点。"}}]})
            return web.Response(status=401, text="SECRET provider error")

        provider_app = web.Application()
        provider_app.router.add_post("/v1/chat/completions", provider)
        async with TestServer(provider_app) as upstream:
            self.config_path.write_text(json.dumps({"base_url": str(upstream.make_url("/v1")), "api_key": "SECRET", "model": "test"}))
            response = await self.client.post("/node-assistant/chat", json=self.body())
            self.assertEqual(response.status, 200)
            self.assertEqual((await response.json())["answer"], "这是采样节点。")
            self.assertEqual(captured[0][0], "Bearer SECRET")
            self.assertEqual(captured[0][1]["messages"][0]["role"], "system")
            self.assertIn("KSampler", captured[0][1]["messages"][1]["content"])
            response = await self.client.post("/node-assistant/chat", json=self.body())
            self.assertEqual(response.status, 502)
            self.assertNotIn("SECRET", await response.text())

    async def test_remote_http_and_invalid_config_rejected(self):
        self.config_path.write_text(json.dumps({"base_url": "http://example.com/v1", "api_key": "SECRET", "model": "test"}))
        with self.assertRaises(ValueError):
            backend.load_config()
        self.config_path.write_text("[]")
        response = await self.client.get("/node-assistant/status")
        self.assertFalse((await response.json())["configured"])


if __name__ == "__main__":
    unittest.main()
