// Downloads the original SQ .docx, fills in answers by manipulating the XML,
// and returns the completed document as base64
const JSZip = require('jszip');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const { tenderId, companyDetails, sqAnswers, sqData } = JSON.parse(event.body);
    if (!tenderId || !sqData) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Missing data' }) };

    const sbKey = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY);
    const sbUrl = 'https://igpjfpncfuawikoyzfcd.supabase.co';

    // ── 1. Download original .docx from Supabase Storage ──
    if (!sqData.storagePath) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No original SQ document stored. Please re-upload the SQ in the admin panel.' }) };
    }

    var docRes = await fetch(
      sbUrl + '/storage/v1/object/sq-docs/' + sqData.storagePath,
      { headers: { apikey: sbKey, Authorization: 'Bearer ' + sbKey } }
    );
    if (!docRes.ok) throw new Error('Could not download original SQ document from storage');
    var docBuffer = await docRes.arrayBuffer();

    // ── 2. Load with JSZip ──
    var zip = await JSZip.loadAsync(docBuffer);
    var xmlContent = await zip.file('word/document.xml').async('string');

    // ── 3. Build answers map from company details + sq answers ──
    var co = companyDetails || {};
    var answersMap = buildAnswersMap(co, sqData, sqAnswers || {});

    // ── 4. Fill the document XML ──
    var filledXml = fillDocumentXml(xmlContent, sqData, answersMap);

    // ── 5. Write back and re-zip ──
    zip.file('word/document.xml', filledXml);
    var filledBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    var filledBase64 = filledBuffer.toString('base64');

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        docBase64: filledBase64,
        fileName: (sqData.fileName || 'selection_questionnaire').replace('.docx','') + '_completed.docx'
      })
    };

  } catch(err) {
    console.error('fill-sq-doc error:', err.message);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message || 'Failed to fill document' }) };
  }
};

// Build a map of question text → answer
function buildAnswersMap(co, sqData, sqAnswers) {
  var map = {};

  // Profile key → value mapping
  var profileMap = {
    'company_name':       co.name || '',
    'company_number':     co.company_number || '',
    'registered_address': co.registered_address || '',
    'vat_number':         co.vat_number || '',
    'company_type':       co.company_type || 'Private limited company',
    'founded_year':       co.founded || '',
    'cqc_status':         co.cqc || '',
    'cqc_provider_id':    co.cqc_provider_id || '',
    'contact_name':       co.name || '',
    'sme_status':         getSmeStatus(co),
    'directors':          co.directors || '',
    'psc_details':        co.psc_details || '',
    'services':           co.services || '',
    'experience':         co.experience || '',
    'accreditations':     co.accreditations || '',
    'insurance_employers':'Yes',
    'insurance_public':   'Yes',
    'gdpr_policy':        'Yes',
    'ico_number':         co.ico_number || '',
    'regions':            co.regions || ''
  };

  // Map each field to its answer
  (sqData.sections || []).forEach(function(section) {
    (section.fields || []).forEach(function(field) {
      var answer = '';
      if (field.field_type === 'auto_fill' && field.profile_key) {
        answer = profileMap[field.profile_key] || '';
      } else if (field.field_type === 'ai_draft') {
        answer = sqAnswers[field.id] || '';
      } else if (field.field_type === 'client_confirm') {
        answer = 'Yes, confirmed'; // They ticked the declaration
      }
      if (answer) {
        map[field.id] = { question: field.question, answer: answer };
      }
    });
  });

  return map;
}

function getSmeStatus(co) {
  var staff = parseInt(co.staff || '0');
  return (staff < 250) ? 'Yes' : 'No';
}

// Fill the document XML by finding table rows and inserting answers
function fillDocumentXml(xml, sqData, answersMap) {
  // Build a list of question keywords → answer for matching
  var questionAnswers = Object.values(answersMap).map(function(item) {
    return {
      keywords: item.question.toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).filter(function(w){ return w.length > 3; }),
      answer: item.answer,
      question: item.question
    };
  });

  // Split XML into table rows
  var rowPattern = /(<w:tr[ >][\s\S]*?<\/w:tr>)/g;

  xml = xml.replace(rowPattern, function(row) {
    // Extract cells from row
    var cells = extractCells(row);
    if (cells.length < 2) return row;

    // Get text from all cells except last (last = response column)
    var questionText = '';
    for (var i = 0; i < cells.length - 1; i++) {
      questionText += ' ' + getCellText(cells[i]);
    }
    questionText = questionText.toLowerCase().trim();

    // Skip header rows
    if (questionText.includes('question number') || questionText.includes('section 1') || questionText.trim().length < 5) {
      return row;
    }

    // Find best matching answer
    var bestMatch = null;
    var bestScore = 0;

    questionAnswers.forEach(function(qa) {
      var score = 0;
      qa.keywords.forEach(function(kw) {
        if (questionText.includes(kw)) score++;
      });
      // Require at least 2 keyword matches
      if (score >= 2 && score > bestScore) {
        bestScore = score;
        bestMatch = qa;
      }
    });

    if (!bestMatch || !bestMatch.answer) return row;

    // Fill the last cell with the answer
    var lastCell = cells[cells.length - 1];
    var cellStart = row.lastIndexOf(lastCell);
    if (cellStart === -1) return row;

    var filledCell = fillCell(lastCell, bestMatch.answer);
    return row.substring(0, cellStart) + filledCell + row.substring(cellStart + lastCell.length);
  });

  return xml;
}

// Extract individual <w:tc> elements from a row
function extractCells(row) {
  var cells = [];
  var cellPattern = /<w:tc[ >][\s\S]*?<\/w:tc>/g;
  var match;
  while ((match = cellPattern.exec(row)) !== null) {
    cells.push(match[0]);
  }
  return cells;
}

// Get plain text from a cell
function getCellText(cell) {
  var text = '';
  var textPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  var match;
  while ((match = textPattern.exec(cell)) !== null) {
    text += match[1] + ' ';
  }
  return text.trim();
}

// Fill a cell with answer text, preserving cell properties
function fillCell(cell, answer) {
  // Keep cell properties (<w:tcPr>) but replace paragraph content
  var tcPrMatch = cell.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/);
  var tcPr = tcPrMatch ? tcPrMatch[0] : '';

  // Get run properties from existing content if available
  var rPrMatch = cell.match(/<w:rPr[\s\S]*?<\/w:rPr>/);
  var rPr = rPrMatch ? rPrMatch[0] : '';

  // Escape XML special chars in answer
  var safeAnswer = answer
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Handle multiline answers
  var paragraphs = safeAnswer.split(/\n/).map(function(line) {
    return '<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r>' + rPr + '<w:t xml:space="preserve">' + line + '</w:t></w:r></w:p>';
  }).join('');

  return '<w:tc>' + tcPr + paragraphs + '</w:tc>';
}
