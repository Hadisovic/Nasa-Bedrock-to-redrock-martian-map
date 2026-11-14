"""Existing manual-board posting regression; fake GitHub, no network or models."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class BoardChecks(unittest.TestCase):
    def test_posting_identity_and_legacy_prefixes(self):
        # Exercise the real board's posting validation with a fake gh executable.
        bash = Path(os.environ.get("PROGRAMFILES", "C:/Program Files")) / "Git/bin/bash.exe"
        if os.name != "nt":
            bash = Path("/bin/bash")
        self.assertTrue(bash.exists(), "Git Bash is required for the existing board check")
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory) / "gh"
            fake.write_text('#!/bin/sh\ncase "$*" in *--jq\\ .full_name*) echo owner/repo;; *api\\ user*) echo worker-one;; *) echo https://example.invalid/comment;; esac\n', encoding="utf-8")
            fake.chmod(0o755)
            env = dict(os.environ, BOARD_REPO="owner/repo", PATH=directory + os.pathsep + os.environ["PATH"])
            for prefix in ("[worker-one-infrastructure]", "[worker-one-infrastructure-review]", "[Hadi's Codex]"):
                run = subprocess.run([str(bash), str(ROOT / "tools/board"), "post", prefix + " update"],
                                     env=env, cwd=directory, capture_output=True, text=True)
                self.assertEqual(run.returncode, 0, run.stderr)
            run = subprocess.run([str(bash), str(ROOT / "tools/board"), "post", "[Hadisovic-lead] spoof"],
                                 env=env, cwd=directory, capture_output=True, text=True)
            self.assertNotEqual(run.returncode, 0)
            run = subprocess.run([str(bash), str(ROOT / "tools/board"), "wait"],
                                 env=env, cwd=directory, capture_output=True, text=True)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("wait is retired", run.stderr)


if __name__ == "__main__":
    unittest.main()
