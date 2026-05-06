export function analyzeMarket({ vix, pe, fg }) {
  let score = 0;

  let vixAnalysis = "";
  let peAnalysis = "";
  let fgAnalysis = "";

  if (vix.current > 30) {
    score += 2;
    vixAnalysis = "VIX is above 30, indicating elevated market fear. This can be a potential buying signal.";
  } else if (vix.current >= 20) {
    score += 1;
    vixAnalysis = "VIX is between 20 and 30, showing moderate market stress.";
  } else if (vix.current < 14) {
    score -= 2;
    vixAnalysis = "VIX is below 14, suggesting low fear and possible market complacency.";
  } else {
    vixAnalysis = "VIX is in a neutral range. No strong fear signal is present.";
  }

  if (pe.value > 35) {
    score -= 2;
    peAnalysis = "Nasdaq 100 PE is above 35, suggesting valuation risk is elevated.";
  } else if (pe.value >= 32) {
    score -= 1;
    peAnalysis = "Nasdaq 100 PE is between 32 and 35, indicating valuation is somewhat expensive.";
  } else if (pe.value < 28) {
    score += 2;
    peAnalysis = "Nasdaq 100 PE is below 28, suggesting valuation is more attractive.";
  } else {
    peAnalysis = "Nasdaq 100 PE is in a neutral valuation range.";
  }

  if (fg.score > 80) {
    score -= 2;
    fgAnalysis = "Fear & Greed is above 80, indicating extreme greed and elevated sentiment risk.";
  } else if (fg.score >= 65) {
    score -= 1;
    fgAnalysis = "Fear & Greed is above 65, showing greed but not extreme greed.";
  } else if (fg.score < 25) {
    score += 2;
    fgAnalysis = "Fear & Greed is below 25, indicating extreme fear and potential opportunity.";
  } else {
    fgAnalysis = "Fear & Greed is in a neutral range.";
  }

  let signal = "HOLD";

  if (score >= 3) signal = "STRONG_BUY";
  else if (score >= 1) signal = "BUY_DCA";
  else if (score <= -3) signal = "TAKE_PROFIT";
  else if (score <= -1) signal = "CAUTION";

  const overallAnalysis =
    `Overall signal is ${signal}. Current score is ${score}. ` +
    `The system combines volatility, valuation, and sentiment. ` +
    `This is a rules-based signal, not a price prediction.`;

  return {
    score,
    signal,
    vixAnalysis,
    peAnalysis,
    fgAnalysis,
    overallAnalysis
  };
}