The following commands are currently available:

${template.each(query[[
  from index.tag "page"
  where string.find(name, "Commands/") == 1
  order by name
]], template.new[==[* [[${name}]]]==])}