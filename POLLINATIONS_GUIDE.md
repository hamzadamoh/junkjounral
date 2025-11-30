# Using Pollinations.AI in Your Project

## What is Pollinations.AI?

[Pollinations.AI](https://github.com/pollinations/pollinations) is a **free, open-source** AI image generation platform. It's an excellent alternative to Midjourney because:

- ✅ **100% Free** - No API key required
- ✅ **Fast Generation** - Usually completes in seconds
- ✅ **High Quality** - Uses Flux models (flux-pro, flux-schnell)
- ✅ **Open Source** - Transparent and community-driven
- ✅ **No Rate Limits** - Use as much as you need

## How It Works in Your App

Your app now supports **two image generation services**:

1. **Pollinations.AI** (Default) - Free, fast, no setup needed
2. **Midjourney via GoAPI** - Premium quality, requires API key

## Switching Between Services

In the settings page, you'll see a new option:

**"Image Generation Service"**
- **Pollinations (Free)** - Fast, free, no API key
- **Midjourney** - Premium quality, requires API key

Simply select which service you want to use before generating images!

## Pollinations.AI Features

### Models Available
- `flux-schnell` - Very fast generation (default for "fast" mode)
- `flux-pro` - Higher quality (default for "relax" mode)
- Other models available via URL parameters

### API Usage

Pollinations uses a simple URL-based API:

```
https://image.pollinations.ai/prompt/{encoded_prompt}?width={width}&height={height}&model={model}
```

### Example Request

```javascript
const prompt = "Gothic Victorian junk journal page";
const width = 1024;
const height = 1024;
const model = "flux-pro";

const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=${model}&nologo=true&enhance=true`;

// Fetch the image
const response = await fetch(url);
const blob = await response.blob();
```

## Advantages Over Midjourney

| Feature | Pollinations.AI | Midjourney (GoAPI) |
|---------|----------------|-------------------|
| Cost | Free | Paid (API credits) |
| Speed | Seconds | 2-10 minutes |
| Setup | None | API key required |
| Rate Limits | None | Plan-dependent |
| Quality | High (Flux) | Very High |

## When to Use Each

**Use Pollinations.AI when:**
- You want fast, free generation
- You're testing or prototyping
- You don't have a Midjourney API key
- You need many images quickly

**Use Midjourney when:**
- You need the highest quality possible
- You have an API key and credits
- You can wait 2-10 minutes per image
- You need specific Midjourney styles

## Technical Details

The Pollinations service (`services/pollinationsService.ts`) handles:
- Prompt construction (same as Midjourney)
- Aspect ratio conversion to dimensions
- Model selection based on mode
- Image fetching and base64 conversion

## Resources

- **GitHub**: https://github.com/pollinations/pollinations
- **Website**: https://pollinations.ai
- **API Docs**: Check the GitHub repo for detailed API documentation

## Troubleshooting

**Images not generating?**
- Check browser console for errors
- Verify your internet connection
- Try a different aspect ratio
- Switch to Midjourney if Pollinations is down

**Slow generation?**
- Pollinations is usually fast, but can be slower during high traffic
- Try switching models (flux-schnell is fastest)
- Check Pollinations.AI status

**Quality issues?**
- Try using `flux-pro` model (change mode to "relax")
- Adjust your prompt
- Consider using Midjourney for premium quality

