/**
 * Notify Status Change Webhook Handler
 * SECURITY CRITICAL: Receives webhooks from Airtable when street status changes
 * and sends push notifications to subscribed users via OneSignal
 */
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Webhook-Secret');
  
  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CRITICAL SECURITY: Validate webhook secret token
  const providedToken = req.headers['x-webhook-secret'];
  const expectedToken = process.env.WEBHOOK_SECRET_TOKEN;

  if (!expectedToken) {
    console.error('[Notify] WEBHOOK_SECRET_TOKEN not configured');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (providedToken !== expectedToken) {
    console.error('[Notify] Invalid webhook secret token provided');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
  const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
  const BASE_ID = 'appsnAjoLIt7DzTzF';
  const SUBSCRIPTIONS_TABLE_ID = 'tblkL5V0BMP6UsSPx'; // Update this with actual table ID

  if (!AIRTABLE_API_KEY || !ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.error('[Notify] Missing required environment variables');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const { street_id, old_status, new_status, street_name, route_number } = req.body;

    // Validate input
    if (!street_id || !new_status) {
      console.error('[Notify] Missing required fields in webhook payload');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`[Notify] Received status change webhook for street ${street_id}: ${old_status} → ${new_status}`);

    // Normalize status values
    const normalizeStatus = (status) => {
      if (!status) return null;
      const normalized = status.trim().toLowerCase();
      if (normalized === 'not started') return 'Not Started';
      if (normalized === 'in progress' || normalized === 'in-progress') return 'In Progress';
      if (normalized === 'completed' || normalized === 'complete') return 'Completed';
      return status;
    };

    const oldStatusNormalized = normalizeStatus(old_status);
    const newStatusNormalized = normalizeStatus(new_status);

    // Check if this status change requires notification
    const shouldNotify = 
      (oldStatusNormalized === 'Not Started' && newStatusNormalized === 'In Progress') ||
      (oldStatusNormalized === 'In Progress' && newStatusNormalized === 'Completed');

    if (!shouldNotify) {
      console.log(`[Notify] Status change ${oldStatusNormalized} → ${newStatusNormalized} does not require notification`);
      return res.status(200).json({ 
        success: true, 
        message: 'Status change noted, no notification required' 
      });
    }

    console.log(`[Notify] Status change requires notification: ${oldStatusNormalized} → ${newStatusNormalized}`);

    // Query all subscriptions for this street
    const subscriptionsUrl = new URL(`https://api.airtable.com/v0/${BASE_ID}/${SUBSCRIPTIONS_TABLE_ID}`);
    subscriptionsUrl.searchParams.set('filterByFormula', `{Street Record ID}='${street_id}'`);

    const subscriptionsResponse = await fetch(subscriptionsUrl, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    if (!subscriptionsResponse.ok) {
      throw new Error(`Failed to fetch subscriptions (status ${subscriptionsResponse.status})`);
    }

    const subscriptionsData = await subscriptionsResponse.json();
    const subscriptions = subscriptionsData.records || [];

    if (subscriptions.length === 0) {
      console.log(`[Notify] No subscriptions found for street ${street_id}`);
      return res.status(200).json({ 
        success: true, 
        message: 'No subscribers to notify' 
      });
    }

    // Extract OneSignal player IDs
    const playerIds = subscriptions
      .map(sub => sub.fields['OneSignal Player ID'])
      .filter(Boolean);

    if (playerIds.length === 0) {
      console.log(`[Notify] No valid player IDs found in subscriptions`);
      return res.status(200).json({ 
        success: true, 
        message: 'No valid subscribers to notify' 
      });
    }

    console.log(`[Notify] Found ${playerIds.length} subscribers for street ${street_id}`);

    // Prepare notification message
    let notificationHeading = 'Leaf Collection Update';
    let notificationMessage = '';

    if (newStatusNormalized === 'In Progress') {
      notificationHeading = '🍂 Collection Started!';
      notificationMessage = `Leaf collection has started on ${street_name || 'your street'}${route_number ? ` (Route ${route_number})` : ''}. Crews are working in your area now.`;
    } else if (newStatusNormalized === 'Completed') {
      notificationHeading = '✅ Collection Complete';
      notificationMessage = `Leaf collection has been completed on ${street_name || 'your street'}${route_number ? ` (Route ${route_number})` : ''}. Thank you for your patience!`;
    }

    // Send push notification via OneSignal REST API
    const oneSignalUrl = 'https://onesignal.com/api/v1/notifications';
    const oneSignalPayload = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { en: notificationHeading },
      contents: { en: notificationMessage },
      url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://leaftracker.vercel.app',
      web_push_topic: `street-${street_id}`,
    };

    console.log(`[Notify] Sending notification to ${playerIds.length} players via OneSignal`);

    const oneSignalResponse = await fetch(oneSignalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(oneSignalPayload),
    });

    if (!oneSignalResponse.ok) {
      const errorText = await oneSignalResponse.text();
      console.error(`[Notify] OneSignal API error (${oneSignalResponse.status}):`, errorText);
      throw new Error(`Failed to send notification (status ${oneSignalResponse.status})`);
    }

    const oneSignalResult = await oneSignalResponse.json();
    console.log(`[Notify] Successfully sent notification. OneSignal response:`, oneSignalResult);

    // Optional: Update Last Notified timestamp in subscriptions
    // (Can be implemented if needed for tracking)

    return res.status(200).json({ 
      success: true, 
      message: 'Notifications sent successfully',
      notifiedCount: playerIds.length,
      oneSignalId: oneSignalResult.id
    });

  } catch (error) {
    console.error('[Notify] Error processing webhook:', error);
    return res.status(500).json({ 
      error: 'Failed to process notification',
      details: error.message 
    });
  }
}

