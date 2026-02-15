"""Cross-platform build script for the SharedLayer Lambda layer.

SAM invokes this via the Makefile target `build-SharedLayer`.
Usage: python build.py <ARTIFACTS_DIR>

Steps:
  1. pip install Linux-compatible (manylinux) wheels into ARTIFACTS_DIR/python/
  2. Fallback pass for pure-Python packages that lack pre-built wheels
  3. Delete packages already provided by the AWSSDKPandas layer or Lambda runtime
  4. Copy shared Python modules into the layer
"""

import glob
import shutil
import subprocess
import sys
from pathlib import Path

# Target Lambda platform
PLATFORM = "manylinux2014_x86_64"
PYTHON_VERSION = "3.12"

# Packages provided by the AWSSDKPandas Lambda layer
AWSSDK_PANDAS_PACKAGES = [
    "numpy",
    "numpy.libs",
    "pandas",
    "pyarrow",
]

# Packages built into the Lambda Python 3.12 runtime
LAMBDA_RUNTIME_PACKAGES = [
    "boto3",
    "botocore",
    "s3transfer",
    "jmespath",
    "urllib3",
    "dateutil",
]

EXCLUDE_PACKAGES = AWSSDK_PANDAS_PACKAGES + LAMBDA_RUNTIME_PACKAGES


def pip_install_linux_wheels(requirements: str, target: str) -> list[str]:
    """Install Linux-compatible binary wheels. Returns list of packages that failed."""
    result = subprocess.run(
        [
            sys.executable, "-m", "pip", "install",
            "-r", requirements,
            "-t", target,
            "--platform", PLATFORM,
            "--only-binary=:all:",
            "--implementation", "cp",
            "--python-version", PYTHON_VERSION,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return []

    # Parse failed packages from pip error output
    # pip reports: "Could not find a version that satisfies the requirement <pkg>"
    # or: "No matching distribution found for <pkg>"
    failed = []
    for line in result.stderr.splitlines():
        lower = line.lower()
        if "no matching distribution" in lower:
            # Extract package name from "No matching distribution found for <pkg>..."
            parts = line.split("for ")
            if len(parts) > 1:
                pkg_spec = parts[-1].strip().rstrip(".")
                pkg_name = pkg_spec.split(">=")[0].split("<=")[0].split("==")[0].split(">")[0].split("<")[0].split("!")[0]
                failed.append(pkg_name.strip())
    return failed


def pip_install_pure_python(packages: list[str], target: str) -> None:
    """Fallback install for pure-Python packages without --only-binary."""
    if not packages:
        return
    print(f"Fallback install for pure-Python packages: {packages}")
    subprocess.check_call([
        sys.executable, "-m", "pip", "install",
        *packages,
        "-t", target,
        "--platform", PLATFORM,
        "--implementation", "cp",
        "--python-version", PYTHON_VERSION,
        "--no-deps",
    ])


def remove_excluded_packages(python_dir: Path) -> None:
    """Delete packages already provided by AWSSDKPandas layer or Lambda runtime."""
    for pkg in EXCLUDE_PACKAGES:
        pkg_path = python_dir / pkg
        if pkg_path.exists():
            shutil.rmtree(pkg_path)
        for dist_info in python_dir.glob(f"{pkg}-*.dist-info"):
            shutil.rmtree(dist_info)
        # Also match underscored names (e.g. python_dateutil-*.dist-info)
        underscored = pkg.replace("-", "_")
        if underscored != pkg:
            for dist_info in python_dir.glob(f"{underscored}-*.dist-info"):
                shutil.rmtree(dist_info)
            pkg_path_u = python_dir / underscored
            if pkg_path_u.exists():
                shutil.rmtree(pkg_path_u)


def copy_shared_modules(script_dir: Path, python_dir: Path) -> None:
    """Copy shared .py modules into the layer (excluding build.py)."""
    for py_file in glob.glob(str(script_dir / "*.py")):
        py_path = Path(py_file)
        if py_path.name == "build.py":
            continue
        shutil.copy2(py_file, str(python_dir / py_path.name))


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: python {sys.argv[0]} <ARTIFACTS_DIR>")
        sys.exit(1)

    artifacts_dir = Path(sys.argv[1])
    python_dir = artifacts_dir / "python"
    script_dir = Path(__file__).parent
    requirements = str(script_dir / "requirements.txt")

    # 1. Install Linux-compatible binary wheels
    print("Installing Linux-compatible wheels...")
    failed = pip_install_linux_wheels(requirements, str(python_dir))

    # 2. Fallback for pure-Python packages that have no pre-built wheels
    if failed:
        pip_install_pure_python(failed, str(python_dir))

    # 3. Delete duplicate packages
    print("Removing duplicate packages...")
    remove_excluded_packages(python_dir)

    # 4. Copy shared Python modules into the layer
    print("Copying shared modules...")
    copy_shared_modules(script_dir, python_dir)

    print("SharedLayer build complete.")


if __name__ == "__main__":
    main()
