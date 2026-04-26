# AI Jobs Doomsday Clock

A simplified doomsday clock visualization based on AI exposure data from [karpathy/jobs](https://github.com/karpathy/jobs).

## About

This clock maps the weighted average AI exposure across 342 US occupations to a 24-hour clock face, where 50% replacement rate equals midnight (00:00).

**Current reading: 23:47 (49.1% replacement rate)**

## Data Source

All data comes from Andrej Karpathy's jobs project, which analyzes Bureau of Labor Statistics occupational data and scores each occupation's exposure to current AI technology.

## Live Site

Visit: https://jobdoomsday.tech/

## Local Development

```bash
npm install
npm run compute  # Generate data from jobs dataset
npm run dev      # Start dev server
npm run build    # Build for production
```

## Rich Signals

```bash
DASHSCOPE_API_KEY="your-key" npm run refresh-rich-data
```

Optional sources:

```bash
APPLE_PODCAST_IDS="1234567890,2345678901" DASHSCOPE_API_KEY="your-key" npm run refresh-rich-data
YOUTUBE_CHANNEL_IDS="UCxxxx,UCyyyy" DASHSCOPE_API_KEY="your-key" npm run refresh-rich-data
```

The default Apple Podcasts set includes Me, Myself, and AI, Hard Fork, No Priors, and Possible. `APPLE_PODCAST_IDS` appends extra shows. Apple Podcasts IDs are only used to resolve the original RSS feed. The app plays direct RSS audio enclosures in app; Apple Podcasts landing pages without direct audio remain normal article signals.

## License

MIT
