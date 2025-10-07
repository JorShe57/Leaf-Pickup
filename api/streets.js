export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  
    const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
    const BASE_ID = 'appsnAjoLIt7DzTzF';
    const TABLE_ID = 'tbl4UnzoSzUFAnoKH';
  
    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`,
        {
          headers: {
            Authorization: `Bearer ${AIRTABLE_API_KEY}`,
          },
        }
      );
  
      if (!response.ok) {
        throw new Error('Failed to fetch from Airtable');
      }
  
      const data = await response.json();
      
      // Transform the data to a cleaner format
      const records = data.records.map(record => ({
        id: record.id,
        routeNumber: record.fields['Route Number'],
        street: record.fields['Street'],
        dateStarted: record.fields['Date Started'],
        status: record.fields['Status'],
        dateCompleted: record.fields['Date Completed'],
      }));
  
      res.status(200).json({ records });
    } catch (error) {
      console.error('Error fetching data:', error);
      res.status(500).json({ error: 'Failed to fetch street data' });
    }
  }