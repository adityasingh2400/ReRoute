# ReRoute

**Record once. We handle the rest.**

ReRoute turns a single guided video of unused items into money. You record one video while talking through what each item is, its condition, and any defects. ReRoute uses the visuals and speech from that video to identify each item, infer specs, understand defects, compare every meaningful route, choose the best one, and execute it.

## Core Routes

| Route | Description |
|-------|-------------|
| **Return** | Item is new/open-box — return it |
| **Trade-in** | Guaranteed payout from a provider |
| **Sell as-is** | List on marketplaces at current condition |
| **Repair then sell** | Fix a defect to unlock more value |
| **Bundle then sell** | Combine related items for higher total |

## Architecture

```
Phone (capture) ──video──► Mac (command center)
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              IntakeAgent  Bureau   FastAPI
                    │      (uAgents)  Server
                    ▼
          ConditionFusionAgent ──► Gemini 3.1 Pro
                    │
         ┌──────┬──┼──┬──────┬──────┐
         ▼      ▼  ▼  ▼      ▼      ▼
      Return  Trade MarketResale  Repair  Bundle
      Agent   Agent   Agent      Agent   Agent
         │      │     │          │       │
         └──────┴─────┴──────────┴───────┘
                       │
                RouteDeciderAgent
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
         Asset     Execution  Unified
         Studio    System     Inbox
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
            eBay    Mercari   (FB/Depop)
```

### Agents (reasoning + route competition)
- **IntakeAgent** — creates jobs, triggers extraction
- **ConditionFusionAgent** — fuses transcript + vision into item cards
- **ReturnAgent** — evaluates return viability
- **TradeInAgent** — compares guaranteed payout options
- **MarketplaceResaleAgent** — searches eBay comps, estimates sale value
- **RepairROIAdvisorAgent** — finds Amazon parts, calculates repair ROI
- **BundleOpportunityAgent** — identifies items worth more together
- **RouteDeciderAgent** — picks the best route per item
- **ConciergeAgent** — ASI:One-compatible public-facing agent (chat protocol)

### Systems (support + execution)
- **TranscriptAndFrameExtractionSystem** — ffmpeg frames + Gemini transcript
- **ListingAssetOptimizationSystem** — OpenCV scoring, Pillow crop, rembg
- **ExecutionSystem** — multi-platform posting via adapters
- **UnifiedInboxSystem** — cross-platform buyer management
- **RouteCloserSystem** — shuts down losing routes when one wins

## Fetch.ai Integration

| Requirement | Implementation |
|-------------|----------------|
| uAgents | All 9 agents built with `uagents.Agent` |
| Bureau | All agents managed in a single `Bureau` |
| Mailbox | ConciergeAgent has `mailbox=True` |
| Agentverse | Concierge registered via Inspector link |
| ASI:One | Concierge uses `chat_protocol_spec` |
| Delegation | Low-confidence bids trigger `DelegationRequest` |
| Protocols | Typed message models for all inter-agent communication |

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- ffmpeg installed (`brew install ffmpeg` on macOS)

### Setup

```bash
# Clone and enter
cd ReRoute

# Run automated setup
bash scripts/setup.sh

# Edit environment variables
nano .env
# Add at minimum: GEMINI_API_KEY

# Start everything
python run.py
```

### Access

| Surface | URL |
|---------|-----|
| Mac Dashboard | http://localhost:8080 |
| Phone Capture | http://localhost:8080/phone/ |
| API Docs | http://localhost:8080/docs |

### Demo Mode

Set `DEMO_MODE=true` in `.env` for realistic mock data when API keys aren't configured.

## Environment Variables

See `.env.example` for a full template. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
| `ASI_ONE_API_KEY` | For ASI:One | Fetch.ai ASI:One API key |
| `EBAY_APP_ID` | For live eBay | eBay developer app ID |
| `EBAY_CERT_ID` | For live eBay | eBay developer cert ID |
| `EBAY_DEV_ID` | For live eBay | eBay developer dev ID |
| `EBAY_OAUTH_TOKEN` | For live eBay | eBay OAuth token |
| `EBAY_SANDBOX` | No | `true` to use eBay sandbox (default) |
| `AMAZON_ACCESS_KEY` | For parts search | Amazon PA-API access key |
| `AMAZON_SECRET_KEY` | For parts search | Amazon PA-API secret key |
| `AMAZON_PARTNER_TAG` | For parts search | Amazon Associates partner tag |
| `API_PORT` | No | API server port (default `8080`) |
| `BUREAU_PORT` | No | uAgents Bureau port (default `8000`) |
| `DEMO_MODE` | No | `true` for mock data (default) |
| `ENABLE_FACEBOOK_ADAPTER` | No | Enable Facebook Marketplace adapter |
| `ENABLE_DEPOP_ADAPTER` | No | Enable Depop adapter |

Each agent also requires a unique seed phrase (`*_AGENT_SEED` in `.env.example`).

## Project Structure

```
ReRoute/
├── run.py                    # Entry point (Bureau + API server)
├── backend/
│   ├── config.py             # Settings via pydantic-settings
│   ├── server.py             # FastAPI + WebSocket
│   ├── models/               # Pydantic data models
│   ├── protocols/            # uAgents message types
│   ├── agents/               # 9 uAgents + Bureau
│   ├── systems/              # 5 execution systems
│   ├── adapters/             # Platform adapters (eBay, Mercari, etc.)
│   ├── services/             # External API clients (Gemini, eBay, Amazon)
│   └── storage/              # In-memory store with persistence
├── frontend/
│   ├── phone/                # Minimal capture interface (vanilla HTML)
│   └── mac/                  # Command center dashboard (React + Vite)
├── data/                     # Runtime data (uploads, frames, jobs)
└── scripts/
    └── setup.sh              # Automated setup
```

## Demo Presentation Flow

1. **Phone** — Tap Start Capture, record items while speaking, swipe up to send
2. **Mac** — Video arrives, processing ring appears
3. **Condition Fusion** — Item cards emerge from the video
4. **Market Sweep** — Horizontal comp cards slide in with match scores
5. **Repair Sweep** — Amazon parts + "NET GAIN UNLOCKED" moment
6. **Best Route** — Route ladder locks in the winner
7. **Asset Studio** — Raw vs optimized listing images
8. **Multi-Post Engine** — Launch sequence to eBay (live publish)
9. **Unified Inbox** — Show cross-platform buyer management
10. **Agentverse** — Show agent profile screenshot
11. **ASI:One** — Chat with ConciergeAgent live

### Presentation Mode

Toggle "Presentation Mode" in the Mac dashboard for:
- Larger typography
- Fewer controls
- Optimized for across-the-table readability

