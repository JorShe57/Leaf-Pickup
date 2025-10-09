/**
 * Check Subscription API Endpoint
 * Checks if a user is subscribed to push notifications for a specific street
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

    if (!playerId || typeof playerId !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing playerId' });
    }

    // Sanitize inputs
    const sanitizedStreetId = streetId.trim();
    const sanitizedPlayerId = playerId.trim();

    // Query for existing subscription
    const checkUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${SUBSCRIPTIONS_TABLE_ID}`);
    checkUrl.searchParams.set('filterByFormula', `AND({Street Record ID}='${sanitizedStreetId}',{OneSignal Player ID}='${sanitizedPlayerId}')`);
    checkUrl.searchParams.set('maxRecords', '1');

    const checkResponse = await fetch(checkUrl, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    if (!checkResponse.ok) {
      throw new Error(`Failed to check subscription (status ${checkResponse.status})`);
    }

    const records = await checkResponse.json();

    const isSubscribed = records.records && records.records.length > 0;

    return res.status(200).json({ 
      subscribed: isSubscribed,
      subscriptionId: isSubscribed ? records.records[0].id : null
    });

  } catch (error) {
    console.error('[CheckSubscription] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to check subscription status',
      details: error.message 
    });
  }
}

