#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="${1:-.local/runtime-libs}"
DEBS_DIR="${ROOT_DIR}/debs"
EXTRACT_DIR="${ROOT_DIR}/root"

mkdir -p "${DEBS_DIR}" "${EXTRACT_DIR}"

pushd "${DEBS_DIR}" >/dev/null
apt-get download libnspr4 libnss3 libasound2t64
popd >/dev/null

for deb in "${DEBS_DIR}"/*.deb; do
  dpkg-deb -x "${deb}" "${EXTRACT_DIR}"
done

echo "Runtime libs extracted to: ${EXTRACT_DIR}/usr/lib/x86_64-linux-gnu"
