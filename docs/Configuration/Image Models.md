All image model providers can be configured using the following configuration options.  Not all options are required for every model.

An image model is configured in the `SETTINGS` page like this, very similar to the [[Configuration/Text Models]]:

```yaml
ai:
  imageModels:
  - name: <name>
    provider: <provider>
    modelName: <model name>
    baseUrl: <base url of api>
    requireAuth: <true or false>
    secretName: <secret name>
```


Options:
- **name**: Name to use inside of silverbullet for this model.  This is used to identify different versions of the same model in one config, or just to give your own custom names to them.
- **provider**: Currently only **dalle** supported.
- **modelName**: Name of the model to send to the provider api.  This should be the actual model name.
- **baseUrl**: Base url and path of the provider api.
- **requireAuth**: If false, the Authorization headers will not be sent.  Needed as a workaround for some CORS issues with Ollama.
- **secretName**: Name of secret to look for in SECRETS.
