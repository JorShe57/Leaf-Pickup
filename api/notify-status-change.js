/**
 * Notify Status Change Webhook Handler
 * SECURITY CRITICAL: Receives webhooks from Airtable when street status changes
 * Note: Push notification functionality removed - transitioning to new alerts platform
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
  const BASE_ID = 'appsnAjoLIt7DzTzF';
  const SUBSCRIPTIONS_TABLE_ID = 'tblkL5V0BMP6UsSPx'; // Update this with actual table ID

  if (!AIRTABLE_API_KEY) {
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

    // TODO: Integrate with new alerts platform
    // For now, log the status change and return success
    console.log(`[Notify] Status change notification needed for street ${street_id}`);
    console.log(`[Notify] ${oldStatusNormalized} → ${newStatusNormalized}`);
    console.log(`[Notify] Street: ${street_name || 'Unknown'}, Route: ${route_number || 'N/A'}`);

    return res.status(200).json({ 
      success: true, 
      message: 'Status change logged (notifications temporarily disabled during platform transition)',
      street_id,
      old_status: oldStatusNormalized,
      new_status: newStatusNormalized
    });

  } catch (error) {
    console.error('[Notify] Error processing webhook:', error);
    return res.status(500).json({ 
      error: 'Failed to process notification',
      details: error.message 
    });
  }
}

