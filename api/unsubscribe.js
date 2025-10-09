/**
 * Unsubscribe API Endpoint
 * Removes a user's subscription to push notifications for a specific street
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
    console.error('[Unsubscribe] Missing Airtable API key');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const { streetId, playerId } = req.body;

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

    console.log(`[Unsubscribe] Attempting to unsubscribe player ${sanitizedPlayerId} from street ${sanitizedStreetId}`);

    // Find the subscription record
    const findUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${SUBSCRIPTIONS_TABLE_ID}`);
    findUrl.searchParams.set('filterByFormula', `AND({Street Record ID}='${sanitizedStreetId}',{OneSignal Player ID}='${sanitizedPlayerId}')`);

    const findResponse = await fetch(findUrl, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    if (!findResponse.ok) {
      throw new Error(`Failed to find subscription (status ${findResponse.status})`);
    }

    const records = await findResponse.json();

    // If no subscription found, return success (idempotent)
    if (!records.records || records.records.length === 0) {
      console.log(`[Unsubscribe] No subscription found for player ${sanitizedPlayerId} on street ${sanitizedStreetId}`);
      return res.status(200).json({ 
        success: true, 
        message: 'No subscription found (already unsubscribed)' 
      });
    }

    // Delete all matching subscriptions (should only be one, but handle duplicates)
    const deletePromises = records.records.map(async (record) => {
      const deleteUrl = `https://api.airtable.com/v0/${BASE_ID}/${SUBSCRIPTIONS_TABLE_ID}/${record.id}`;
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        },
      });

      if (!deleteResponse.ok) {
        throw new Error(`Failed to delete subscription ${record.id} (status ${deleteResponse.status})`);
      }

      return deleteResponse.json();
    });

    await Promise.all(deletePromises);
    console.log(`[Unsubscribe] Successfully deleted ${records.records.length} subscription(s) for player ${sanitizedPlayerId}`);

    return res.status(200).json({ 
      success: true, 
      message: 'Unsubscribed successfully',
      deletedCount: records.records.length 
    });

  } catch (error) {
    console.error('[Unsubscribe] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to unsubscribe',
      details: error.message 
    });
  }
}

