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
  "HAVELLS.NS", "ICICIPRULI.NS", "TORNTPHARM.NS", "SRF.NS", "BERGEPAINT.NS",
  "COLPAL.NS", "MARICO.NS", "UPL.NS", "IRCTC.NS", "ZOMATO.NS", "NYKAA.NS",
  "PAYTM.NS", "POLICYBZR.NS", "PBFINTECH.NS", "PERSISTENT.NS", "LTIM.NS",
  "TRENT.NS", "MAXHEALTH.NS", "LUPIN.NS", "AUROPHARMA.NS", "BIOCON.NS",
  "ESCORTS.NS", "TVSMOTOR.NS", "MOTHERSON.NS", "SONACOMS.NS", "CUMMINSIND.NS",
  "ABB.NS", "SIEMENS.NS", "THERMAX.NS"
];

// Helper functions
function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  let sum = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    sum += prices[i];
  }
  return sum / period;
}

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[closes.length - i] - closes[closes.length - i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function isHammer(open, high, low, close, prevClose) {
  const body = Math.abs(close - open);
  const range = high - low;
  if (range === 0) return false;
  const lowerShadow = Math.min(open, close) - low;
  const upperShadow = high - Math.max(open, close);
  
  const isSmallBody = body <= 0.3 * range;
  const isLongLower = lowerShadow >= 2 * body;
  const isSmallUpper = upperShadow <= 0.1 * range;
  
  return isSmallBody && isLongLower && isSmallUpper;
}

// Main function to fetch and analyze one stock
async function analyzeStock(symbol) {
  try {
    // Get quote (price, PE, PB, market cap)
    const quoteRes = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`);
    const quoteData = await quoteRes.json();
    const quote = quoteData.quoteResponse.result[0];
    if (!quote) return null;

    const price = quote.regularMarketPrice;
    const pe = quote.trailingPE || 999;
    const pb = quote.priceToBook || 999;
    const marketCap = quote.marketCap || 0; // in rupees (approx)

    if (pe > 30 || pb > 5 || marketCap < 15000000000) return null; // 1500 Cr filter

    // Get daily chart for MA, RSI, volume
    const dailyRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d`);
    const dailyData = await dailyRes.json();
    const daily = dailyData.chart.result[0];
    const closes = daily.indicators.quote[0].close;
    const volumes = daily.indicators.quote[0].volume;
    const timestamps = daily.timestamp;

    const currentPrice = closes[closes.length - 1];
    const sma50 = calculateSMA(closes, 50);
    const sma200 = calculateSMA(closes, 200);
    const rsi = calculateRSI(closes);
    const avgVolume20 = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const latestVolume = volumes[volumes.length - 1];
    const volumeSurge = latestVolume > 1.5 * avgVolume20;

    // Weekly data for Hammer
    const weeklyRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2y&interval=1wk`);
    const weeklyData = await weeklyRes.json();
    const weekly = weeklyData.chart.result[0];
    const wCloses = weekly.indicators.quote[0].close;
    const wOpens = weekly.indicators.quote[0].open;
    const wHighs = weekly.indicators.quote[0].high;
    const wLows = weekly.indicators.quote[0].low;

    let hasHammer = false;
    if (wCloses.length >= 5) {
      const idx = wCloses.length - 1;
      hasHammer = isHammer(wOpens[idx], wHighs[idx], wLows[idx], wCloses[idx], wCloses[idx-1]);
    }

    // Scoring
    let score = 0;
    if (currentPrice > sma200 && sma50 > sma200) score += 30;   // Long-term trend
    if (currentPrice > sma50 && volumeSurge) score += 25;       // Short-term momentum
    if (rsi >= 40 && rsi <= 70) score += 15;                    // Not overbought
    if (hasHammer) score += 15;                                 // Weekly Hammer
    score += 15; // Base for market sentiment (FII/DII positive - simplified)

    const trendText = (currentPrice > sma200 && sma50 > sma200) ? "Bullish" : "Neutral";

    return {
      symbol: symbol.replace(".NS", ""),
      price: price.toFixed(2),
      score: Math.round(score),
      rsi: rsi.toFixed(1),
      volumeSurge: volumeSurge ? "Yes" : "No",
      trend: trendText,
      hammer: hasHammer ? "Yes" : "No",
      pe: pe.toFixed(1),
      pb: pb.toFixed(1),
      marketCapCr: (marketCap / 10000000).toFixed(0)
    };
  } catch (e) {
    console.error("Error analyzing", symbol, e);
    return null;
  }
}

// Main function
async function runScanner() {
  const tableBody = document.getElementById("tableBody");
  const refreshBtn = document.getElementById("refreshBtn");
  const lastUpdated = document.getElementById("lastUpdated");
  const scannedCountEl = document.getElementById("scannedCount");
  const strongCountEl = document.getElementById("strongCount");

  tableBody.innerHTML = "<tr><td colspan='10'>Scanning stocks... Please wait (this may take 20-40 seconds)</td></tr>";
  refreshBtn.disabled = true;

  let results = [];
  let strongCount = 0;

  for (let symbol of stocksList) {
    const data = await analyzeStock(symbol);
    if (data) {
      results.push(data);
      if (data.score >= 75) strongCount++;
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  tableBody.innerHTML = "";

  results.forEach(stock => {
    const row = document.createElement("tr");
    const scoreClass = stock.score >= 75 ? "score-high" : (stock.score >= 60 ? "score-medium" : "");
    
    row.innerHTML = `
      <td><strong>${stock.symbol}</strong></td>
      <td>₹${stock.price}</td>
      <td class="${scoreClass}">${stock.score}</td>
      <td>${stock.rsi}</td>
      <td>${stock.volumeSurge}</td>
      <td>${stock.trend}</td>
      <td class="${stock.hammer === 'Yes' ? 'hammer-yes' : ''}">${stock.hammer}</td>
      <td>${stock.pe}</td>
      <td>${stock.pb}</td>
      <td><a href="https://in.tradingview.com/symbols/NSE-${stock.symbol}" target="_blank">Chart</a></td>
    `;
    tableBody.appendChild(row);
  });

  scannedCountEl.textContent = results.length;
  strongCountEl.textContent = strongCount;

  const now = new Date();
  lastUpdated.textContent = `Last updated: ${now.toLocaleTimeString()}`;

  refreshBtn.disabled = false;
}

// Event listeners
document.getElementById("refreshBtn").addEventListener("click", runScanner);

// Auto run on load
window.onload = runScanner;
