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
    
    // Convert base64 to Blob for file upload
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    const binaryData = Buffer.from(base64Data, 'base64');
    const blob = new Blob([binaryData], { type: 'image/jpeg' });
    
    // Create FormData for multipart/form-data upload
    const formData = new FormData();
    formData.append('Photo', blob, filename || 'leaf-pile.jpg');
    formData.append('timestamp', new Date().toISOString());
    formData.append('source', 'westlake-leaf-tracker');
    
    console.log('Sending FormData with Photo field');
    
    // Add timeout and better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 
        'User-Agent': 'Westlake-Leaf-Tracker/1.0'
        // Note: Don't set Content-Type header - let fetch set it automatically for FormData
      },
      body: formData,
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

    // Return the N8N response as a formatted report
    const reportResponse = formatN8NReport(webhookPayload);
    return res.status(200).json(reportResponse);
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

function formatN8NReport(n8nResponse) {
  const timestamp = new Date().toISOString();
  
  try {
    // Handle array response format from N8N
    const responseData = Array.isArray(n8nResponse) ? n8nResponse[0] : n8nResponse;
    const content = responseData.content || responseData.message || '';
    
    // Determine compliance status from content
    const isApproved = content.includes('✅ **APPROVED**') || content.includes('**APPROVED**');
    const needsCorrection = content.includes('❌ **NEEDS CORRECTION**') || content.includes('**NEEDS CORRECTION**');
    
    return {
      compliant: isApproved && !needsCorrection,
      confidence: 85, // Default confidence for AI analysis
      issues: [], // Will be displayed in the report content
      suggestions: [], // Will be displayed in the report content
      analysisTimestamp: timestamp,
      reportContent: content, // Full AI analysis content
      analysisMethod: 'n8n-openai-analysis'
    };
    
  } catch (error) {
    console.error('Error formatting N8N report:', error);
    return {
      compliant: false,
      confidence: 0,
      issues: ['Failed to process analysis results'],
      suggestions: ['Please try again with a clearer photo'],
      analysisTimestamp: timestamp,
      reportContent: 'Analysis failed to load. Please try again.',
      analysisMethod: 'n8n-openai-analysis-error'
    };
  }
}
