This page contains settings for configuring SilverBullet and its plugs.
A list of built-in settings can be found at [[!silverbullet.md/CONFIG]].

```space-lua
config.set {
  indexPage = "index",

  libraries = {
    {import = "[[!silverbullet.md/Library/Core/*]]"},
    {import = "[[!ai.silverbullet.md/Library/AICore/*]]"}
  },

  plugs = {
    "github:silverbulletmd/silverbullet-pub/pub.plug.js",
    "github:joekrill/silverbullet-treeview/treeview.plug.js"
  },

  publish = {
    -- indexPage specific to the published site
    indexPage = "index",
    -- Site title
    title = "SilverBullet AI Plug",
    -- Page containing the template to use to render pages
    template = "template/page",
    -- Destination prefix for where to write the files to
    destPrefix = "_public/",
    -- Remove hashtags from the output
    removeHashtags = false,
    -- Entirely remove page links to pages that are not published
    removeUnpublishedLinks = false,
    -- Publish ALL pages in this space
    publishAll = true,
    -- Publish all pages with specific tag only (assuming publishAll is off)
    tags = {"pub"}
  },

  ai = {
    textModels = {
      {name = "gpt-4o", provider = "openai", modelName = "gpt-4o"}
    }
  }
}
```
