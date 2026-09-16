"""Loaded only by tests/run-browser-regressions.py through PYTHONPATH."""

import platform

from playwright.sync_api import BrowserType

from browser_path_adapter import rewrite_launch_kwargs


_original_launch = BrowserType.launch


def _portable_launch(self, *args, **kwargs):
    return _original_launch(
        self,
        *args,
        **rewrite_launch_kwargs(self, kwargs, platform.system()),
    )


BrowserType.launch = _portable_launch
