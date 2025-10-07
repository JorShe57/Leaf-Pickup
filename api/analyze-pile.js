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

    // Parse the N8N response format and convert to expected format
    const parsedResponse = parseN8NResponse(webhookPayload);
    return res.status(200).json(parsedResponse);
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

function parseN8NResponse(n8nResponse) {
  const timestamp = new Date().toISOString();
  
  try {
    // Handle array response format from N8N
    const responseData = Array.isArray(n8nResponse) ? n8nResponse[0] : n8nResponse;
    const content = responseData.content || responseData.message || '';
    
    // Parse the content to extract compliance information
    const isApproved = content.includes('✅ **APPROVED**') || content.includes('**APPROVED**');
    const needsCorrection = content.includes('🚫 NEEDS CORRECTION') || content.includes('**NEEDS CORRECTION**');
    
    // Extract issues from the content - look for various violation patterns
    const issues = [];
    const suggestions = [];
    
    // Look for violation patterns in different formats
    const violationPatterns = [
      /\*\*Violations\/Issues Found:\*\*\n([\s\S]*?)(?:\n---|\n\*\*|$)/,
      /\*\*Violations or Issues Found:\*\*\n([\s\S]*?)(?:\n---|\n\*\*|$)/,
      /### 4\. \*\*Violations\/Issues Found:\*\*\n([\s\S]*?)(?:\n---|\n\*\*|$)/,
      /### 4\. \*\*Violations or Issues Found:\*\*\n([\s\S]*?)(?:\n---|\n\*\*|$)/
    ];
    
    for (const pattern of violationPatterns) {
      const violationMatch = content.match(pattern);
      if (violationMatch) {
        const violationText = violationMatch[1];
        const violationLines = violationText.split('\n').filter(line => 
          line.trim() && 
          !line.includes('None observed') && 
          !line.includes('No actions needed') &&
          !line.includes('No violations found')
        );
        issues.push(...violationLines.map(line => line.replace(/^[-•❌]\s*/, '').trim()).filter(Boolean));
        break;
      }
    }
    
    // If no specific violations found, look for guideline violations in the content
    if (issues.length === 0) {
      const guidelineViolations = [];
      
      // Look for brush guideline violations
      if (content.includes('Brush Guidelines Violated:')) {
        const brushMatch = content.match(/Brush Guidelines Violated:\n([\s\S]*?)(?:\n####|\n---|\n\*\*|$)/);
        if (brushMatch) {
          const brushText = brushMatch[1];
          const brushLines = brushText.split('\n').filter(line => 
            line.trim() && line.includes('❌')
          );
          guidelineViolations.push(...brushLines.map(line => line.replace(/^[-•❌]\s*/, '').trim()).filter(Boolean));
        }
      }
      
      // Look for leaves guideline violations
      if (content.includes('Leaves Guidelines Violated:')) {
        const leavesMatch = content.match(/Leaves Guidelines Violated:\n([\s\S]*?)(?:\n####|\n---|\n\*\*|$)/);
        if (leavesMatch) {
          const leavesText = leavesMatch[1];
          const leavesLines = leavesText.split('\n').filter(line => 
            line.trim() && line.includes('❌')
          );
          guidelineViolations.push(...leavesLines.map(line => line.replace(/^[-•❌]\s*/, '').trim()).filter(Boolean));
        }
      }
      
      issues.push(...guidelineViolations);
    }
    
    // Extract suggestions from actionable instructions or generate based on violations
    const instructionPatterns = [
      /\*\*Actionable Instructions[^:]*:\*\*\n([\s\S]*?)(?:\n---|\n\*\*|$)/,
      /### 5\. \*\*Actionable Instructions[^:]*:\*\*\n([\s\S]*?)(?:\n---|\n\*\*|$)/
    ];
    
    for (const pattern of instructionPatterns) {
      const instructionMatch = content.match(pattern);
      if (instructionMatch) {
        const instructionText = instructionMatch[1];
        const instructionLines = instructionText.split('\n').filter(line => 
          line.trim() && 
          !line.includes('No actions needed') &&
          !line.includes('No corrections were needed')
        );
        suggestions.push(...instructionLines.map(line => line.replace(/^[-•]\s*/, '').trim()).filter(Boolean));
        break;
      }
    }
    
    // If no specific suggestions found, generate based on violations
    if (suggestions.length === 0) {
      if (isApproved) {
        suggestions.push('✅ Your pile meets all collection guidelines!');
        suggestions.push('✅ No changes needed - ready for collection');
      } else if (needsCorrection) {
        // Generate specific suggestions based on the content
        if (content.includes('mixed pile') || content.includes('Mix of')) {
          suggestions.push('❌ Separate brush and leaves into different piles');
          suggestions.push('❌ Brush must be bundled and tied with non-metallic binder');
          suggestions.push('❌ Leaves must be loose and separate from brush');
        }
        if (content.includes('not bundled')) {
          suggestions.push('❌ Bundle brush with non-metallic ties');
          suggestions.push('❌ Align cut ends facing the same direction');
        }
        if (content.includes('thorny') || content.includes('pricker')) {
          suggestions.push('❌ Remove thorny branches or bundle them separately');
        }
        if (content.includes('Mixed with leaves')) {
          suggestions.push('❌ Keep leaves and brush completely separate');
        }
        
        // Add general suggestions if no specific ones found
        if (suggestions.length === 0) {
          suggestions.push('Please review the guidelines and make necessary adjustments');
          suggestions.push('Ensure leaves are loose and not bagged');
          suggestions.push('Keep pile at least 3 feet from the street');
        }
      } else {
        suggestions.push('Please review the guidelines and make necessary adjustments');
        suggestions.push('Ensure leaves are loose and not bagged');
        suggestions.push('Keep pile at least 3 feet from the street');
      }
    }
    
    // Calculate confidence based on content analysis
    let confidence = 75; // Default confidence
    if (content.includes('clearly') || content.includes('appears to be')) {
      confidence = 85;
    }
    if (content.includes('fully comply') || content.includes('full compliance')) {
      confidence = 95;
    }
    if (content.includes('appears to') || content.includes('may be')) {
      confidence = 70;
    }
    if (content.includes('not verifiable') || content.includes('not visible')) {
      confidence = 60;
    }
    
    return {
      compliant: isApproved && !needsCorrection,
      confidence: confidence,
      issues: issues,
      suggestions: suggestions,
      analysisTimestamp: timestamp,
      rawContent: content,
      analysisMethod: 'n8n-openai-analysis'
    };
    
  } catch (error) {
    console.error('Error parsing N8N response:', error);
    return {
      compliant: false,
      confidence: 0,
      issues: ['Failed to parse analysis results'],
      suggestions: ['Please try again with a clearer photo'],
      analysisTimestamp: timestamp,
      rawContent: JSON.stringify(n8nResponse),
      analysisMethod: 'n8n-openai-analysis-error'
    };
  }
}
