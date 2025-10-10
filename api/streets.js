import { withRateLimit, RATE_LIMITS } from './_rate-limiter.js';

async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const BASE_ID = 'appsnAjoLIt7DzTzF';
    const TABLE_ID = 'tbl4UnzoSzUFAnoKH';
  
    if (!AIRTABLE_API_KEY) {
      console.error('Missing Airtable API key');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }
  
    try {
      const allRecords = [];
      const baseUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;
      let nextOffset;
  
      do {
        const url = new URL(baseUrl);
        url.searchParams.set('pageSize', '100');
  
        if (nextOffset) {
          url.searchParams.set('offset', nextOffset);
        }
  
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          },
        });
  
        if (!response.ok) {
          throw new Error(`Failed to fetch from Airtable (status ${response.status})`);
        }
  
        const page = await response.json();
        if (Array.isArray(page.records)) {
          allRecords.push(...page.records);
        }
  
        nextOffset = page.offset;
      } while (nextOffset);
  
      const records = allRecords.map(record => ({
        id: record.id,
        routeNumber: record.fields['Route Number'],
        street: record.fields['Street'],
        dateStarted: record.fields['Date Started'],
        status: record.fields['Status'],
        dateCompleted: record.fields['Date Completed'],
        notes: record.fields['Notes'] || '',
      }));
  
      res.status(200).json({ records });
    } catch (error) {
      console.error('Error fetching data:', error);
      res.status(500).json({ error: 'Failed to fetch street data' });
    }
  }

// Export handler with rate limiting (100 requests/hour)
export default withRateLimit(handler, RATE_LIMITS.READ);
