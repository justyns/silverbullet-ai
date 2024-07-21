This page contains settings for configuring SilverBullet and its plugs. Any changes outside of the yaml block will be overwritten.
A list of built-in settings [[!silverbullet.md/SETTINGS|can be found here]].

```yaml
indexPage: index
libraries:
- import: "[[!silverbullet.md/Library/Core/*]]"
- import: "[[!ai.silverbullet.md/Library/AICore/*]]"
publish:
  # indexPage specific to the published site
  indexPage: index
  # Site title
  title: SilverBullet AI Plug
  # publishServer: https://zef-pub.deno.dev
  # Page containing the handlebars template to use to render pages
  # defaults to "!pub.silverbullet.md/template/page"
  template: template/page
  # Destination prefix for where to write the files to (has to be inside the space), defaults to public/
  destPrefix: _public/
  # Remove hashtags from the output
  removeHashtags: false
  # Entirely remove page links to pages that are not published 
  removeUnpublishedLinks: false
  # Publish ALL pages in this space (defaults to false)
  publishAll: true
  # Publish all pages with a specifix prefix only (assuming publishAll is off)
  #prefixes:
  #- /public
  # Publish all pages with specific tag only (assuming publishAll is off)
  tags:
  - pub
ai:
  textModels:
  - name: gpt-4o
    provider: openai
    modelName: gpt-4o
```
