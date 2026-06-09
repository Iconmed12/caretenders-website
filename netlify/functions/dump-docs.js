// TEMPORARY: dumps tender doc text to GitHub for analysis. Delete after use.
exports.handler = async (event) => {
  const cors = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' };

  const SB = 'https://igpjfpncfuawikoyzfcd.supabase.co';
  const SBK = process.env.SUPABASE_ANON_KEY;
  const GH_TOKEN = process.env.GH_DUMP_TOKEN;

  if (!GH_TOKEN) return { statusCode:500, headers:cors, body: JSON.stringify({ error:'GH_DUMP_TOKEN env var not set' }) };

  try {
    var res = await fetch(SB + '/rest/v1/tenders?select=id,title,cana_docs&cana_docs=not.is.null', {
      headers: { apikey: SBK, Authorization: 'Bearer ' + SBK }
    });
    var tenders = await res.json();

    var pushed = [];
    for (var t of tenders) {
      var docs = t.cana_docs || {};
      for (var slot of Object.keys(docs)) {
        var files = Array.isArray(docs[slot]) ? docs[slot] : [];
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          var text = f.text || '';
          if (!text) { pushed.push({ slot: slot, name: f.name, skipped: 'no text' }); continue; }
          var safeName = (f.name || 'doc').replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 60);
          var path = 'docs-dump/' + t.id + '/' + slot + '_' + i + '_' + safeName + '.txt';

          var content = Buffer.from(text).toString('base64');
          var ghRes = await fetch('https://api.github.com/repos/Iconmed12/caretenders-website/contents/' + path, {
            method: 'PUT',
            headers: { 'Authorization': 'token ' + GH_TOKEN, 'Content-Type': 'application/json', 'User-Agent': 'Cana' },
            body: JSON.stringify({ message: 'Doc dump: ' + path, content: content, branch: 'main' })
          });
          pushed.push({ path: path, ok: ghRes.ok, status: ghRes.status, chars: text.length });
        }
      }
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ pushed }, null, 2) };
  } catch(e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
