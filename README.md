# AI Jobs Doomsday Clock

A simplified doomsday clock visualization based on AI exposure data from [karpathy/jobs](https://github.com/karpathy/jobs).

## About

This clock maps the weighted average AI exposure across 342 US occupations to a 12-hour clock face, where 50% replacement rate equals midnight (00:00).

**Current reading: 06:07 (49.1% replacement rate)**

## Data Source

All data comes from Andrej Karpathy's jobs project, which analyzes Bureau of Labor Statistics occupational data and scores each occupation's exposure to current AI technology.

## Live Site

Visit: https://zijiebuzhuang.github.io/jobs-doomsday-clock/

## Local Development

```bash
npm install
npm run compute  # Generate data from jobs dataset
npm run dev      # Start dev server
npm run build    # Build for production
```

## License

MIT
