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

  const imageData = payload?.image;
  if (!imageData) {
    return res.status(400).json({ error: 'Missing image data' });
  }

  const { filename } = payload ?? {};
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    return res.status(200).json({
      compliant: true,
      confidence: 75,
      issues: [],
      suggestions: [
        'N8N webhook URL is not configured. Update the N8N_WEBHOOK_URL environment variable to enable live analysis.',
        'For now, assume the pile follows standard guidelines: keep it loose, reachable, and free from large debris.',
      ],
      analysisTimestamp: new Date().toISOString(),
    });
  }

  try {
    console.log('Calling N8N webhook:', webhookUrl);
    console.log('Image data size:', imageData.length);
    
    // Add timeout and better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Westlake-Leaf-Tracker/1.0'
      },
      body: JSON.stringify({ 
        image: imageData, 
        filename: filename || 'leaf-pile.jpg',
        timestamp: new Date().toISOString()
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log('Webhook response status:', webhookResponse.status);
    console.log('Webhook response headers:', Object.fromEntries(webhookResponse.headers.entries()));

    const responseText = await webhookResponse.text();
    console.log('Webhook response body:', responseText);

    if (!webhookResponse.ok) {
      throw new Error(`Webhook returned status ${webhookResponse.status}: ${responseText}`);
    }

    if (!responseText) {
      return res.status(200).json({
        compliant: false,
        confidence: 0,
        issues: ['The automation returned an empty response.'],
        suggestions: ['Check the n8n workflow output formatting and try again.'],
        analysisTimestamp: new Date().toISOString(),
      });
    }

    let webhookPayload;
    try {
      webhookPayload = JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to parse webhook response:', error);
      return res.status(200).json({
        compliant: false,
        confidence: 0,
        issues: ['Received a non-JSON response from the automation.'],
        suggestions: ['Ensure the n8n workflow returns valid JSON.'],
        rawResponse: responseText,
        analysisTimestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json(webhookPayload);
  } catch (error) {
    console.error('Error calling n8n webhook:', error);
    
    // Provide more specific error messages
    let errorMessage = 'The automation could not be reached or responded with an error.';
    let suggestions = ['Please retry in a few minutes or contact support if the issue persists.'];
    
    if (error.name === 'AbortError') {
      errorMessage = 'The automation took too long to respond.';
      suggestions = ['The analysis is taking longer than expected. Please try again with a smaller image.'];
    } else if (error.message.includes('500')) {
      errorMessage = 'The N8N workflow encountered an internal error.';
      suggestions = [
        'Check your N8N workflow configuration.',
        'Verify your OpenAI API key is valid.',
        'Ensure the workflow is activated in N8N.'
      ];
    } else if (error.message.includes('404')) {
      errorMessage = 'The webhook URL was not found.';
      suggestions = [
        'Check your N8N_WEBHOOK_URL environment variable.',
        'Verify the webhook is active in your N8N instance.'
      ];
    }
    
    return res.status(502).json({
      error: 'Failed to contact leaf pile analysis automation.',
      details: error.message,
      compliant: false,
      confidence: 0,
      issues: [errorMessage],
      suggestions: suggestions,
      analysisTimestamp: new Date().toISOString(),
    });
  }
}
