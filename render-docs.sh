#!env bash

# Publish using the pub plugin to render code blocks/queries/etc
SB_DB_BACKEND=memory deno run --unstable-kv --unstable-worker-options -A https://edge.silverbullet.md/silverbullet.js plug:run docs/ pub.publishAll && cp -v docs/style.css docs/_public/

# Delete html files
find docs/_public -type f -name \*.html -delete
find docs/_public -type d -empty -delete

# Delete extra sb-specific files

rm -fv \
    docs/_public/SETTINGS.md \
    docs/_public/PLUGS.md \
    docs/_public/*.css