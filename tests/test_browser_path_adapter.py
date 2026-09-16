import sys
import unittest
from pathlib import Path


SUPPORT = Path(__file__).resolve().parent / "browser_test_support"
sys.path.insert(0, str(SUPPORT))

try:
    from browser_path_adapter import rewrite_launch_kwargs
except ModuleNotFoundError:
    rewrite_launch_kwargs = None


class FakeBrowserType:
    executable_path = "/managed/playwright/chromium"


class BrowserPathAdapterTests(unittest.TestCase):
    def test_redirects_the_v12_linux_path_on_non_linux_hosts(self):
        self.assertIsNotNone(rewrite_launch_kwargs, "browser path adapter is required")
        rewritten = rewrite_launch_kwargs(
            FakeBrowserType(),
            {"executable_path": "/usr/bin/chromium", "headless": True},
            system_name="Darwin",
        )
        self.assertEqual("/managed/playwright/chromium", rewritten["executable_path"])
        self.assertTrue(rewritten["headless"])

    def test_leaves_other_hosts_and_paths_unchanged(self):
        self.assertIsNotNone(rewrite_launch_kwargs, "browser path adapter is required")
        original = {"executable_path": "/usr/bin/chromium"}
        self.assertEqual(
            original,
            rewrite_launch_kwargs(FakeBrowserType(), original, system_name="Linux"),
        )
        self.assertEqual(
            {"executable_path": "/custom/chromium"},
            rewrite_launch_kwargs(
                FakeBrowserType(),
                {"executable_path": "/custom/chromium"},
                system_name="Darwin",
            ),
        )


if __name__ == "__main__":
    unittest.main()
