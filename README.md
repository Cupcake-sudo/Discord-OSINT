# Discord OSINT Nyx-Tool — v2.0

**By Cupcake**

![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen) ![License](https://img.shields.io/github/license/Cupcake-sudo/Discord-OSINT) ![JavaScript](https://img.shields.io/badge/language-JavaScript-yellow)

A command-line tool that searches between your Discord servers for messages, files, and mentions tied to a specific user ID. Based around a kitty pet named Nyx who tells you everything that is happening.

> ⚠️ **Disclaimer:** This tool is intended for use on accounts you own or have explicit permission to investigate. Use responsibly and in accordance with Discord’s Terms of Service.

-----

## Table of Contents

- [Screenshots](#screenshots)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Modes](#modes)
- [Options](#options)
- [Examples](#examples)
- [Output](#output)
- [Notes](#notes)

-----

## Screenshots

### Sniffing Mentions

Shows which users tag the target the most.

<img width="898" height="711" alt="Sniffing Mentions screenshot" src="https://github.com/user-attachments/assets/68a9c656-9b18-4362-b3bc-e4223dd23441" />

### Collecting Files & Heatmap

`-files` collects only files. `-heatmap` shows the time windows where most messages are sent.

<img width="980" height="922" alt="Collecting Files screenshot" src="https://github.com/user-attachments/assets/41d8c19e-ff8b-49ca-b569-4dedc788d96f" />

-----

## Requirements

- [Node.js](https://nodejs.org) v16 or higher

Check if you have it:

```bash
node -v
```

-----

## Installation

```bash
npm install
```

-----

## Usage

```bash
node index.js -id <userID> [mode] [options]
```

You will be prompted to paste your Discord token after launch.

> **Finding a user ID:** Enable Developer Mode in Discord settings, then right-click any username and select **Copy User ID**.

-----

## Modes

|Flag       |Description                                                                      |
|-----------|---------------------------------------------------------------------------------|
|*(none)*   |Same as `-messages`                                                              |
|`-messages`|Saves every message the target sent across all shared servers                    |
|`-files`   |Downloads only messages with attachments — images, videos, documents             |
|`-mentions`|Finds every message where the target was pinged and ranks who sends them the most|
|`-all`     |Runs everything at once — messages, files, and mentions in one pass              |

### `-messages`

Good starting point. Text only, fast, and easy to read through.

### `-files`

Files shared on Discord rarely have metadata stripped, so what you download is often what was uploaded straight from the device. Useful to run on its own when that angle matters. Output stays clean and focused.

### `-mentions`

Builds a ranked list of who interacts with the target the most. A solid pivot point for going deeper — useful for mapping out connections and figuring out who to look into next.

### `-all`

Output will be large and takes longer depending on how active the user is. Better to sort through afterward than to run each mode separately if you want the full picture in one go.

-----

## Options

|Flag      |Description                                                    |
|----------|---------------------------------------------------------------|
|`-heatmap`|Shows the top 5 two-hour windows when the target is most active|

`-heatmap` can be added alongside `-messages` or `-all`. Timestamps are converted to your local timezone and saved as `heatmap.txt`. Useful for building a picture of the user’s habits and daily schedule. Not available with `-mentions`.

-----

## Examples

```bash
# Gather all messages
node index.js -id 123456789012345678 -messages

# Files only
node index.js -id 123456789012345678 -files

# Map out who mentions them the most
node index.js -id 123456789012345678 -mentions

# Full sweep with activity heatmap
node index.js -id 123456789012345678 -all -heatmap
```

-----

## Output

Results are saved to a folder named after the mode and username:

```
Messages_username/
Files_username/
Mentions_username/
Everything_username/
```

Each folder contains a plain text report and a JSON file. Downloaded files go into a `files/` subfolder.

-----

## Notes

- Rate limits are handled automatically. If Discord throttles the tool, it will wait and resume on its own.
- The token prompt hides input. Paste and press Enter.