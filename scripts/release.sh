#!/bin/sh
# Cut a release: ./scripts/release.sh 0.2.0
# Bumps VERSION (the single source of truth — build.mjs stamps it into the manifest), moves the
# CHANGELOG's Unreleased block under the new version, tags, zips dist/ and publishes the Release.
set -e
cd "$(dirname "$0")/.."
V="$1"; [ -n "$V" ] || { echo "usage: $0 X.Y.Z"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "commit or stash changes first"; exit 1; }
npm run typecheck
./test/check.sh | grep -q '^PASS' || { echo "test/check.sh failed"; exit 1; }
node test/e2e.mjs | grep -q '^PASS' || { echo "test/e2e.mjs failed"; exit 1; }
DATE=$(date +%Y-%m-%d)
PREV=$(git describe --tags --abbrev=0 2>/dev/null || echo v0.0.0)
printf '%s\n' "$V" > VERSION
npm version "$V" --no-git-tag-version --allow-same-version >/dev/null
# Both edits are skipped when they have already been made, because a release whose notes were
# written in the PR that earned them arrives here with its heading in place. Inserting a second one
# would leave a duplicate heading and publish empty release notes from the empty half.
grep -q "^## \[$V\]" CHANGELOG.md \
  || sed -i '' "s|^## \[Unreleased\]|## [Unreleased]\n\n## [$V] — $DATE|" CHANGELOG.md
grep -q "^\[$V\]:" CHANGELOG.md \
  || sed -i '' "s|^\[Unreleased\]: .*|[Unreleased]: https://github.com/niyamvora/component-picker/compare/v$V...main\n[$V]: https://github.com/niyamvora/component-picker/compare/$PREV...v$V|" CHANGELOG.md
NOTES=$(awk "/^## \\[$V\\]/{f=1;next} /^## \\[/{f=0} f" CHANGELOG.md)
[ -n "$(printf '%s' "$NOTES" | tr -d '[:space:]')" ] || { echo "CHANGELOG has no notes under [$V]"; exit 1; }
npm run build
git add VERSION package.json CHANGELOG.md
# Nothing to commit when the version and notes were already landed; the tag is still the point.
git diff --cached --quiet || git commit -qm "release: v$V"
git tag "v$V"
git push -q origin main "v$V"
ZIP="component-picker-$V.zip"
FFZIP="component-picker-firefox-$V.zip"
(cd dist && zip -qr "../$ZIP" .)
(cd dist-firefox && zip -qr "../$FFZIP" .)
gh release create "v$V" "$ZIP" "$FFZIP" --title "Component Picker $V" --notes "$NOTES"
rm "$ZIP" "$FFZIP"
echo "released v$V"
