```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{#if !isIndex}}{{pageName}} — {{config.title}}{{else}}{{config.title}}{{/if}}</title>
    <style>
        body {
            font-family: georgia, times, serif;
            font-size: 14pt;
            max-width: 800px;
            margin-left: auto;
            margin-right: auto;
            padding-left: 20px;
            padding-right: 20px;
        }

        table {
            width: 100%;
            border-spacing: 0;
        }

        thead tr {
            background-color: #333;
            color: #eee;
        }

        th,
        td {
            padding: 8px;
        }

        tbody tr:nth-of-type(even) {
            background-color: #f3f3f3;
        }

        ul li p {
            margin: 0;
        }

        a[href] {
            text-decoration: none;
        }

        blockquote {
            border-left: 1px solid #333;
            margin-left: 2px;
            padding-left: 10px;
        }

        pre {
           background-color: #f2eeee;
           border: 1px solid #cecece;
           padding: 5px;
           overflow-x: scroll;
        }

        img {
            max-width: 90%;
        }
    </style>
</head>

<body>
    {{#if !isIndex}}
    <h1>{{pageName}}</h1>
    {{/if}}
    {{body}}
</body>

</html>
```
