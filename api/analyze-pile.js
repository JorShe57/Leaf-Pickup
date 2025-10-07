export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
  }

  const image = payload?.image;
  if (!image) {
    return res.status(400).json({ error: 'Missing image data' });
  }

  // Simulate async analysis time
  await new Promise((resolve) => setTimeout(resolve, 600));

  const issues = [];
  const suggestions = [];
  const random = Math.random();

  if (random < 0.25) {
    issues.push('Leaves look bagged; loose piles are required.');
    suggestions.push('Empty leaves from bags so the vacuum trucks can collect them.');
  }

  if (random < 0.18) {
    issues.push('Pile may be too close to the curb.');
    suggestions.push('Shift the pile back at least three feet to keep storm drains clear.');
  }

  if (random < 0.12) {
    issues.push('Large branches detected in the pile.');
    suggestions.push('Remove sticks thicker than three inches to avoid clogging the vacuums.');
  }

  if (random < 0.08) {
    issues.push('Non-leaf debris mixed with pile.');
    suggestions.push('Remove trash or mixed yard waste; only leaves are accepted.');
  }

  const compliant = issues.length === 0;
  if (compliant) {
    suggestions.push('Your pile looks compliant. Keep it loose and reachable for crews.');
  }

  return res.status(200).json({
    compliant,
    confidence: compliant ? 86 : 70,
    issues,
    suggestions,
    analysisTimestamp: new Date().toISOString(),
  });
}
