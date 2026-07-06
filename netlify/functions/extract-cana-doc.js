const { requireAdmin } = require('./_admin-auth');

exports.handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  // Phase 1b ENFORCE: reject callers without a valid admin token.
  var _denied = await requireAdmin(event, 'extract-cana-doc', cors);
  if (_denied) return _denied;

  try {
    const { fileBase64, fileName, fileType } = JSON.parse(event.body);
    if (!fileBase64) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No file provided' }) };

    const buffer = Buffer.from(fileBase64, 'base64');
    var extractedText = '';

    const isPDF = fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    const isWord = fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                   fileName.toLowerCase().endsWith('.docx') ||
                   fileName.toLowerCase().endsWith('.doc');

    if (isPDF) {
      // Extract text from PDF using pdf-parse
      try {
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text || '';
      } catch(e) {
        // Fallback: extract printable ASCII from buffer
        var chars = [];
        for (var i = 0; i < buffer.length; i++) {
          var c = buffer[i];
          if ((c >= 32 && c <= 126) || c === 10 || c === 13 || c === 9) {
            chars.push(String.fromCharCode(c));
          }
        }
        var raw = chars.join('');
        // Extract readable words (4+ chars)
        var words = raw.match(/[A-Za-z][a-zA-Z\s,\.'\-]{3,}/g) || [];
        extractedText = words.join(' ');
      }
    } else if (isWord) {
      // Extract text from Word document using mammoth
      try {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer: buffer });
        extractedText = result.value || '';
      } catch(e) {
        return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Could not read Word document: ' + e.message }) };
      }
    } else {
      // Plain text
      extractedText = buffer.toString('utf-8');
    }

    // Clean the text
    extractedText = extractedText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, ' ')
      .trim()
      .substring(0, 20000);

    if (!extractedText || extractedText.length < 50) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Could not extract readable text from this file. Please try saving as a Word document (.docx) instead.' }) };
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ text: extractedText, length: extractedText.length, fileName: fileName })
    };

  } catch(err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
