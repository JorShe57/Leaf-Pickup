/**
 * Subscribe API Endpoint
 * Note: Temporarily disabled during transition to new alerts platform
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const BASE_ID = 'appsnAjoLIt7DzTzF';
  const SUBSCRIPTIONS_TABLE_ID = 'tblkL5V0BMP6UsSPx'; // Update this with actual table ID

  if (!AIRTABLE_API_KEY) {
    console.error('[Subscribe] Missing Airtable API key');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const { streetId, playerId, streetName } = req.body;

    // Validate input
    if (!streetId || typeof streetId !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing streetId' });
    }

    console.log(`[Subscribe] Subscribe request received for street ${streetId}`);
    console.log(`[Subscribe] Notifications temporarily disabled during platform transition`);

    // Return success but don't actually create subscription
    return res.status(200).json({ 
      success: false, 
      message: 'Notifications are currently being migrated to a new platform. Check back soon!',
      temporarilyDisabled: true
    });

  } catch (error) {
    console.error('[Subscribe] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to process subscription request',
      details: error.message 
    });
  }
}

