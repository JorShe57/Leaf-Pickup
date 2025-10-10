import { withRateLimit, RATE_LIMITS } from './_rate-limiter.js';

async function handler(req, res) {
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
    const responseDataRaw = Array.isArray(n8nResponse)
      ? n8nResponse.find((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) ?? n8nResponse[0]
      : n8nResponse;

    const responseData = responseDataRaw && typeof responseDataRaw === 'object' ? responseDataRaw : {};
    const contentSource =
      responseData.report ??
      responseData.content ??
      responseData.message ??
      responseData.analysis ??
      responseData.data ??
      null;

    const reportContentRaw = normalizeReportContent(contentSource ?? responseData);
    const reportContent = reportContentRaw || 'Analysis completed, but no detailed report was provided.';

    const complianceFromPayload =
      typeof responseData.compliant === 'boolean' ? responseData.compliant : null;
    const inferredCompliance = inferComplianceFromContent(reportContent);
    const compliant = complianceFromPayload !== null ? complianceFromPayload : inferredCompliance;

    const confidence = normalizeConfidence(responseData.confidence);
    const issues = normalizeStringArray(responseData.issues);
    const suggestions = normalizeStringArray(responseData.suggestions);

    return {
      compliant,
      confidence,
      issues,
      suggestions,
      analysisTimestamp: timestamp,
      reportContent,
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

function normalizeConfidence(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(100, Math.round(numeric)));
  }
  return 85;
}

function normalizeStringArray(value) {
  if (!value && value !== 0) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item && item !== 0) {
          return '';
        }
        if (typeof item === 'string') {
          return item.trim();
        }
        if (item && typeof item === 'object') {
          if (typeof item.message === 'string') {
            return item.message.trim();
          }
          if (typeof item.text === 'string') {
            return item.text.trim();
          }
        }
        return String(item).trim();
      })
      .map((text) => text.replace(/^[*-]\s*/, ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\n+/)
      .map((line) => line.trim())
      .map((line) => line.replace(/^[*-]\s*/, ''))
      .filter(Boolean);
  }

  return [];
}

function inferComplianceFromContent(content) {
  if (typeof content !== 'string' || !content.trim()) {
    return false;
  }

  const lowered = content.toLowerCase();

  const hasApproveIndicator =
    lowered.includes('✅') ||
    lowered.includes('approved') ||
    lowered.includes('ready for pickup');

  const hasRejectionIndicator =
    lowered.includes('❌') ||
    lowered.includes('needs correction') ||
    lowered.includes('issue') ||
    lowered.includes('not compliant');

  if (hasApproveIndicator && !hasRejectionIndicator) {
    return true;
  }

  if (hasRejectionIndicator && !hasApproveIndicator) {
    return false;
  }

  return hasApproveIndicator;
}

function normalizeReportContent(value, depth = 0) {
  const MAX_DEPTH = 4;

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (depth >= MAX_DEPTH) {
    return String(value);
  }

  if (Array.isArray(value)) {
    const indent = '  '.repeat(depth);
    const nestedIndent = '  '.repeat(depth + 1);

    return value
      .map((item) => {
        const normalized = normalizeReportContent(item, depth + 1);
        if (!normalized) {
          return '';
        }

        const prepared = normalized
          .split('\n')
          .map((line, index) => (index === 0 ? line : `${nestedIndent}${line}`))
          .join('\n');

        return `${indent}- ${prepared}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof value === 'object') {
    if (typeof value.markdown === 'string') {
      return value.markdown.trim();
    }

    if (typeof value.text === 'string') {
      return value.text.trim();
    }

    if (typeof value.html === 'string') {
      return value.html.trim();
    }

    if (Array.isArray(value.sections)) {
      return value.sections
        .map((section) => {
          const title =
            section && typeof section.title === 'string'
              ? section.title.trim()
              : '';

          const bodySource =
            section && (section.content ?? section.body ?? section.items ?? section.details);

          const body = normalizeReportContent(bodySource, depth + 1);

          if (!title && !body) {
            return '';
          }

          const heading =
            title ? `${'#'.repeat(Math.min(depth + 2, 6))} ${title}` : '';

          return [heading, body].filter(Boolean).join('\n').trim();
        })
        .filter(Boolean)
        .join('\n\n');
    }

    const entries = Object.entries(value)
      .map(([key, val]) => {
        const normalized = normalizeReportContent(val, depth + 1);
        if (!normalized) {
          return '';
        }

        const headingLevel = Math.min(depth + 2, 6);
        const heading = `${'#'.repeat(headingLevel)} ${humanizeKey(key)}`;

        return `${heading}\n${normalized}`;
      })
      .filter(Boolean);

    if (entries.length) {
      return entries.join('\n\n');
    }
  }

  return String(value);
}

function humanizeKey(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  const spaced = str
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  if (!spaced) {
    return str;
  }

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Export handler with rate limiting (30 requests/hour)
export default withRateLimit(handler, RATE_LIMITS.ANALYSIS);
