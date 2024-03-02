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
        <h2>SilverBullet AI Docs</h2>
        <nav>
            <ul>
                <!-- TODO: Make this whole thing dynamic, not just the section at the bottom -->
                <li><a href="/" class="{{#if isIndex}}active{{/if}}">Home</a></li>
                <li>
                    <a href="javascript:void(0)" class="collapsible">Configuration</a>
                    <ul>
                        {{#each {page where name =~ /^Configuration\// order by navOrder asc}}}
                        <li><a href="{{name}}">{{replace(name, "Configuration/", "")}}</a></li>
                        {{/each}}
                    </ul>
                </li>
                <li>
                    <a href="javascript:void(0)" class="collapsible">Providers</a>
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
</body>
<script>
    var coll = document.getElementsByClassName("collapsible");
    var i;

    for (i = 0; i < coll.length; i++) {
      coll[i].addEventListener("click", function() {
        this.classList.toggle("active");
        var content = this.nextElementSibling;
        if (content.style.display === "block") {
          content.style.display = "none";
        } else {
          content.style.display = "block";
        }
      });
    }
</script>
</html>
```
