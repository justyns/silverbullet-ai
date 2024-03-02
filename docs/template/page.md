```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{#if !isIndex}}{{pageName}} — {{config.title}}{{else}}{{config.title}}{{/if}}</title>
    <link rel="stylesheet" href="/style.css">
</head>

<body>
    <div class="sidebar">
        <h2>Pages</h2>
        <nav>
            <ul>
                {{#each {sidebar order by navOrder asc}}}
                {{#if name = "index"}}
                <li><a href="/" class="{{#if isIndex}}active{{/if}}">Home</a></li>
                {{else}}
                <!-- TODO: This doesn't work for the class -->
                <li><a href="{{name}}" class="{{#if name = pageName}}active{{/if}}">{{name}}</a></li>
                {{/if}}
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
</body>

</html>
```
