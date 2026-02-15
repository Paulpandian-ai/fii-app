"""Cross-platform build script for the SharedLayer Lambda layer.

SAM invokes this via the Makefile target `build-SharedLayer`.
Usage: python build.py <ARTIFACTS_DIR>

Steps:
  1. pip install requirements into ARTIFACTS_DIR/python/
  2. Delete packages already provided by the AWSSDKPandas layer or Lambda runtime
  3. Copy shared Python modules into the layer
"""

import glob
import shutil
import subprocess
import sys
from pathlib import Path

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


def main() -> None:
    if len(sys.argv) != 2:
        print(f"Usage: python {sys.argv[0]} <ARTIFACTS_DIR>")
        sys.exit(1)

    artifacts_dir = Path(sys.argv[1])
    python_dir = artifacts_dir / "python"
    script_dir = Path(__file__).parent

    # 1. pip install requirements
    subprocess.check_call([
        sys.executable, "-m", "pip", "install",
        "-r", str(script_dir / "requirements.txt"),
        "-t", str(python_dir),
    ])

    # 2. Delete duplicate packages
    for pkg in EXCLUDE_PACKAGES:
        # Remove the package directory itself
        pkg_path = python_dir / pkg
        if pkg_path.exists():
            shutil.rmtree(pkg_path)
        # Remove dist-info directories (e.g. numpy-1.26.0.dist-info)
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

    # 3. Copy shared Python modules into the layer
    for py_file in glob.glob(str(script_dir / "*.py")):
        py_path = Path(py_file)
        if py_path.name == "build.py":
            continue
        shutil.copy2(py_file, str(python_dir / py_path.name))


if __name__ == "__main__":
    main()
