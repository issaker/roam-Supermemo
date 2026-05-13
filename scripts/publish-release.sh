#!/usr/bin/env bash
set -euo pipefail

RELEASE_REPO="https://github.com/issaker/roam-Supermemo-release.git"
RELEASE_DIR=".release-repo"
FILES_TO_PUBLISH=("extension.js" "standalone.js" "README.md")

echo "==> 1/7 Building project..."
npm run build

if [ ! -f "extension.js" ]; then
  echo "ERROR: extension.js not found after build"
  exit 1
fi
if [ ! -f "standalone.js" ]; then
  echo "ERROR: standalone.js not found after build"
  exit 1
fi

echo "==> 2/7 Committing & pushing to main repo (private)..."
MAIN_BRANCH=$(git branch --show-current)
if [ -z "$MAIN_BRANCH" ]; then
  MAIN_BRANCH="main"
fi

if git diff --quiet && git diff --cached --quiet; then
  echo "  No uncommitted changes in main repo."
else
  git add -A
  git commit -m "build: update source $(date '+%Y-%m-%d %H:%M')" || true
fi

git push origin "$MAIN_BRANCH"
echo "  Main repo pushed."

echo "==> 3/7 Preparing release repo..."
if [ -d "$RELEASE_DIR" ]; then
  cd "$RELEASE_DIR"
  git fetch origin 2>/dev/null || true
  git reset --hard "origin/$(git branch --show-current)" 2>/dev/null || true
  cd ..
else
  git clone "$RELEASE_REPO" "$RELEASE_DIR"
fi

echo "==> 4/7 Copying files..."
for f in "${FILES_TO_PUBLISH[@]}"; do
  if [ ! -f "$f" ]; then
    echo "WARNING: $f not found, skipping"
    continue
  fi
  cp "$f" "$RELEASE_DIR/$f"
  echo "  copied $f"
done

echo "==> 5/7 Committing to release repo..."
cd "$RELEASE_DIR"
git add -A
if git diff --cached --quiet; then
  echo "No changes to publish."
  cd ..
  exit 0
fi

VERSION=$(node -p "require('../package.json').version")
COMMIT_MSG="release v${VERSION} — $(date '+%Y-%m-%d %H:%M')"
git commit -m "$COMMIT_MSG"

echo "==> 6/7 Pushing to release repo (public)..."
git push origin "$(git branch --show-current)"
cd ..

echo "==> 7/7 Tagging..."
git tag "v${VERSION}" -f 2>/dev/null || git tag "v${VERSION}"
git push origin "v${VERSION}" -f 2>/dev/null || git push origin "v${VERSION}"

echo "==> Done! v${VERSION} published to release repo."
