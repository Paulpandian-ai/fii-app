# SAM invokes `make build-SharedLayer` when BuildMethod is makefile.
# The ARTIFACTS_DIR variable is set by SAM to the build output directory.

build-SharedLayer:
	pip install -r requirements.txt -t "$(ARTIFACTS_DIR)/python/"
	# Remove packages already provided by the AWSSDKPandas Lambda layer
	rm -rf "$(ARTIFACTS_DIR)/python/numpy"
	rm -rf "$(ARTIFACTS_DIR)/python/numpy.libs"
	rm -rf "$(ARTIFACTS_DIR)/python/numpy-"*.dist-info
	rm -rf "$(ARTIFACTS_DIR)/python/pandas"
	rm -rf "$(ARTIFACTS_DIR)/python/pandas-"*.dist-info
	rm -rf "$(ARTIFACTS_DIR)/python/pyarrow"
	rm -rf "$(ARTIFACTS_DIR)/python/pyarrow-"*.dist-info
	# Remove packages built into the Lambda Python 3.12 runtime
	rm -rf "$(ARTIFACTS_DIR)/python/boto3"
	rm -rf "$(ARTIFACTS_DIR)/python/boto3-"*.dist-info
	rm -rf "$(ARTIFACTS_DIR)/python/botocore"
	rm -rf "$(ARTIFACTS_DIR)/python/botocore-"*.dist-info
	rm -rf "$(ARTIFACTS_DIR)/python/s3transfer"
	rm -rf "$(ARTIFACTS_DIR)/python/s3transfer-"*.dist-info
	rm -rf "$(ARTIFACTS_DIR)/python/jmespath"
	rm -rf "$(ARTIFACTS_DIR)/python/jmespath-"*.dist-info
	rm -rf "$(ARTIFACTS_DIR)/python/urllib3"
	rm -rf "$(ARTIFACTS_DIR)/python/urllib3-"*.dist-info
	rm -rf "$(ARTIFACTS_DIR)/python/dateutil"
	rm -rf "$(ARTIFACTS_DIR)/python/python_dateutil-"*.dist-info
	# Copy shared Python modules into the layer
	cp -r *.py "$(ARTIFACTS_DIR)/python/"
