"""Test-only compatibility for the V1.2 Chromium launch path."""


LINUX_CHROMIUM_PATH = "/usr/bin/chromium"


def rewrite_launch_kwargs(browser_type, kwargs, system_name):
    """Use Playwright's managed Chromium only for the V1.2 Linux path off Linux."""
    rewritten = dict(kwargs)
    if system_name != "Linux" and rewritten.get("executable_path") == LINUX_CHROMIUM_PATH:
        rewritten["executable_path"] = browser_type.executable_path
    return rewritten
