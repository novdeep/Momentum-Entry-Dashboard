// List of ~80 popular liquid NSE stocks (mostly >1500 Cr market cap)
const stocksList = [
  "RELIANCE.NS", "HDFCBANK.NS", "BHARTIARTL.NS", "ICICIBANK.NS", "SBIN.NS",
  "INFY.NS", "TCS.NS", "HINDUNILVR.NS", "ITC.NS", "LT.NS", "AXISBANK.NS",
  "KOTAKBANK.NS", "MARUTI.NS", "SUNPHARMA.NS", "HCLTECH.NS", "ASIANPAINT.NS",
  "BAJFINANCE.NS", "ULTRACEMCO.NS", "TITAN.NS", "ADANIENT.NS", "WIPRO.NS",
  "NESTLEIND.NS", "POWERGRID.NS", "NTPC.NS", "COALINDIA.NS", "ONGC.NS",
  "TATAMOTORS.NS", "JSWSTEEL.NS", "HDFCLIFE.NS", "BAJAJFINSV.NS", "TECHM.NS",
  "INDUSINDBK.NS", "GRASIM.NS", "CIPLA.NS", "DRREDDY.NS", "BRITANNIA.NS",
  "HEROMOTOCO.NS", "EICHERMOT.NS", "DIVISLAB.NS", "APOLLOHOSP.NS", "SBILIFE.NS",
  "M&M.NS", "BPCL.NS", "HINDALCO.NS", "TATASTEEL.NS", "SHREECEM.NS",
  "ADANIPORTS.NS", "IOC.NS", "PIDILITIND.NS", "DABUR.NS", "GODREJCP.NS",
  "HAVELLS.NS", "TORNTPHARM.NS", "SRF.NS", "BERGEPAINT.NS", "COLPAL.NS",
  "MARICO.NS", "IRCTC.NS", "ZOMATO.NS", "TRENT.NS", "TVSMOTOR.NS",
  "PERSISTENT.NS", "LTIM.NS", "MAXHEALTH.NS", "LUPIN.NS", "AUROPHARMA.NS",
  "ESCORTS.NS", "MOTHERSON.NS", "SONACOMS.NS", "CUMMINSIND.NS", "ABB.NS",
  "SIEMENS.NS", "THERMAX.NS", "POLICYBZR.NS", "NYKAA.NS"
];

// Helper: Simple SMA
function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  let sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

// Helper: RSI (14)
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[closes.length - i] - closes[closes.length - i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period || 0.001;
  const rs = avgGain / avgLoss;
  return Math.min(100, 100 - (100 / (1 + rs)));
}

// Helper: Detect Hammer on weekly chart
function isHammer(open, high, low, close) {
  const body = Math.abs(close - open);
  const range = high - low;
  if (range === 0) return false;
  const lowerShadow = Math.min(open, close) - low;
  const upperShadow = high - Math.max(open, close);

  return (
    body <= 0.3 * range &&
    lowerShadow >= 2 * body &&
    upperShadow <= 0.15 * range
  );
}

// Analyze single stock
async function analyzeStock(symbol) {
  try {
    // Quote data (price, PE, PB, marketCap)
    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;
    const quoteRes = await fetch(quoteUrl);
    const quoteJson = await quoteRes.json();
    const q = quoteJson.quoteResponse.result[0];
    if (!q) return null;

    const price = q.regularMarketPrice || 0;
    const pe = q.trailingPE || 999;
    const pb = q.priceToBook || 999;
    const marketCap = q.marketCap || 0;

    // Strict filters
    if (pe > 30 || pb > 5 || marketCap < 15000000000) return null; // ~1500 Cr

    // Daily data for MA, RSI, Volume
    const dailyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`;
    const dailyRes = await fetch(dailyUrl);
    const dailyJson = await dailyRes.json();
    const dailyResult = dailyJson.chart.result[0];
    const closes = dailyResult.indicators.quote[0].close.filter(v => v != null);
    const volumes = dailyResult.indicators.quote[0].volume.filter(v => v != null);

    const currentPrice = closes[closes.length - 1];
    const sma50 = calculateSMA(closes, 50);
    const sma200 = calculateSMA(closes, 200);
    const rsi = calculateRSI(closes);

    const avgVol20 = volumes.slice(-21, -1).reduce((a,b)=>a+b,0) / 20;
    const latestVol = volumes[volumes.length - 1];
    const volumeSurge = latestVol > 1.5 * avgVol20;

    // Weekly data for Hammer
    const weeklyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2y&interval=1wk`;
    const weeklyRes = await fetch(weeklyUrl);
    const weeklyJson = await weeklyRes.json();
    const w = weeklyJson.chart.result[0].indicators.quote[0];
    const wOpen = w.open[w.open.length-1];
    const wHigh = w.high[w.high.length-1];
    const wLow = w.low[w.low.length-1];
    const wClose = w.close[w.close.length-1];

    const hasHammer = isHammer(wOpen, wHigh, wLow, wClose);

    // Calculate score
    let score = 0;
    if (currentPrice > sma200 && sma50 > sma200) score += 30;
    if (currentPrice > sma50 && volumeSurge) score += 25;
    if (rsi >= 40 && rsi <= 70) score += 15;
    if (hasHammer) score += 15;
    score += 15; // Base sentiment

    return {
      symbol: symbol.replace(".NS", ""),
      price: price.toFixed(2),
      score: Math.round(score),
      rsi: rsi.toFixed(1),
      volumeSurge: volumeSurge ? "Yes" : "No",
      trend: (currentPrice > sma200 && sma50 > sma200) ? "Strong Uptrend" : "Neutral",
      hammer: hasHammer ? "Yes" : "No",
      pe: pe.toFixed(1),
      pb: pb.toFixed(1)
    };
  } catch (err) {
    console.log("Failed for", symbol);
    return null;
  }
}

// Run the scanner
async function runScanner() {
  const tbody = document.getElementById("tableBody");
  const refreshBtn = document.getElementById("refreshBtn");
  const lastUpdated = document.getElementById("lastUpdated");
  const scannedEl = document.getElementById("scannedCount");
  const strongEl = document.getElementById("strongCount");

  tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;">Scanning stocks from Yahoo Finance...<br>This may take 25-50 seconds on first load.</td></tr>`;
  refreshBtn.disabled = true;

  let results = [];
  let strong = 0;

  for (let symbol of stocksList) {
    const data = await analyzeStock(symbol);
    if (data) {
      results.push(data);
      if (data.score >= 75) strong++;
    }
  }

  results.sort((a, b) => b.score - a.score);

  tbody.innerHTML = "";

  results.forEach(stock => {
    const isStrong = stock.score >= 75;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${stock.symbol}</strong></td>
      <td>₹${stock.price}</td>
      <td class="${isStrong ? 'score-high' : 'score-medium'}">${stock.score}</td>
      <td>${stock.rsi}</td>
      <td>${stock.volumeSurge}</td>
      <td>${stock.trend}</td>
      <td class="${stock.hammer === 'Yes' ? 'hammer-yes' : ''}">${stock.hammer}</td>
      <td>${stock.pe}</td>
      <td>${stock.pb}</td>
      <td><a href="https://in.tradingview.com/symbols/NSE-${stock.symbol}" target="_blank" style="color:#3b82f6;">View Chart</a></td>
    `;
    tbody.appendChild(row);
  });

  scannedEl.textContent = results.length;
  strongEl.textContent = strong;

  lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
  refreshBtn.disabled = false;
}

// Initialize
document.getElementById("refreshBtn").addEventListener("click", runScanner);
window.onload = runScanner;
