from . import server  # Register HTTP routes when ComfyUI loads this extension.

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
__all__ = ["WEB_DIRECTORY", "NODE_CLASS_MAPPINGS"]
