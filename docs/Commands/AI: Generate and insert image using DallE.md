---
tags: commands
commandName: "AI: Generate and insert image using DallE"
commandSummary: "Generates an image using DALL-E and inserts it into the current note."
---

When triggered:

1. Prompts you for an image description
2. Sends the prompt to DALL-E to generate an image
3. Uploads the generated image to your space
4. Inserts the image at the cursor with a caption

## Requirements

You must have an image model configured. See [[Configuration/Image Models]] for setup.

## Example

Running the command and entering "A cozy coffee shop on a rainy day, watercolor style" will:

1. Generate an image matching that description
2. Upload it as an attachment (e.g., `dalle-image-123.png`)
3. Insert markdown like: `![A cozy coffee shop on a rainy day](dalle-image-123.png)`
