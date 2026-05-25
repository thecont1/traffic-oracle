# TraffiCOracle

<p align="center">
  <img src="public/trafficoracle-light.png" alt="TraffiCOracle" height="64">
</p>

**TraffiCOracle** is a free, live traffic dashboard for Bangalore. It shows you how fast (or slow) the city is moving right now — and how today's conditions compare to the last few months.

There is **no app to install, no login, and no server** running behind it. Open it in any browser, on your phone or laptop, and it works immediately. All the number-crunching happens inside your browser, and the data is pulled fresh from a public dataset that updates throughout the day.

---

## What is this for?

- **Commuters** deciding whether to leave now or wait 30 minutes
- **City planners** and journalists looking for historical traffic trends
- **Curious residents** who want to know which routes are unusually jammed today
- **Researchers** who need shareable, permalinked traffic views

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Data](#data)
- [How it works](#how-it-works)
- [Tips & Troubleshooting](#tips--troubleshooting)
- [License](#license)

---

## Features

- **TrafficNOW! — Live at a glance**  
  A constantly updating side panel that shows current speed and status for every monitored route. Routes are colour-coded from *unusually fast* to *unusually slow* based on percentile statistics, not simple averages. A pulsing green dot tells you the data is fresh.

- **Ask questions in plain English**  
  Pick a route, a time of day (weekday morning, evening, weekends…), and a time period, then choose a question: *"Has traffic improved?"*, *"Has traffic worsened?"*, or *"What is the typical situation?"* The dashboard answers with a verdict, an emoji summary, and a mini trend chart.

- **Baseline comparison slider**  
  Drag the slider to define your own "normal" weeks. Everything after that window is compared against your custom baseline, so you can see whether recent traffic is genuinely better or worse than what you consider typical.

- **Calendar heatmap**  
  A GitHub-style grid that colours every day by its average speed. One glance shows you which days were red (slow) and which were green (fast).

- **Uncertainty bands on every chart**  
  Instead of a single line, speed and duration charts show a shaded band that represents the typical range (15th–85th percentile) and the full possible range (5th–95th percentile). This tells you how *reliable* an average really is.

- **Three visual themes**  
  *Colour me surprised!* (vibrant dark), *Scale me gray!* (clean professional), and *Clear as day!* (warm light). One click cycles through them; your choice is remembered.

- **Zoom control**  
  A header pill lets you scale the entire UI (80 % → 115 %) so the dashboard feels comfortable on any screen size or eyesight preference.

- **Mobile companion**  
  On phones the dashboard transforms into a route-led swipeable experience. Pick a route, swipe through cards, and share the view.

- **Shareable URLs**  
  Every filter, theme, zoom level, and baseline choice is encoded in the address bar. Copy the link and someone else sees exactly what you see.

- **Accessible by design**  
  Charts use patterns and line weight, not just colour, to communicate meaning. All text and interface elements meet WCAG contrast guidelines.

---

## Quick Start

You do **not** need to run anything locally to use TraffiCOracle. The public instance loads instantly in a browser.

If you want to hack on the code or run it offline:

### Prerequisites

| Tool | Purpose | Install |
|------|---------|---------|
| **Bun** | JavaScript runtime & package manager | `curl -fsSL https://bun.sh/install \| bash` |

### Run locally

```bash
# Clone the repository
git clone <repo-url> && cd TraffiCOracle

# Install dependencies
bun install

# Start the development server
bun run dev
```

Open **http://localhost:5173**. No database, no API key, no `.env` file — the dashboard fetches live data automatically.

### Useful commands

```bash
bun run typecheck   # Check TypeScript types
bun test            # Run the test suite
bun run build       # Build for production
bun run deploy      # Deploy to Cloudflare Workers
```

---

## Data

### Where the data comes from

TraffiCOracle reads two CSV files that are published by its sister project, **[traffic-monitor-lizard](https://github.com/thecont1/traffic-monitor-lizard)**. That project uses a small automated script to check Google Maps travel times every 30 minutes and appends the results to a public CSV on GitHub. TraffiCOracle fetches those files directly from GitHub's raw-content CDN.

- **Routes file** — metadata about each monitored road (`csv-routes-bangalore.csv`)
- **Traffic file** — timestamped speed and duration readings (`csv-traffic-bangalore.csv`)

### Traffic data columns

| Column | Example | Meaning |
|--------|---------|---------|
| `date` | `2026-04-01` | Calendar date of the reading |
| `time` | `08:30` | Time of day (24-hour format) |
| `route_code` | `R-100` | Internal route identifier |
| `label_full` | `Hosur Road` | Human-readable route name |
| `label_short` | `Hosur Road` | Short display label |
| `duration` | `35` | Travel time in minutes |
| `distance` | `18` | Route distance in kilometres |

From `duration` and `distance`, TraffiCOracle computes **average speed** (km/h) for every row.

### Data quality

Before any number reaches a chart, the dashboard silently discards rows that fail common-sense checks:

- Trips longer than 5 hours (`duration > 300`)
- Speeds above 150 km/h (impossible in city traffic)
- Unreadable or missing dates
- Missing distance values (defaulted to 10 km to avoid crashes)

After validation, rows are aggregated by week and by day, and filtered by the route and time-of-day you select.

### How often it updates

- **First load** downloads the full historical dataset (tens of thousands of rows).
- **Background refresh** checks for new data every few minutes. If the CSV on GitHub has changed, only the new rows are downloaded and merged in.
- **When the tab is hidden** polling pauses to save bandwidth and battery; it resumes automatically when you return.

---

## How it works

TraffiCOracle is a **zero-backend** React app. That means there is no private server holding your data, no login gate, and no API key to configure.

```
Your Browser
     │
     ├─► fetches CSV from GitHub (public raw URLs)
     │
     ├─► parses the CSV inside the browser
     │
     ├─► validates, cleans, and aggregates the numbers
     │
     └─► draws charts, cards, and maps
```

Everything from the raw CSV download to the final chart pixel happens on your device. The only external dependency is the public GitHub repository that stores the raw traffic readings.

### Why percentiles matter

City traffic is not normally distributed: most trips cluster around a "typical" speed, but a single accident can create a long tail of very slow trips. Simple averages hide this. TraffiCOracle uses **percentiles** — the same approach used by professional traffic services like INRIX and TomTom — so the "typical" band truly represents what most commuters experience.

---

## Tips & Troubleshooting

| Problem | What to try |
|---------|-------------|
| Dashboard shows no data | Check your internet connection. The app needs to reach GitHub to download the CSV files. |
| TrafficNOW! looks old | Click the **Refresh** button in the pane, or wait a few minutes for the next automatic check. |
| Shared link looks different on my friend's screen | Make sure the URL contains the same `theme=` parameter if you want identical colours. |
| Fonts or layout look odd | Use the zoom pill in the header (`[-] 92% [+]`) instead of browser zoom. |

---

## License

MIT
