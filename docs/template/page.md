```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{#if !isIndex}}{{pageName}} — {{config.title}}{{else}}{{config.title}}{{/if}}</title>
    <link rel="stylesheet" href="/style.css">
    <!-- <link href=" https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css " rel="stylesheet"> -->
</head>

<body>
    <div class="sidebar">
        <h2>SilverBullet AI Docs</h2>
        <nav>
            <ul>
                <!-- TODO: Make this whole thing dynamic, not just the section at the bottom -->
                <li><a href="/" class="{{#if isIndex}}active{{/if}}">Home</a></li>
                <li>
                    <a href="Configuration">Configuration</a>
                    <ul>
                        {{#each {page where name =~ /^Configuration\// order by navOrder asc}}}
                        <li><a href="{{name}}">{{replace(name, "Configuration/", "")}}</a></li>
                        {{/each}}
                    </ul>
                </li>
                <li>
                    <a href="Providers" class="">Providers</a>
                    <ul>
                        {{#each {page where name =~ /^Providers\// order by navOrder asc}}}
                        <li><a href="{{name}}">{{replace(name, "Providers/", "")}}</a></li>
                        {{/each}}
                    </ul>
                </li>
                {{#each {sidebar order by navOrder asc}}}
                <li><a href="{{name}}">{{name}}</a></li>
                {{/each}}
            </ul>
        </nav>
    </div>
    <div class="content">
        {{#if !isIndex}}
        <h1>{{pageName}}</h1>
        {{/if}}
        {{body}}
    </div>
    <!-- TODO: Get syntax hilighting to work -->
    <!-- <script src=" https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js "></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js"></script> -->
</body>
</html>
```
