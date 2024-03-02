
{{1 + 2}}


{{#each {page where tags = "sidebar" order by navOrder asc}}}
{{#if name = "index"}}
<li><a href="/">Home</a></li>
{{else}}
<li><a href="{{name}}">{{name}}</a></li>
{{/if}}
{{/each}}
