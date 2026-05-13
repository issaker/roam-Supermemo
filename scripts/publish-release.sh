#!/usr/bin/env bash
set -euo pipefail

RELEASE_REPO="https://github.com/issaker/roam-Supermemo-release.git"
RELEASE_DIR=".release-repo"
FILES_TO_PUBLISH=("extension.js" "standalone.js" "README.md")

MAIN_BRANCH=$(git branch --show-current)
if [ -z "$MAIN_BRANCH" ]; then
  MAIN_BRANCH="main"
fi

echo "==> 1/5 Building project..."
npm run build

if [ ! -f "extension.js" ]; then
  echo "ERROR: extension.js not found after build"
  exit 1
fi
if [ ! -f "standalone.js" ]; then
  echo "ERROR: standalone.js not found after build"
  exit 1
fi

echo "==> 2/5 Preparing release repo..."
if [ -d "$RELEASE_DIR" ]; then
  cd "$RELEASE_DIR"
  git fetch origin 2>/dev/null || true
  git reset --hard "origin/$MAIN_BRANCH" 2>/dev/null || true
  cd ..
else
  git clone "$RELEASE_REPO" "$RELEASE_DIR"
fi

echo "==> 3/5 Copying files..."
for f in "${FILES_TO_PUBLISH[@]}"; do
  if [ ! -f "$f" ]; then
    echo "WARNING: $f not found, skipping"
    continue
  fi
  cp "$f" "$RELEASE_DIR/$f"
  echo "  copied $f"
done

echo "==> 4/5 Committing to release repo..."
cd "$RELEASE_DIR"
git add -A
if git diff --cached --quiet; then
  echo "No changes to publish."
  cd ..
  exit 0
fi

VERSION=$(node -p "require('../package.json').version")
COMMIT_MSG="release v${VERSION}"
git commit -m "$COMMIT_MSG"

echo "==> 5/5 Pushing to release repo (public)..."
git push origin "$MAIN_BRANCH"
cd ..

echo "==> Done! v${VERSION} published."
echo ""
echo "Next steps:"
echo "  1. Commit & push source changes to main repo manually:"
echo "     git add -A && git commit -m 'your message' && git push"
echo "  2. Users can now load from:"
echo "     https://cdn.jsdelivr.net/gh/issaker/roam-Supermemo-release@main/standalone.js"
echo "     https://raw.githubusercontent.com/issaker/roam-Supermemo-release/main/standalone.js"