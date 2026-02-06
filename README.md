# scoutai

<div align="center">
<img src="img/scoutai.png" alt="logo" width="240">

[![stars](https://img.shields.io/github/stars/michalswi/scoutai?style=for-the-badge&color=353535)](https://github.com/michalswi/scoutai)
[![forks](https://img.shields.io/github/forks/michalswi/scoutai?style=for-the-badge&color=353535)](https://github.com/michalswi/scoutai/fork)
[![releases](https://img.shields.io/github/v/release/michalswi/scoutai?style=for-the-badge&color=353535)](https://github.com/michalswi/scoutai/releases)

Standalone desktop copilot that blends local Ollama chat, multi-map intelligence, and built-in shell tooling.

</div>

## \# important

**Ollama Service**: The AI chat requires Ollama to be running. You have two options:
- **Start from the app**: Use the ***Start Ollama*** button in the ***Run Locally*** section
- **Run externally**: Start Ollama manually in your terminal with `ollama serve`, or connect to an existing Ollama instance by editing the ***Ollama URL*** in the ***Ollama Controls*** section and pressing **refresh**

The status light will turn green when connected (visible in ***owrap tab*** and ***Ollama Controls*** section).

**Data Storage**: ScoutAI stores all application data locally on your machine at `~/Downloads/scoutai/`
  - Chat sessions and conversation history
  - Saved map locations and pins

All data remains private and local.

## \# features

### AI Chat Tab (owrap)
- Local Ollama copilot with multi-session + focus workflows
- Quick controls for prompts, temperature, copy, and history
- Built-in system monitor showing CPU/RAM/GPU at a glance
- Smart map hook that spawns jump-to-map buttons for location chats

### OpenStreetMap Tab
- Global search with instant pinning, coordinates, and favorites
- 🤖 **Ask owrap AI** to auto-enrich saved comments with markdown notes
- Switch map styles (street, dark, satellite) while keeping pins in sync
- Dedicated 📍 OSM Locations session keeps chat + map history aligned
- Saved Locations drawer jumps to any pin or deletes it without leaving the map

### Google Maps Trip Planner Tab [requires API keys]
- API-key powered routing with driving, walking, biking, and transit modes
- Inline route visualization plus condensed turn-by-turn summaries
- Easily swap origin/destination to rerun scenarios in seconds

### Shell Executor Tab
- Fire off zsh commands with streaming output and timers
- Auto-logged history for reruns and quick tweaks
- Guardrails: timeouts, output caps, sudo-block to keep runs safe

## \# setup

1. Install dependencies:
```bash
npm install
```

2. **(Optional) Configure Google Maps & Ollama**
   - Google Maps: Add API key for trip planner
   - Ollama: Install for AI chat - visit [ollama.com](https://ollama.com)
   - App works fine with just OpenStreetMap and Shell tabs

## \# running the App

### Development Mode
```bash
npm start
```

### Build Standalone App
```bash
npm run package
```

This creates a distributable `.app` file in the `release` folder that you can double-click to run!

For a universal binary (Intel + Apple Silicon):
```bash
npm run package:universal
```

## \# usage

- **AI Chat**: 
  - Chat with local AI models (requires Ollama)
  - Create multiple sessions with different models and temperatures
  - Use Focus Mode (🎯 button) for distraction-free conversations
  - Monitor system resources with Activity Monitor
  - Configure Ollama URL for local or remote connections
  - Click Info button (ℹ️) for detailed button explanations
  - **🗺️ Map Button**: When asking about locations, a map button appears next to the assistant's reply. Click it to jump directly to that location on the OpenStreetMap tab!

- **OpenStreetMap**: 
  - Search locations, get coordinates, find your position (temporary disabled feature)
  - Click map to add pins with custom comments
  - Save favorites, then tap the Saved Locations button to jump to or delete pins via the modal
  - **AI-Enhanced Comments**: Click a location, type a question (e.g., "what is worth to see in Wrocław?"), check "Ask owrap AI", and save. The AI response is automatically added to your location note with markdown formatting.
  
- **Google Maps Trip Planner**: 
  - Set origin/destination for directions
  - Choose travel mode (driving, walking, biking, transit)
  - View turn-by-turn navigation
  
- **Shell Executor**: 
  - Execute commands and scripts with real-time output
  - View color-coded results and execution times
  - Browse command history

### Map Integration Examples

**owrap → OpenStreetMap** (Ask AI, jump to map):

Ask the AI about locations and instantly navigate to them on the map:
- "City Wrocław"
- "What is the location of Tokyo?"
- "Where is the Eiffel Tower?"
- "River Odra"
- "What to see in Ise,Japan?"
- "Coordinates 51.5074, -0.1278"

The map button (🗺️) automatically appears when location questions are detected, allowing one-click navigation to the discussed location.

**OpenStreetMap → owrap** (AI-enhanced location notes):

1. Click any location on the OSM map
2. In the comment dialog, type your question (e.g., "what is worth to see in Wrocław?")
3. Check the "🤖 Ask owrap AI" checkbox
4. Click Save or press Enter
5. AI processes your question and enriches the comment with detailed information
6. Location is saved with formatted Q&A (markdown with scrollable content)
7. All OSM location queries are organized in a dedicated "📍 OSM Locations" session

No browser needed - runs as a standalone desktop app!
