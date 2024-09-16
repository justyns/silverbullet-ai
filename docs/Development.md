---
tags: sidebar
navOrder: 99
---


## Build
To build this plug, make sure you have [SilverBullet installed](https://silverbullet.md/Install). Then, build the plug with:

```shell
deno task build
```

Or to watch for changes and rebuild automatically

```shell
deno task watch
```

Then, copy the resulting `.plug.js` file into your space's `_plug` folder. Or build and copy in one command:

```shell
deno task build && cp *.plug.js /my/space/_plug/
```

SilverBullet will automatically sync and load the new version of the plug (or speed up this process by running the {[Sync: Now]} command).


## Docs

Documentation is located in the `docs/` directory and rendered using a combination of the [silverbullet-pub plugin](https://github.com/silverbulletmd/silverbullet-pub) and [mkdocs](https://github.com/mkdocs/mkdocs).

To make changes, use silverbullet locally like: `silverbullet docs/`

If you want to see changes in real-time, open up two terminals and run these two commands:

- `mkdocs serve -a localhost:9000`
- `find docs -name \*.md -type f | egrep -v 'public' | entr bash ./render-docs.sh`

The first starts a local development server of mkdocs. The second uses the [entr](https://github.com/eradman/entr) command to run silverbullet-pub every time a file changes inside the silverbullet docs/ directory.

Markdown files inside of docs/ can also be manually edited using any editor.