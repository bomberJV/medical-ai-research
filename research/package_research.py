"""Create a ZIP of the committed project source from the current revision."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "medical-ai-research-source.zip"
subprocess.run(["git", "archive", "--format=zip", "--prefix=medical-ai-research/",
                "-o", str(ARCHIVE), "HEAD"], cwd=ROOT, check=True)
print(ARCHIVE)
