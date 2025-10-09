/**
 * Email Alert Subscription API Endpoint
 * Handles email alert subscriptions for leaf pickup status updates
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
  const SUBSCRIPTIONS_TABLE_ID = 'tblkL5V0BMP6UsSPx';

  if (!AIRTABLE_API_KEY) {
    console.error('[Subscribe Email] Missing Airtable API key');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const { subscriberName, email, streetId } = req.body;

    // Validate required fields
    if (!subscriberName || !email || !streetId) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'subscriberName, email, and streetId are required'
      });
    }

    // Validate field types
    if (typeof subscriberName !== 'string' || typeof email !== 'string' || typeof streetId !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid field types',
        details: 'All required fields must be strings'
      });
    }

    console.log(`[Subscribe Email] Creating subscription for ${subscriberName} (${email}) on street ${streetId}`);

    // Create Airtable record
    const response = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${SUBSCRIPTIONS_TABLE_ID}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            'Subscriber Name': subscriberName,
            'Email': email,
            'Street': [streetId], // Link to street record
            'Active': true
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Subscribe Email] Airtable API error:', response.status, errorData);
      throw new Error(errorData.error?.message || 'Airtable API error');
    }

    const data = await response.json();
    console.log(`[Subscribe Email] Successfully created subscription record ${data.id}`);
    
    return res.status(200).json({ 
      success: true,
      recordId: data.id,
      message: 'Successfully subscribed to email alerts'
    });
    
  } catch (error) {
    console.error('[Subscribe Email] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to create subscription',
      details: error.message 
    });
  }
}

