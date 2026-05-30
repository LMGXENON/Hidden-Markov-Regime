<h1 align="center">Hidden Markov Regime Dashboard</h1>
<p align="center">
  Recruiter‑ready, Bloomberg‑dark market‑regime dashboard that runs live in the browser.
</p>

## Highlights
- **3‑state HMM** (Bull / Bear / Crisis) with Gaussian emissions.
- **Forward‑Backward inference** for smoothed regime probabilities.
- **Live WebSocket stream** driving the real‑time UI.
- **Node.js + Plotly.js** (no React).
- **Market + range selector** (1y / 3y / 5y) and **snapshot export**.
- **3D controls**: zoom, fit, reset.

## What it does
Fetches real market prices via **yfinance**, computes log returns, infers hidden regimes, and renders a live dashboard with:
1. **Transition matrix (3D)** — P(sₜ₊₁ | sₜ) for regime switching.
2. **Price + regime fill** — price series with regime shading.
3. **Returns barcode** — daily returns colored by regime.
4. **Smoothed P(state)** — posterior probabilities across time.
5. **Equity curve (base 100)** — cumulative performance.

**Also included:** a **SIM** market option that uses synthetic HMM returns (the original baseline before yfinance). This is useful for controlled demos and comparisons.

## How it works (pipeline)
1. **Fetch** daily prices from yfinance for the selected ticker.
2. **Compute** log returns from price series.
3. **Infer** posteriors P(sₜ | y₁:ₜ) with Forward‑Backward.
4. **Stream** updates over WebSocket at a steady tick rate.
5. **Render** with Plotly while preserving the PNG layout and theme.

## Model details
- **States**: Bull, Bear, Crisis  
- **Emissions**: Gaussian returns per state (μ, σ)  
- **Transition matrix**: fixed 3×3 probabilities  
- **Inference**: Forward‑Backward in log space  
- **Output**: state posteriors, inferred regime, equity curve  

## Backend & data flow
- **Python fetcher (`backend/fetch_yfinance.py`)** pulls prices from yfinance and outputs JSON.
- **Server (`server.js`)** runs the HMM inference once, then **streams only a tick index** over WebSocket.
- **Client (`public/app.js`)** receives the precomputed arrays (prices/returns/gamma) and renders the current frame.  
- This keeps the layout stable, fast, and visually identical to the PNG while still updating live.

**Runtime loop**
1. Build dataset (yfinance prices or SIM synthetic returns) + infer.
2. Send `{meta}` over WebSocket (arrays + parameters).
3. Broadcast `{tick: index}` at `TICK_INTERVAL_MS`.
4. Client updates the 3D matrix highlight + right‑panel slices.

## Math (formula breakdown)
**Observation model (Gaussian emissions)**  
For each state \(s\):
\[
y_t \mid s_t=s \sim \mathcal{N}(\mu_s,\sigma_s^2)
\]
Log‑likelihood for observation \(y_t\):
\[
\log p(y_t \mid s) = -\tfrac{1}{2}\log(2\pi\sigma_s^2) - \tfrac{(y_t-\mu_s)^2}{2\sigma_s^2}
\]

**State transition**  
\[
P(s_{t+1}=j \mid s_t=i) = A_{ij}
\]

**Forward (α) recursion**  
\[
\alpha_t(j)=\log p(y_{1:t}, s_t=j)=\log p(y_t\mid s_t=j)+\log\sum_i \exp(\alpha_{t-1}(i)+\log A_{ij})
\]

**Backward (β) recursion**  
\[
\beta_t(i)=\log p(y_{t+1:T}\mid s_t=i)=\log\sum_j \exp(\log A_{ij}+\log p(y_{t+1}\mid s_{t+1}=j)+\beta_{t+1}(j))
\]

**Posterior (smoothed regime probability)**  
\[
P(s_t=j\mid y_{1:T}) \propto \exp(\alpha_t(j)+\beta_t(j))
\]

**Equity curve**  
Price evolves via log returns:
\[
S_t = S_{t-1}\cdot e^{y_t}
\]
Equity plot is base‑100:
\[
\text{Equity}_t = 100 \cdot \frac{S_t}{S_0}
\]

## Metrics shown
- **Return**: simulated daily log return.  
- **Regime probability**: smoothed P(sₜ | y₁:ₜ).  
- **Equity**: base‑100 cumulative performance.  
- **Transition matrix**: regime switching likelihoods.  

## Tech stack
- **Server**: Node.js + Express + WebSocket (`ws`)
- **Frontend**: Plotly.js + vanilla JS + CSS
- **Data**: Python `yfinance` fetcher (real market prices)
- **Math**: JS HMM simulation + Forward‑Backward

## Run
```bash
npm install
python3 -m pip install yfinance
node server.js
```
Open: `http://localhost:8050`  
Health: `http://localhost:8050/health`

## Project layout
```
.
├─ assets/
│  └─ Hidden_Markov_Regime.png
├─ backend/
│  └─ fetch_yfinance.py
├─ public/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ server.js
├─ package.json
└─ package-lock.json
```

## Abbreviations & glossary
- **HMM**: Hidden Markov Model.  
- **Gaussian**: normal distribution used for state‑conditional returns.  
- **Transition matrix**: regime switch probabilities P(sₜ₊₁ | sₜ).  
- **Posterior**: regime probability after observing data.  
- **Equity curve**: cumulative performance (base 100).  

## Notes
- Market data is fetched from yfinance (no paid API).
- UI is locked to the PNG layout for visual parity.

## Deployment notes

- Vercel (serverless) — Notes: Vercel's Serverless Functions do not support long‑lived TCP sockets or persistent WebSocket servers. The app includes an HTTP polling fallback so the UI can work on Vercel, but for full WebSocket real‑time behavior deploy to a platform that supports persistent Node processes.

- Recommended hosts that support WebSockets / long‑running Node processes:
  - Render, Railway, Fly.io, Heroku (traditional dynos), DigitalOcean App Platform.
  - Alternatively, containerize and deploy to any Docker host or Kubernetes cluster.

- Quick deploy (Render example):

```bash
# create a new Web Service on Render pointing to this repo
# set the build command:  npm install
# set the start command:  node server.js
# set environment variables (optional):
#   PORT=10000          # Render provides its own port, leave empty to use default
#   PYTHON_BIN=python3
#   TICK_INTERVAL_MS=120
```

- If you must use Vercel or another serverless platform, either:
  - Use the HTTP polling fallback (already included) — the UI will periodically fetch `/api/state` and render updates without WebSockets, or
  - Use a managed realtime provider (Pusher, Ably, Upstash Realtime) and adapt `server.js` and `public/app.js` to publish/subscribe via that service.

If you want, I can add a Dockerfile or a `Procfile` for easier deployment to these hosts.

### Docker & quick deploy

A Docker image bundles Node + Python (yfinance). Build and run locally:

```bash
# build
docker build -t prism-hmm .

# run (exposes port 8050)
docker run --rm -p 8050:8050 prism-hmm

# then open http://localhost:8050
```

### Heroku / Render quick start

If you prefer a Platform‑as‑a‑Service, use the included `Procfile`:

Heroku:

```bash
heroku create my-prism-hmm
git push heroku main
heroku open
```

Render (Web Service):

- Create a new Web Service from GitHub.
- Build Command: `npm install`
- Start Command: `node server.js`

Render will run a persistent Node process (good for WebSockets). If you deploy to Heroku/Render the `wss://.../ws` endpoint will work as expected.
