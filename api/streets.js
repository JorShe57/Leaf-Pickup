import { withRateLimit, RATE_LIMITS } from './_rate-limiter.js';
import { fetchAllRecords } from './_airtable.js';
import { setPublicReadCache, setUncached, singleFlight } from './_public-cache.js';

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method !== 'GET') {
    setUncached(res);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
  const BASE_ID = 'appsnAjoLIt7DzTzF';
  const TABLE_ID = 'tbl4UnzoSzUFAnoKH';

  if (!AIRTABLE_API_KEY) {
    console.error('Missing Airtable API key');
    setUncached(res);
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const payload = await singleFlight(`airtable:${BASE_ID}:${TABLE_ID}`, async () => {
      const allRecords = await fetchAllRecords({
        apiKey: AIRTABLE_API_KEY,
        baseId: BASE_ID,
        tableId: TABLE_ID,
      });

      const records = allRecords.map((record) => {
        const fields = record.fields || {};
        return {
          id: record.id,
          routeNumber: fields['Route Number'],
          street: fields['Street'],
          dateStarted: fields['Date Started'],
          status: fields['Status'],
          dateCompleted: fields['Date Completed'],
          notes: fields['Notes'] || '',
        };
      });

      return {
        records,
        // Travels with the cached body, so the page can show when Airtable
        // was actually read rather than when this visitor received the copy.
        fetchedAt: new Date().toISOString(),
      };
    });

    setPublicReadCache(res);
    res.status(200).json(payload);
  } catch (error) {
    console.error('Error fetching data:', error);
    setUncached(res);
    res.status(500).json({ error: 'Failed to fetch street data' });
  }
}

// Export handler with rate limiting (100 requests/hour)
export default withRateLimit(handler, RATE_LIMITS.READ);
