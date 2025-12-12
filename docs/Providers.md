The following Providers are currently supported and have been verified as working:

${template.each(query[[
  from index.tag "provider"
]], template.new[==[* [[${name}]] - Text: ${textProvider and "✓" or "✗"}, Image: ${imageProvider and "✓" or "✗"}, Embeddings: ${embeddingProvider and "✓" or "✗"}]==])}

If you try a different provider, please report your success (or lack of) so that this page can improve over time.