<h1 align="center">Hidden Markov Regime Dashboard</h1>
<p align="center">
  Recruiter‑ready, Bloomberg‑dark market‑regime dashboard that runs live in the browser.
</p>

## Highlights
- **3‑state HMM** (Bull / Bear / Crisis) with Gaussian emissions.
- **Forward‑Backward inference** for smoothed regime probabilities.
- **Serverless SIM stream** driving the real‑time UI.
- **Vercel + Plotly.js** (no React).
- **Range selector** (1y / 3y / 5y) and **snapshot export**.
- **3D controls**: zoom, fit, reset.

## What it does
Generates synthetic HMM prices, computes log returns, infers hidden regimes, and renders a live dashboard with:
1. **Transition matrix (3D)** — P(sₜ₊₁ | sₜ) for regime switching.
2. **Price + regime fill** — price series with regime shading.
3. **Returns barcode** — daily returns colored by regime.
4. **Smoothed P(state)** — posterior probabilities across time.
5. **Equity curve (base 100)** — cumulative performance.

**SIM only:** The Vercel build uses synthetic HMM returns for a fast, consistent demo.

## How it works (pipeline)
1. **Simulate** daily prices from the HMM model.
2. **Compute** log returns from price series.
3. **Infer** posteriors P(sₜ | y₁:ₜ) with Forward‑Backward.
4. **Serve** updates from a serverless endpoint at a steady tick rate.
5. **Render** with Plotly while preserving the PNG layout and theme.

## Model details
- **States**: Bull, Bear, Crisis  
- **Emissions**: Gaussian returns per state (μ, σ)  
- **Transition matrix**: fixed 3×3 probabilities  
- **Inference**: Forward‑Backward in log space  
- **Output**: state posteriors, inferred regime, equity curve  

## Backend & data flow
- **Serverless API (`api/state.js`)** generates the dataset and returns a time‑based tick index.
- **Client (`public/app.js`)** receives the precomputed arrays (prices/returns/gamma) and renders the current frame.
- This keeps the layout stable, fast, and visually identical to the PNG while still updating live.

**Runtime loop**
1. Build dataset (synthetic SIM returns) + infer.
2. Serve `{dataset, index}` from `/api/state`.
3. Client updates the 3D matrix highlight + right‑panel slices.

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
- **Serverless**: Vercel Node Functions
- **Frontend**: Plotly.js + vanilla JS + CSS
- **Data**: synthetic SIM (no external API)
- **Math**: JS HMM simulation + Forward‑Backward

## Run
```bash
vercel dev
```
Open: `http://localhost:3000`

## Project layout
```
.
├─ assets/
│  └─ Hidden_Markov_Regime.png
├─ public/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ api/
│  ├─ _lib/
│  │  └─ hmm.js
│  ├─ market.js
│  └─ state.js
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
- SIM‑only build intended for Vercel deployment.
- UI is locked to the PNG layout for visual parity.
