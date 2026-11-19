/**
 * Page through an Airtable table. Each page is one billed API call, so
 * callers should share the finished list instead of calling this per visitor.
 */
export async function fetchAllRecords({ apiKey, baseId, tableId }) {
  const allRecords = [];
  const baseUrl = `https://api.airtable.com/v0/${baseId}/${tableId}`;
  let nextOffset;

  do {
    const url = new URL(baseUrl);
    url.searchParams.set('pageSize', '100');
    if (nextOffset) {
      url.searchParams.set('offset', nextOffset);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch from Airtable (status ${response.status}): ${errorText}`);
    }

    const page = await response.json();
    if (Array.isArray(page.records)) {
      allRecords.push(...page.records);
    }

    nextOffset = page.offset;
  } while (nextOffset);

  return allRecords;
}
