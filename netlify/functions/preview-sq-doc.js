// Downloads the original SQ .docx from storage, converts to HTML via mammoth,
// returns structured HTML with section markers for client-side locking
const mammoth = require('mammoth');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { tenderId } = JSON.parse(event.body || '{}');
    if (!tenderId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing tenderId' }) };

    const sbKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    // 1. Get tender to find storage path
    const tRes = await fetch(`${sbUrl}/rest/v1/tenders?id=eq.${tenderId}&select=sq_data,title`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
    });
    const tData = await tRes.json();
    const tender = tData && tData[0];
    if (!tender || !tender.sq_data || !tender.sq_data.storagePath) {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'No SQ document uploaded for this tender' }) };
    }

    // 2. Download original .docx from storage
    const docRes = await fetch(
      `${sbUrl}/storage/v1/object/sq-docs/${tender.sq_data.storagePath}`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
    );
    if (!docRes.ok) throw new Error('Could not download SQ document');
    const docBuffer = Buffer.from(await docRes.arrayBuffer());

    // 3. Convert to HTML with mammoth
    const result = await mammoth.convertToHtml(
      { buffer: docBuffer },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h2.sq-heading:fresh",
          "p[style-name='Heading 2'] => h3.sq-subheading:fresh",
          "table => table.sq-table",
        ]
      }
    );

    const html = result.value;

    // 4. Split into sections by detecting table blocks and headings
    // Mark the first table/section as visible, rest as locked
    // We do this by splitting on heading tags and table groups
    const sections = splitIntoSections(html);

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        sections: sections,
        tenderTitle: tender.title || '',
        sqTitle: tender.sq_data.sq_title || '',
        commissioner: tender.sq_data.commissioner || ''
      })
    };

  } catch(err) {
    console.error('preview-sq-doc error:', err.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};

function splitIntoSections(html) {
  // Split HTML into logical sections
  // Each section = a heading + its following content until next heading
  const sections = [];

  // Add section markers around heading-grouped content
  // Use a simple approach: split by <h2> or <h3> or by major table groups
  const parts = html.split(/(?=<h[23][^>]*>|<p[^>]*><strong>Part |<p[^>]*><strong>Section )/i);

  parts.forEach(function(part, i) {
    if (!part.trim()) return;
    // Extract a title from the first heading or bold paragraph
    var titleMatch = part.match(/<h[23][^>]*>(.*?)<\/h[23]>|<strong>(Part [^<]+|Section [^<]+)<\/strong>/i);
    var title = titleMatch ? titleMatch[1] || titleMatch[2] : ('Section ' + (i + 1));
    // Clean HTML tags from title
    title = title.replace(/<[^>]+>/g, '').trim();

    sections.push({
      index: i,
      title: title || ('Section ' + (i + 1)),
      html: part
    });
  });

  // If splitting produced no useful sections, return whole doc as one section
  if (sections.length <= 1) {
    // Try splitting by tables instead
    const tableBlocks = html.split('</table>');
    if (tableBlocks.length > 1) {
      return tableBlocks.map(function(block, i) {
        return {
          index: i,
          title: i === 0 ? 'Supplier Information' : ('Section ' + (i + 1)),
          html: block + (i < tableBlocks.length - 1 ? '</table>' : '')
        };
      }).filter(function(s) { return s.html.trim(); });
    }
    return [{ index: 0, title: 'Selection Questionnaire', html: html }];
  }

  return sections;
}
