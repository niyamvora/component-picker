#!/bin/sh
# Cut a release: ./release.sh 0.2.0
# Moves CHANGELOG "Unreleased" under the new version, bumps VERSION + manifest.json,
# commits, tags vX.Y.Z, zips the extension and publishes a GitHub Release from the changelog block.
set -e
cd "$(dirname "$0")"
V="$1"; [ -n "$V" ] || { echo "usage: $0 X.Y.Z"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "commit or stash changes first"; exit 1; }
./check.sh | grep -q '^PASS' || { echo "check.sh failed"; exit 1; }
node e2e.mjs | grep -q '^PASS' || { echo "e2e.mjs failed"; exit 1; }
DATE=$(date +%Y-%m-%d)
printf '%s\n' "$V" > VERSION
sed -i '' "s/\"version\": \"[0-9.]*\"/\"version\": \"$V\"/" manifest.json
PREV=$(git describe --tags --abbrev=0 2>/dev/null || echo v0.0.0)
sed -i '' "s|^## \[Unreleased\]|## [Unreleased]\n\n## [$V] — $DATE|; s|^\[Unreleased\]: .*|[Unreleased]: https://github.com/niyamvora/component-picker/compare/v$V...main\n[$V]: https://github.com/niyamvora/component-picker/compare/$PREV...v$V|" CHANGELOG.md
NOTES=$(awk "/^## \[$V\]/{f=1;next} /^## \[/{f=0} f" CHANGELOG.md)
git add VERSION manifest.json CHANGELOG.md
git commit -qm "release: v$V"
git tag "v$V"
git push -q origin main "v$V"
ZIP="component-picker-$V.zip"
zip -q "$ZIP" manifest.json background.js picker.js README.md
gh release create "v$V" "$ZIP" --title "Component Picker $V" --notes "$NOTES"
rm "$ZIP"
echo "released v$V"
