#!env bash

spacedir="$1"

if [ -z "$spacedir" ]; then
  echo "Usage: $0 <space-directory>"
  exit 1
fi

mkdir -pv "$spacedir"/_plug
cd "$spacedir"/_plug
ln -sv ../../silverbullet-ai.plug.js* .
cd -

cd "$spacedir"
ln -sv ../docs/Library .
cd -

# This is a local file outside of the sbai directory
cp -v ../test-spaces/SECRETS.md "$spacedir"/
cp -v ../test-spaces/SETTINGS.md "$spacedir"/