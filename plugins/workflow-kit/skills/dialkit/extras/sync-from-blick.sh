#!/bin/sh
# Pull Seb's latest DialKit patch and plugins from Blick (the reference project) into this skill.
# Copies only files that are newer in Blick. Run before every DialKit setup.
B="/Users/seb/learning-art/learn-about-art"
K="$(cd "$(dirname "$0")" && pwd)"
[ -d "$B/dialkit-patch" ] || { echo "Blick not found at $B; using the skill's bundled copy"; exit 0; }
for f in dialkit-patch/plugin.js dialkit-patch/toolbar.css dialkit-patch/toolbar.js dial-values.plugin.js; do
  if [ "$B/$f" -nt "$K/$f" ]; then cp "$B/$f" "$K/$f" && echo "updated $f from Blick"; fi
done
mkdir -p "$K/blick-ref"
for f in src/lib/dialkit-stub.ts src/lib/useDialAutosave.ts; do
  if [ "$B/$f" -nt "$K/blick-ref/$(basename "$f")" ]; then cp "$B/$f" "$K/blick-ref/$(basename "$f")" && echo "updated $(basename "$f") from Blick"; fi
done
echo "dialkit version in Blick: $(grep -o '"dialkit": *"[^"]*"' "$B/package.json")"
