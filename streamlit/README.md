# FII — Streamlit Web App

Web version of Factor Impact Intelligence (FII) that hits the same backend API as the mobile app.

## Pages

1. **🏠 Dashboard** — Daily signal feed with scores and market news
2. **🔍 Stock Detail** — Full analysis per ticker (signal, factors, financials, stress test, alt data, news)
3. **📋 Screener** — Sortable/filterable universe of stocks
4. **📑 Report Critique** — Upload analyst PDF or paste text; compares against FII factor data
5. **💬 AI Coach** — Chat interface for investing questions
6. **💼 Portfolio** — Enter holdings; see FII scores, P&L, allocation
7. **📈 Strategy** — Market movers, earnings calendar, trending stocks

## Local Setup

```bash
cd streamlit
pip install -r requirements.txt
streamlit run app.py
```

Opens at http://localhost:8501

## Configure API URL

Default points to the production FII API. Override with an env var:

```bash
export FII_API_URL=https://your-api-gateway-url
streamlit run app.py
```

Or on Windows (PowerShell):
```powershell
$env:FII_API_URL="https://your-api-gateway-url"
streamlit run app.py
```

## Deployment Options

### Streamlit Community Cloud (free, fastest)
1. Push repo to GitHub
2. Go to https://share.streamlit.io
3. Connect repo, select `streamlit/app.py` as main file
4. Set secret `FII_API_URL` under app settings

### Hugging Face Spaces (free)
1. Create new Space → Streamlit
2. Upload the `streamlit/` folder contents
3. Add `FII_API_URL` secret

### Render / Railway / Fly.io
- Build command: `pip install -r streamlit/requirements.txt`
- Start command: `streamlit run streamlit/app.py --server.port=$PORT --server.address=0.0.0.0`

## Notes

- The app is **completely separate** from the React Native mobile app in `/app`. No shared code.
- All API calls go to the same Lambda backend. No separate backend deployment needed.
- Session state only — no user auth required for most features (portfolio is session-scoped).
- Dark theme styled to match the FII brand (navy/teal).

## Disclaimer

Educational analysis of public market data. Not financial advice.
