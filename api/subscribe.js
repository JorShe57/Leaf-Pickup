/**
 * Subscribe API Endpoint
 * Saves a user's subscription to push notifications for a specific street
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

    if (!playerId || typeof playerId !== 'string') {
      return res.status(400).json({ error: 'Invalid or missing playerId' });
    }

    // Sanitize inputs
    const sanitizedStreetId = streetId.trim();
    const sanitizedPlayerId = playerId.trim();

    console.log(`[Subscribe] Attempting to subscribe player ${sanitizedPlayerId} to street ${sanitizedStreetId}`);

    // Check for existing subscription
    const checkUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${SUBSCRIPTIONS_TABLE_ID}`);
    checkUrl.searchParams.set('filterByFormula', `AND({Street Record ID}='${sanitizedStreetId}',{OneSignal Player ID}='${sanitizedPlayerId}')`);

    const checkResponse = await fetch(checkUrl, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    if (!checkResponse.ok) {
      throw new Error(`Failed to check existing subscriptions (status ${checkResponse.status})`);
    }

    const existingRecords = await checkResponse.json();

    // If subscription already exists, return success
    if (existingRecords.records && existingRecords.records.length > 0) {
      console.log(`[Subscribe] Subscription already exists for player ${sanitizedPlayerId} on street ${sanitizedStreetId}`);
      return res.status(200).json({ 
        success: true, 
        message: 'Already subscribed',
        subscriptionId: existingRecords.records[0].id 
      });
    }

    // Create new subscription
    const createUrl = `https://api.airtable.com/v0/${BASE_ID}/${SUBSCRIPTIONS_TABLE_ID}`;
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          'Street Record ID': [sanitizedStreetId], // Link field (array of record IDs)
          'OneSignal Player ID': sanitizedPlayerId,
        },
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error(`[Subscribe] Airtable API error (${createResponse.status}):`, errorText);
      throw new Error(`Failed to create subscription (status ${createResponse.status})`);
    }

    const newRecord = await createResponse.json();
    console.log(`[Subscribe] Successfully created subscription ${newRecord.id} for player ${sanitizedPlayerId}`);

    return res.status(201).json({ 
      success: true, 
      message: 'Subscription created',
      subscriptionId: newRecord.id 
    });

  } catch (error) {
    console.error('[Subscribe] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to create subscription',
      details: error.message 
    });
  }
}

