/**
 * Check Subscription API Endpoint
 * Note: Temporarily disabled during transition to new alerts platform
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const BASE_ID = 'appsnAjoLIt7DzTzF';
  const SUBSCRIPTIONS_TABLE_ID = 'tblkL5V0BMP6UsSPx'; // Update this with actual table ID

  if (!AIRTABLE_API_KEY) {
    console.error('[CheckSubscription] Missing Airtable API key');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const { streetId, playerId } = req.query;

    // Validate input
    if (!streetId || typeof streetId !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing streetId' });
    }

    console.log(`[CheckSubscription] Check request received for street ${streetId}`);
    console.log(`[CheckSubscription] Notifications temporarily disabled during platform transition`);

    // Always return not subscribed during transition
    return res.status(200).json({ 
      subscribed: false,
      subscriptionId: null,
      temporarilyDisabled: true
    });

  } catch (error) {
    console.error('[CheckSubscription] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to check subscription status',
      details: error.message 
    });
  }
}

