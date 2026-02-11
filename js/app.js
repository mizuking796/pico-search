(function () {
  'use strict';

  /* ============================================================
     Config
     ============================================================ */
  var GEMINI_MODEL = 'gemini-2.5-flash';
  var GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta';
  var PUBMED_BASE  = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  var PUBMED_PARAMS = '&tool=pico-search&email=pico-search@example.com';
  var MAX_RESULTS  = 20;

  // TRIVIA is loaded from js/trivia.js (global scope, ~600 items)
  // Fallback if trivia.js fails to load
  if (typeof TRIVIA === 'undefined' || !TRIVIA.length) {
    window.TRIVIA = ['PubMedには3,700万件以上の論文が収録されています'];
  }

  var HIGH_IMPACT_JOURNALS = {
    'N Engl J Med': 'NEJM',
    'Lancet': 'Lancet',
    'The Lancet': 'Lancet',
    'JAMA': 'JAMA',
    'BMJ': 'BMJ',
    'Ann Intern Med': 'AIM',
    'Cochrane Database Syst Rev': 'Cochrane',
    'Phys Ther': 'PT',
    'Physical Therapy': 'PT',
    'Stroke': 'Stroke',
    'Arch Phys Med Rehabil': 'APMR',
    'Archives of Physical Medicine and Rehabilitation': 'APMR',
    'J Physiother': 'JPhysio',
    'PLoS Med': 'PLoS Med',
    'Nature Medicine': 'Nat Med',
    'Nat Med': 'Nat Med'
  };

  var STUDY_TYPE_PATTERNS = [
    { pattern: /meta[\s-]?analy/i, label: '\u30E1\u30BF\u5206\u6790' },
    { pattern: /systematic[\s-]?review/i, label: '\u7CFB\u7D71\u7684\u30EC\u30D3\u30E5\u30FC' },
    { pattern: /randomi[sz]ed|\bRCT\b/i, label: 'RCT' },
    { pattern: /cohort/i, label: '\u30B3\u30DB\u30FC\u30C8' },
    { pattern: /case[\s-]?control/i, label: '\u75C7\u4F8B\u5BFE\u7167' },
    { pattern: /cross[\s-]?sectional/i, label: '\u6A2A\u65AD' },
    { pattern: /case[\s-]?report|case[\s-]?series/i, label: '\u75C7\u4F8B\u5831\u544A' },
    { pattern: /clinical[\s-]?trial/i, label: '\u81E8\u5E8A\u8A66\u9A13' },
    { pattern: /pilot[\s-]?study/i, label: '\u30D1\u30A4\u30ED\u30C3\u30C8' },
    { pattern: /review/i, label: '\u30EC\u30D3\u30E5\u30FC' }
  ];

  /* ============================================================
     State
     ============================================================ */
  var screen        = 'setup';   // setup | question | pico | results | settings
  var apiKey        = '';
  var workerUrl     = '';
  var questionText  = '';
  var picoData      = null;      // {type,p,i_or_e,c,o,mesh_terms,search_query}
  var papers        = [];        // [{pmid,title,authors,source,year,abstract,summary}]
  var overallSummary = '';
  var prevScreen    = '';

  var app = document.getElementById('app');

  /* ============================================================
     Example Questions
     ============================================================ */
  var examples = [
    '脳卒中後の上肢機能回復にCI療法は有効か？',
    '変形性膝関節症に対する運動療法と薬物療法の比較',
    '高齢者の転倒予防にバランス訓練は効果があるか？',
    '腰痛患者に対する認知行動療法の効果',
    'パーキンソン病患者へのリズム聴覚刺激による歩行改善'
  ];

  /* ============================================================
     Init
     ============================================================ */
  function init() {
    apiKey    = localStorage.getItem('pico_api_key')    || '';
    workerUrl = localStorage.getItem('pico_worker_url') || '';
    if (apiKey) screen = 'question';
    render();
  }

  /* ============================================================
     Routing
     ============================================================ */
  function render() {
    switch (screen) {
      case 'setup':    renderSetup();      break;
      case 'question': renderQuestion();   break;
      case 'pico':     renderPicoEditor(); break;
      case 'results':  renderResults();    break;
      case 'settings': renderSettings();   break;
    }
  }

  function navigate(s) {
    prevScreen = screen;
    screen = s;
    render();
  }

  /* ============================================================
     Utilities
     ============================================================ */
  function escapeHtml(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  /** escapeHtml + quote escaping for use inside HTML attributes */
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* -- Progress overlay -- */
  var _progressInterval = null;
  var _progressSteps = [];
  var _progressWeights = [];

  function showProgress(steps, weights) {
    hideProgress();
    _progressSteps = steps;
    _progressWeights = weights || steps.map(function () { return 1; });
    var div = document.createElement('div');
    div.id = 'loading-overlay';
    div.className = 'loading-overlay';

    var html = '<div class="progress-container">';
    html += '<div class="progress-steps">';
    for (var i = 0; i < steps.length; i++) {
      html += '<div class="progress-step" data-step="' + i + '">'
        + '<span class="step-icon pending">\u25CB</span>'
        + '<span class="step-label">' + escapeHtml(steps[i]) + '</span></div>';
    }
    html += '</div>';
    html += '<div class="progress-bar-wrap">'
      + '<div class="progress-bar-fill" style="width:0%"></div></div>';
    html += '<div class="progress-percent">0%</div>';
    html += '<div class="progress-trivia">' + escapeHtml(TRIVIA[Math.floor(Math.random() * TRIVIA.length)]) + '</div>';
    html += '</div>';
    div.innerHTML = html;
    document.body.appendChild(div);

    // Rotate trivia every 5s
    var triviaEl = div.querySelector('.progress-trivia');
    _progressInterval = setInterval(function () {
      triviaEl.style.opacity = '0';
      setTimeout(function () {
        triviaEl.textContent = TRIVIA[Math.floor(Math.random() * TRIVIA.length)];
        triviaEl.style.opacity = '1';
      }, 300);
    }, 5000);

    // Activate first step
    updateProgress(0);
  }

  function updateProgress(stepIdx) {
    var overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    var stepEls = overlay.querySelectorAll('.progress-step');
    var totalWeight = 0;
    var doneWeight = 0;
    for (var i = 0; i < _progressWeights.length; i++) totalWeight += _progressWeights[i];
    for (var j = 0; j < stepEls.length; j++) {
      var icon = stepEls[j].querySelector('.step-icon');
      if (j < stepIdx) {
        icon.className = 'step-icon done';
        icon.textContent = '\u2713';
        doneWeight += _progressWeights[j];
      } else if (j === stepIdx) {
        icon.className = 'step-icon active';
        icon.innerHTML = '<span class="inline-spinner"></span>';
        doneWeight += _progressWeights[j] * 0.15; // partial
      } else {
        icon.className = 'step-icon pending';
        icon.textContent = '\u25CB';
      }
    }
    var pct = Math.round((doneWeight / totalWeight) * 100);
    var fill = overlay.querySelector('.progress-bar-fill');
    var pctEl = overlay.querySelector('.progress-percent');
    if (fill) fill.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
  }

  function completeProgress() {
    var overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    var stepEls = overlay.querySelectorAll('.progress-step');
    for (var j = 0; j < stepEls.length; j++) {
      var icon = stepEls[j].querySelector('.step-icon');
      icon.className = 'step-icon done';
      icon.textContent = '\u2713';
    }
    var fill = overlay.querySelector('.progress-bar-fill');
    var pctEl = overlay.querySelector('.progress-percent');
    if (fill) fill.style.width = '100%';
    if (pctEl) pctEl.textContent = '100%';
  }

  function hideProgress() {
    if (_progressInterval) { clearInterval(_progressInterval); _progressInterval = null; }
    var el = document.getElementById('loading-overlay');
    if (el) el.remove();
  }

  /* -- Legacy compat -- */
  function showLoading(msg) {
    showProgress([msg || '処理中...'], [1]);
  }
  function hideLoading() { hideProgress(); }

  function detectStudyType(title) {
    for (var i = 0; i < STUDY_TYPE_PATTERNS.length; i++) {
      if (STUDY_TYPE_PATTERNS[i].pattern.test(title)) return STUDY_TYPE_PATTERNS[i].label;
    }
    return null;
  }

  function getJournalBadge(source) {
    for (var key in HIGH_IMPACT_JOURNALS) {
      if (source && source.indexOf(key) !== -1) return HIGH_IMPACT_JOURNALS[key];
    }
    return null;
  }

  var toastTimer = null;
  function showToast(msg, type) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    if (toastTimer) clearTimeout(toastTimer);
    var div = document.createElement('div');
    div.className = 'toast toast-' + (type || 'error');
    div.setAttribute('role', 'alert');
    div.textContent = msg;
    document.body.appendChild(div);
    toastTimer = setTimeout(function () { div.remove(); }, 3500);
  }

  /* ============================================================
     API: Gemini
     ============================================================ */
  function geminiEndpoint(action) {
    var base = workerUrl || GEMINI_BASE;
    return base + '/models/' + GEMINI_MODEL + ':' + action
      + '?key=' + encodeURIComponent(apiKey);
  }

  function callGemini(prompt, schema) {
    var body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {}
    };
    if (schema) {
      body.generationConfig.responseMimeType = 'application/json';
      body.generationConfig.responseSchema = schema;
    }
    return fetch(geminiEndpoint('generateContent'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (err) {
          var msg = (err.error && err.error.message) || '';
          if (res.status === 401 || res.status === 403) {
            throw new Error('APIキーが無効です。設定画面で更新してください。');
          }
          if (res.status === 429 || /quota/i.test(msg)) {
            throw new Error(
              '無料枠の利用上限に達しました。しばらく待ってから再度お試しください。'
              + '（詳細: ai.google.dev/gemini-api/docs/rate-limits）'
            );
          }
          throw new Error(msg || 'APIエラー（' + res.status + '）');
        });
      }
      return res.json();
    }).then(function (data) {
      var cand = data.candidates && data.candidates[0];
      var text = cand && cand.content && cand.content.parts
        && cand.content.parts[0] && cand.content.parts[0].text;
      if (!text) {
        throw new Error('APIから有効な応答がありませんでした。');
      }
      return text;
    }).catch(function (err) {
      if (err.message === 'Failed to fetch'
        || (err.name === 'TypeError' && /fetch/i.test(err.message))) {
        throw new Error(
          'APIに接続できません。ネットワーク接続を確認するか、'
          + '設定画面でプロキシURLを設定してください。'
        );
      }
      throw err;
    });
  }

  // Returns: {ok:true} | {ok:false, reason:'invalid_key'|'network'}
  function validateApiKey(key) {
    var url = (workerUrl || GEMINI_BASE) + '/models?key=' + encodeURIComponent(key);
    return fetch(url)
      .then(function (res) {
        if (res.ok) return { ok: true };
        return { ok: false, reason: 'invalid_key' };
      })
      .catch(function () {
        return { ok: false, reason: 'network' };
      });
  }

  /* ============================================================
     API: PubMed
     ============================================================ */
  function searchPubMed(query) {
    var esearch = PUBMED_BASE + '/esearch.fcgi?db=pubmed&retmode=json&retmax='
      + MAX_RESULTS + '&sort=relevance' + PUBMED_PARAMS + '&term=' + encodeURIComponent(query);
    return fetch(esearch)
      .then(function (r) {
        if (!r.ok) throw new Error('PubMed検索エラー（' + r.status + '）');
        return r.json();
      })
      .then(function (data) {
        var ids = data.esearchresult && data.esearchresult.idlist;
        if (!ids || ids.length === 0) return [];

        // Fetch metadata and abstracts in parallel
        var summaryUrl = PUBMED_BASE + '/esummary.fcgi?db=pubmed&retmode=json'
          + PUBMED_PARAMS + '&id=' + ids.join(',');
        var summaryP = fetch(summaryUrl).then(function (r) {
          if (!r.ok) throw new Error('PubMed詳細取得エラー（' + r.status + '）');
          return r.json();
        });
        var abstractP = fetchAbstracts(ids);

        return Promise.all([summaryP, abstractP]).then(function (results) {
          var sdata = results[0];
          var abstracts = results[1];
          var result = sdata.result || {};
          var list = [];
          for (var i = 0; i < ids.length; i++) {
            var doc = result[ids[i]];
            if (!doc) continue;
            var authors = (doc.authors || []).map(function (a) { return a.name; });
            list.push({
              pmid: ids[i],
              title: doc.title || '',
              authors: authors,
              source: doc.source || '',
              year: doc.pubdate ? doc.pubdate.split(' ')[0] : '',
              abstract: abstracts[ids[i]] || null,
              summary: null
            });
          }
          return list;
        });
      });
  }

  function fetchAbstracts(pmids) {
    if (!pmids || pmids.length === 0) return Promise.resolve({});
    var efetch = PUBMED_BASE + '/efetch.fcgi?db=pubmed&rettype=abstract&retmode=xml'
      + PUBMED_PARAMS + '&id=' + pmids.join(',');
    return fetch(efetch)
      .then(function (r) {
        if (!r.ok) throw new Error('アブストラクト取得エラー（' + r.status + '）');
        return r.text();
      })
      .then(function (xml) { return parseAbstractXml(xml); });
  }

  function parseAbstractXml(xml) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xml, 'text/xml');
    var articles = doc.querySelectorAll('PubmedArticle');
    var result = {};
    for (var i = 0; i < articles.length; i++) {
      var pmidEl = articles[i].querySelector('PMID');
      if (!pmidEl) continue;
      var pmid = pmidEl.textContent;
      var texts = articles[i].querySelectorAll('AbstractText');
      var parts = [];
      for (var j = 0; j < texts.length; j++) {
        var label = texts[j].getAttribute('Label');
        var text = texts[j].textContent;
        if (label) parts.push(label + ': ' + text);
        else parts.push(text);
      }
      result[pmid] = parts.join('\n') || '';
    }
    return result;
  }

  /* ============================================================
     Business Logic
     ============================================================ */
  function analyzePico(question) {
    papers = [];
    overallSummary = '';
    _papersWithAbstract = [];
    showProgress(
      ['AIが臨床疑問を分析中...', 'PICO/PECOに分解中...'],
      [50, 50]
    );
    var prompt =
      'あなたは医学文献検索の専門家です。以下の臨床疑問をPICO/PECOフレームワークに分解し、PubMed検索クエリを生成してください。\n\n'
      + '臨床疑問：' + question + '\n\n'
      + '回答にあたっての注意：\n'
      + '- 介入研究ならPICO（Intervention）、観察研究ならPECO（Exposure）を選択\n'
      + '- MeSH用語は英語で、PubMedで有効なものを選択（5〜8個程度）\n'
      + '- 検索クエリはMeSH用語とフリーテキストを組み合わせ、AND/ORを適切に使用\n'
      + '- 各フィールド（P, I/E, C, O）は日本語で簡潔に記述\n'
      + '- 検索クエリは英語で記述';

    var schema = {
      type: 'OBJECT',
      properties: {
        type:         { type: 'STRING', enum: ['PICO', 'PECO'] },
        p:            { type: 'STRING' },
        i_or_e:       { type: 'STRING' },
        c:            { type: 'STRING' },
        o:            { type: 'STRING' },
        mesh_terms:   { type: 'ARRAY', items: { type: 'STRING' } },
        search_query: { type: 'STRING' }
      },
      required: ['type', 'p', 'i_or_e', 'c', 'o', 'mesh_terms', 'search_query']
    };

    var btn = document.getElementById('analyze-btn');
    if (btn) btn.disabled = true;
    callGemini(prompt, schema).then(function (text) {
      updateProgress(1);
      try {
        picoData = JSON.parse(text);
      } catch (e) {
        picoData = {
          type: 'PICO', p: '', i_or_e: '', c: '', o: '',
          mesh_terms: [], search_query: text
        };
      }
      completeProgress();
      setTimeout(function () { hideProgress(); navigate('pico'); }, 400);
    }).catch(function (err) {
      hideProgress();
      if (btn) btn.disabled = false;
      showToast(err.message, 'error');
    });
  }

  function runPubMedSearch(query) {
    showProgress(
      ['PubMedを検索中...', '論文情報を取得中...'],
      [40, 60]
    );
    overallSummary = '';
    _papersWithAbstract = [];
    var btn = document.getElementById('search-btn');
    if (btn) btn.disabled = true;
    searchPubMed(query).then(function (list) {
      updateProgress(1);
      papers = list;
      completeProgress();
      setTimeout(function () { hideProgress(); navigate('results'); }, 400);
    }).catch(function (err) {
      hideProgress();
      if (btn) btn.disabled = false;
      showToast('PubMed検索エラー: ' + err.message, 'error');
    });
  }

  function summarizePaper(idx) {
    var paper = papers[idx];
    if (!paper) return;

    var card = document.querySelector('[data-idx="' + idx + '"]');
    var btn = card && card.querySelector('.btn-summarize');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="inline-spinner"></span>要約中...';
    }

    var doSummarize = function () {
      var prompt =
        '以下の医学論文のアブストラクトを日本語で分かりやすく要約してください。'
        + '医学教育を十分に積んでいない医療従事者にも理解できるよう、専門用語には簡単な説明を添えてください。\n\n'
        + 'タイトル: ' + paper.title + '\n\n'
        + 'アブストラクト:\n' + paper.abstract + '\n\n'
        + '以下の点を含めて要約してください：\n'
        + '- 研究の目的\n- 方法の概要\n- 主要な結果\n- 臨床的意義';

      callGemini(prompt).then(function (text) {
        paper.summary = text;
        renderPaperCard(idx);
      }).catch(function (err) {
        showToast('要約エラー: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '日本語で要約'; }
      });
    };

    if (paper.abstract) {
      doSummarize();
    } else {
      fetchAbstracts([paper.pmid]).then(function (abstracts) {
        paper.abstract = abstracts[paper.pmid] || '';
        if (!paper.abstract) {
          showToast('この論文のアブストラクトは取得できませんでした。', 'error');
          if (btn) { btn.disabled = false; btn.textContent = '日本語で要約'; }
          return;
        }
        doSummarize();
      }).catch(function (err) {
        showToast('アブストラクト取得エラー: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '日本語で要約'; }
      });
    }
  }

  var _papersWithAbstract = [];

  function summarizeAll() {
    var allBtn = document.getElementById('summarize-all-btn');
    if (allBtn) allBtn.disabled = true;
    showProgress(
      ['アブストラクトを取得中...', 'AIが横断的に分析中...'],
      [30, 70]
    );
    var pmidsToFetch = [];
    for (var i = 0; i < papers.length; i++) {
      if (!papers[i].abstract) pmidsToFetch.push(papers[i].pmid);
    }

    var fetchPromise = pmidsToFetch.length > 0
      ? fetchAbstracts(pmidsToFetch)
      : Promise.resolve({});

    fetchPromise.then(function (abstracts) {
      for (var pmid in abstracts) {
        for (var j = 0; j < papers.length; j++) {
          if (papers[j].pmid === pmid) papers[j].abstract = abstracts[pmid];
        }
      }
      updateProgress(1);
      _papersWithAbstract = papers.filter(function (p) { return p.abstract; });
      if (_papersWithAbstract.length === 0) {
        hideProgress();
        showToast('アブストラクトのある論文が見つかりませんでした。', 'error');
        return;
      }
      var parts = _papersWithAbstract.map(function (p) {
        var realIdx = papers.indexOf(p);
        return '[' + (realIdx + 1) + '] ' + p.title + '\n' + p.abstract;
      });
      var prompt =
        '以下の' + _papersWithAbstract.length + '件の医学論文のアブストラクトを横断的に日本語で要約してください。\n'
        + '医学教育を十分に積んでいない医療従事者にも理解できるよう記述してください。\n\n'
        + parts.join('\n\n') + '\n\n'
        + '以下の点を含めてください：\n'
        + '- 共通する知見\n- 研究間の相違点\n'
        + '- エビデンスの全体的な傾向\n- 臨床実践への示唆\n\n'
        + '重要：本文中で根拠となる論文を [1][2] のように番号で引用してください。'
        + '例えば「〜という結果が報告されている[1][3]」のように記述します。';

      return callGemini(prompt).then(function (text) {
        completeProgress();
        overallSummary = text;
        setTimeout(function () { hideProgress(); renderOverallSummary(); }, 400);
      });
    }).catch(function (err) {
      hideProgress();
      if (allBtn) allBtn.disabled = false;
      showToast('横断要約エラー: ' + err.message, 'error');
    });
  }

  /* ============================================================
     Render: Header
     ============================================================ */
  function renderHeader(title, showSettings, showBack) {
    var html = '<div class="header">';
    html += '<div class="header-left">';
    if (showBack) {
      html += '<button class="btn-icon btn-back" title="戻る">\u2190</button>';
    }
    html += '<span class="header-title">' + escapeHtml(title) + '</span>';
    html += '</div>';
    html += '<div class="header-right">';
    if (showSettings) {
      html += '<button class="btn-icon btn-settings" title="設定">\u2699</button>';
    }
    html += '</div>';
    html += '</div>';
    return html;
  }

  /* ============================================================
     Render: Setup Screen
     ============================================================ */
  function renderSetup() {
    var html = '<div class="screen setup-screen">';
    html += '<div class="setup-logo">\uD83D\uDD2C</div>';
    html += '<h1>PICO Search</h1>';
    html += '<p class="subtitle">臨床疑問をPICO/PECOに分解し<br>PubMed検索・論文要約を行うツール</p>';

    html += '<div class="setup-guide">';
    html += '<h2>APIキーの取得方法（無料・3分）</h2>';

    html += '<div class="setup-step">';
    html += '<div class="step-number">1</div>';
    html += '<div class="step-body">';
    html += '<div class="step-title">Google AI Studio を開く</div>';
    html += '<p class="step-desc">下のボタンからGoogle AI Studioを開きます。Googleアカウントでログインしてください。</p>';
    html += '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" class="btn-link">Google AI Studio を開く &rarr;</a>';
    html += '</div></div>';

    html += '<div class="setup-step">';
    html += '<div class="step-number">2</div>';
    html += '<div class="step-body">';
    html += '<div class="step-title">利用規約に同意する</div>';
    html += '<p class="step-desc">初回のみ「Welcome to AI Studio」画面が表示されます。<br>'
      + '上のチェックボックス（I acknowledge...）に<b>チェック</b>を入れて、右下の<b>「続行」</b>ボタンを押してください。</p>';
    html += '<p class="step-note">下のチェック（メール受信）は任意です。</p>';
    html += '</div></div>';

    html += '<div class="setup-step">';
    html += '<div class="step-number">3</div>';
    html += '<div class="step-body">';
    html += '<div class="step-title">APIキーをコピー</div>';
    html += '<p class="step-desc">キーの一覧画面が表示されます。</p>';
    html += '<ul class="step-list">';
    html += '<li>既にキーがある場合（「Default Gemini API Key」など）→ そのキー名を<b>クリック</b></li>';
    html += '<li>キーがない場合 →「<b>APIキーを作成</b>」ボタンで新規作成</li>';
    html += '</ul>';
    html += '<p class="step-desc">「APIキーの詳細」画面が開くので、右下の<b>「キーをコピー」</b>ボタンを押してください。</p>';
    html += '<p class="step-desc">キーは <code>AIzaSy...</code> で始まる長い文字列です。</p>';
    html += '</div></div>';

    html += '<div class="setup-step">';
    html += '<div class="step-number">4</div>';
    html += '<div class="step-body">';
    html += '<div class="step-title">下に貼り付けて保存</div>';
    html += '<p class="step-desc">コピーしたキーを下の入力欄に貼り付けて「保存して始める」を押してください。</p>';
    html += '</div></div>';

    html += '</div>';

    html += '<div class="form-group">';
    html += '<label for="setup-key">Gemini APIキー</label>';
    html += '<input type="password" id="setup-key" placeholder="AIzaSy..." autocomplete="off">';
    html += '</div>';

    html += '<button id="save-key-btn" class="btn-primary">保存して始める</button>';
    html += '<div id="save-skip-area"></div>';
    html += '<p class="note">APIキーはこの端末にのみ保存されます。サーバーには送信されません。</p>';
    html += '</div>';

    app.innerHTML = html;

    var input = document.getElementById('setup-key');

    function saveKeyAndGo(key) {
      apiKey = key;
      localStorage.setItem('pico_api_key', key);
      showToast('APIキーを保存しました', 'success');
      navigate('question');
    }

    document.getElementById('save-key-btn').addEventListener('click', function () {
      var key = input.value.trim();
      if (!key) { showToast('APIキーを入力してください', 'error'); return; }
      showLoading('APIキーを検証中...');
      validateApiKey(key).then(function (result) {
        hideLoading();
        if (result.ok) {
          saveKeyAndGo(key);
        } else if (result.reason === 'network') {
          // CORS or network error — show skip option
          var area = document.getElementById('save-skip-area');
          area.innerHTML =
            '<div class="validate-warn">'
            + '<p>APIキーの検証に失敗しました（ネットワークエラー）。</p>'
            + '<p>キーが正しければ、検証をスキップして保存できます。</p>'
            + '<button id="skip-save-btn" class="btn-secondary">検証をスキップして保存</button>'
            + '</div>';
          document.getElementById('skip-save-btn').addEventListener('click', function () {
            saveKeyAndGo(key);
          });
        } else {
          showToast('APIキーが無効です。確認してください。', 'error');
        }
      });
    });
  }

  /* ============================================================
     Render: Question Screen
     ============================================================ */
  function renderQuestion() {
    var html = '<div class="screen question-screen">';
    html += renderHeader('PICO Search', true, false);

    html += '<div class="content">';
    html += '<h2>臨床疑問を入力</h2>';
    html += '<p class="desc">日本語で臨床疑問を入力すると、AIがPICO/PECOフレームワークに分解し、PubMed検索用のクエリを生成します。</p>';

    html += '<textarea id="question-input" rows="4" placeholder="例：脳卒中後の上肢機能回復にCI療法は有効か？">'
      + escapeHtml(questionText) + '</textarea>';

    html += '<div class="examples">';
    html += '<p class="examples-label">例文から選ぶ：</p>';
    html += '<div class="chip-container">';
    for (var i = 0; i < examples.length; i++) {
      html += '<button class="chip" data-idx="' + i + '">'
        + escapeHtml(examples[i]) + '</button>';
    }
    html += '</div></div>';

    html += '<button id="analyze-btn" class="btn-primary">PICO/PECOで分析する</button>';

    html += '<div class="pico-info">';
    html += '<h3>PICO/PECOとは？</h3>';
    html += '<p><b>P</b>atient（対象） / <b>I</b>ntervention（介入）or <b>E</b>xposure（曝露） / <b>C</b>omparison（比較） / <b>O</b>utcome（結果）</p>';
    html += '<p>臨床疑問を構造化することで、効果的な文献検索が可能になります。</p>';
    html += '</div>';

    html += '</div></div>';

    app.innerHTML = html;

    var textarea = document.getElementById('question-input');
    var chips = app.querySelectorAll('.chip');
    for (var j = 0; j < chips.length; j++) {
      chips[j].addEventListener('click', function () {
        textarea.value = examples[parseInt(this.getAttribute('data-idx'), 10)];
      });
    }

    document.getElementById('analyze-btn').addEventListener('click', function () {
      var q = textarea.value.trim();
      if (!q) { showToast('臨床疑問を入力してください', 'error'); return; }
      questionText = q;
      analyzePico(q);
    });

    // Settings gear
    var settingsBtn = app.querySelector('.btn-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function () { navigate('settings'); });
    }
  }

  /* ============================================================
     Render: PICO Editor Screen
     ============================================================ */
  function renderPicoEditor() {
    if (!picoData) { navigate('question'); return; }
    var d = picoData;
    var isPeco = d.type === 'PECO';

    var html = '<div class="screen pico-screen">';
    html += renderHeader('PICO/PECO編集', true, true);

    html += '<div class="content">';

    // Toggle
    html += '<div class="toggle-group">';
    html += '<button class="toggle-btn' + (!isPeco ? ' active' : '') + '" data-type="PICO">PICO</button>';
    html += '<button class="toggle-btn' + (isPeco ? ' active' : '') + '" data-type="PECO">PECO</button>';
    html += '</div>';

    // P
    html += '<div class="pico-field">';
    html += '<div class="pico-field-label"><span class="pico-letter">P</span>';
    html += '<span class="pico-field-name">Patient / Population（対象）</span></div>';
    html += '<input type="text" id="pico-p" value="' + escapeAttr(d.p) + '">';
    html += '</div>';

    // I or E
    var ieLetter = isPeco ? 'E' : 'I';
    var ieName = isPeco ? 'Exposure（曝露）' : 'Intervention（介入）';
    html += '<div class="pico-field">';
    html += '<div class="pico-field-label"><span class="pico-letter" id="ie-letter">' + ieLetter + '</span>';
    html += '<span class="pico-field-name" id="ie-name">' + ieName + '</span></div>';
    html += '<input type="text" id="pico-ie" value="' + escapeAttr(d.i_or_e) + '">';
    html += '</div>';

    // C
    html += '<div class="pico-field">';
    html += '<div class="pico-field-label"><span class="pico-letter">C</span>';
    html += '<span class="pico-field-name">Comparison（比較）</span></div>';
    html += '<input type="text" id="pico-c" value="' + escapeAttr(d.c) + '">';
    html += '</div>';

    // O
    html += '<div class="pico-field">';
    html += '<div class="pico-field-label"><span class="pico-letter">O</span>';
    html += '<span class="pico-field-name">Outcome（結果）</span></div>';
    html += '<input type="text" id="pico-o" value="' + escapeAttr(d.o) + '">';
    html += '</div>';

    // MeSH terms
    if (d.mesh_terms && d.mesh_terms.length > 0) {
      html += '<div class="tag-section">';
      html += '<div class="tag-section-label">推奨 MeSH 用語</div>';
      html += '<div class="tag-container">';
      for (var i = 0; i < d.mesh_terms.length; i++) {
        html += '<span class="tag">' + escapeHtml(d.mesh_terms[i]) + '</span>';
      }
      html += '</div></div>';
    }

    // Search query
    html += '<div class="query-section">';
    html += '<label for="search-query">検索クエリ（編集可）</label>';
    html += '<textarea id="search-query" rows="3">'
      + escapeHtml(d.search_query) + '</textarea>';
    html += '</div>';

    html += '<button id="search-btn" class="btn-primary">PubMedで検索</button>';

    html += '</div></div>';

    app.innerHTML = html;

    // Toggle events
    var toggleBtns = app.querySelectorAll('.toggle-btn');
    for (var t = 0; t < toggleBtns.length; t++) {
      toggleBtns[t].addEventListener('click', function () {
        var newType = this.getAttribute('data-type');
        d.type = newType;
        var isPeco2 = newType === 'PECO';
        var btns = app.querySelectorAll('.toggle-btn');
        for (var b = 0; b < btns.length; b++) {
          btns[b].classList.toggle('active',
            btns[b].getAttribute('data-type') === newType);
        }
        document.getElementById('ie-letter').textContent = isPeco2 ? 'E' : 'I';
        document.getElementById('ie-name').textContent =
          isPeco2 ? 'Exposure（曝露）' : 'Intervention（介入）';
      });
    }

    // Search button
    document.getElementById('search-btn').addEventListener('click', function () {
      d.p       = document.getElementById('pico-p').value.trim();
      d.i_or_e  = document.getElementById('pico-ie').value.trim();
      d.c       = document.getElementById('pico-c').value.trim();
      d.o       = document.getElementById('pico-o').value.trim();
      d.search_query = document.getElementById('search-query').value.trim();
      if (!d.search_query) {
        showToast('検索クエリを入力してください', 'error'); return;
      }
      runPubMedSearch(d.search_query);
    });

    // Back → question
    var backBtn = app.querySelector('.btn-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () { navigate('question'); });
    }
    var settingsBtn = app.querySelector('.btn-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function () { navigate('settings'); });
    }
  }

  /* ============================================================
     Render: Results Screen
     ============================================================ */
  function renderResults() {
    var html = '<div class="screen results-screen">';
    html += renderHeader('検索結果', true, true);

    html += '<div class="content">';

    if (papers.length === 0) {
      html += '<div class="no-results">';
      html += '<div class="no-results-icon">\uD83D\uDD0D</div>';
      html += '<p>論文が見つかりませんでした。</p>';
      html += '<p>検索クエリを変更してお試しください。</p>';
      html += '</div>';
    } else {
      html += '<div class="results-header">';
      html += '<span class="results-count">' + papers.length + '件の論文</span>';
      html += '<button id="summarize-all-btn" class="btn-secondary btn-small">'
        + '全体を要約する</button>';
      html += '</div>';

      html += '<div id="overall-summary-area"></div>';

      for (var i = 0; i < papers.length; i++) {
        html += buildPaperCardHtml(i);
      }
    }

    html += '</div></div>';

    app.innerHTML = html;

    if (overallSummary) renderOverallSummary();

    // Back → pico
    var backBtn = app.querySelector('.btn-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () { navigate('pico'); });
    }
    var settingsBtn = app.querySelector('.btn-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function () { navigate('settings'); });
    }

    var allBtn = document.getElementById('summarize-all-btn');
    if (allBtn) {
      allBtn.addEventListener('click', function () { summarizeAll(); });
    }

    bindPaperCardEvents();
  }

  function buildPaperCardHtml(idx) {
    var p = papers[idx];
    var html = '<div class="paper-card" data-idx="' + idx + '" id="paper-' + idx + '">';

    // Title with paper number
    html += '<div class="paper-title">';
    html += '<span class="paper-number">[' + (idx + 1) + ']</span>';
    html += '<a href="https://pubmed.ncbi.nlm.nih.gov/'
      + escapeHtml(p.pmid) + '/" target="_blank" rel="noopener">'
      + escapeHtml(p.title) + '</a></div>';

    // Study type badge
    var studyType = detectStudyType(p.title);
    if (studyType) {
      html += '<div><span class="study-type-badge">' + escapeHtml(studyType) + '</span></div>';
    }

    // Meta with journal badge
    html += '<div class="paper-meta">';
    var authorsStr = p.authors.length > 3
      ? p.authors.slice(0, 3).join(', ') + ' et al.'
      : p.authors.join(', ');
    html += escapeHtml(authorsStr) + '<br>';
    html += escapeHtml(p.source) + ' (' + escapeHtml(p.year) + ')';
    var badge = getJournalBadge(p.source);
    if (badge) {
      html += '<span class="journal-badge">' + escapeHtml(badge) + '</span>';
    }
    html += '</div>';

    html += '<div class="paper-actions">';
    if (p.summary) {
      html += '<button class="btn-secondary btn-small btn-summarize" disabled>要約済み</button>';
    } else {
      html += '<button class="btn-secondary btn-small btn-summarize">日本語で要約</button>';
    }
    html += '</div>';
    if (p.summary) {
      html += '<div class="paper-summary">' + escapeHtml(p.summary) + '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderPaperCard(idx) {
    var card = document.querySelector('[data-idx="' + idx + '"]');
    if (!card) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = buildPaperCardHtml(idx);
    var newCard = tmp.firstChild;
    card.replaceWith(newCard);
    var btn = newCard.querySelector('.btn-summarize');
    if (btn && !papers[idx].summary) {
      btn.addEventListener('click', function () { summarizePaper(idx); });
    }
  }

  function renderOverallSummary() {
    var area = document.getElementById('overall-summary-area');
    if (!area) return;

    // Escape first, then convert [N] to citation links
    var bodyHtml = escapeHtml(overallSummary);
    // Convert \n to <br>
    bodyHtml = bodyHtml.replace(/\n/g, '<br>');
    // Replace [N] with clickable links — map to _papersWithAbstract
    // [N] maps to papers[N-1] (same numbering as paper cards)
    bodyHtml = bodyHtml.replace(/\[(\d+)\]/g, function (match, num) {
      var idx = parseInt(num, 10) - 1;
      if (idx >= 0 && idx < papers.length) {
        var p = papers[idx];
        return '<a class="cite-ref" href="https://pubmed.ncbi.nlm.nih.gov/'
          + escapeHtml(p.pmid) + '/" target="_blank" rel="noopener" '
          + 'title="' + escapeAttr(p.title) + '"'
          + ' data-paper="' + idx + '"'
          + '>[' + num + ']</a>';
      }
      return match;
    });

    area.innerHTML = '<div class="overall-summary">'
      + '<h3>横断的要約</h3>'
      + '<div class="overall-summary-body">' + bodyHtml + '</div></div>';
  }

  function bindPaperCardEvents() {
    var btns = app.querySelectorAll('.btn-summarize');
    for (var i = 0; i < btns.length; i++) {
      (function (idx) {
        if (!btns[idx].disabled) {
          btns[idx].addEventListener('click', function () { summarizePaper(idx); });
        }
      })(i);
    }
  }

  /* ============================================================
     Render: Settings Screen
     ============================================================ */
  function renderSettings() {
    var html = '<div class="screen settings-screen">';
    html += renderHeader('設定', false, true);

    html += '<div class="content">';

    // API Key
    html += '<div class="settings-section">';
    html += '<h3>Gemini APIキー</h3>';
    html += '<div class="form-group">';
    html += '<label for="settings-key">APIキー</label>';
    html += '<input type="password" id="settings-key" value="'
      + escapeAttr(apiKey) + '" autocomplete="off">';
    html += '</div>';
    html += '<div class="settings-actions">';
    html += '<button id="update-key-btn" class="btn-primary">更新</button>';
    html += '<button id="delete-key-btn" class="btn-danger">削除</button>';
    html += '</div>';
    html += '</div>';

    // Proxy
    html += '<div class="settings-section">';
    html += '<h3>プロキシURL（オプション）</h3>';
    html += '<p class="desc">Gemini APIへの直接接続がCORSエラーになる場合、Cloudflare WorkerのURLを設定してください。</p>';
    html += '<div class="form-group">';
    html += '<label for="settings-proxy">プロキシURL</label>';
    html += '<input type="url" id="settings-proxy" value="'
      + escapeAttr(workerUrl)
      + '" placeholder="https://pico-proxy.xxx.workers.dev" autocomplete="off">';
    html += '</div>';
    html += '<button id="save-proxy-btn" class="btn-secondary">保存</button>';
    html += '</div>';

    html += '</div></div>';

    app.innerHTML = html;

    // Back
    var backBtn = app.querySelector('.btn-back');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        navigate(prevScreen || 'question');
      });
    }

    // Update key
    document.getElementById('update-key-btn').addEventListener('click', function () {
      var newKey = document.getElementById('settings-key').value.trim();
      if (!newKey) { showToast('APIキーを入力してください', 'error'); return; }
      showLoading('APIキーを検証中...');
      validateApiKey(newKey).then(function (result) {
        hideLoading();
        if (result.ok) {
          apiKey = newKey;
          localStorage.setItem('pico_api_key', newKey);
          showToast('APIキーを更新しました', 'success');
        } else if (result.reason === 'network') {
          apiKey = newKey;
          localStorage.setItem('pico_api_key', newKey);
          showToast('検証できませんでしたが保存しました', 'success');
        } else {
          showToast('APIキーが無効です。確認してください。', 'error');
        }
      });
    });

    // Delete key
    document.getElementById('delete-key-btn').addEventListener('click', function () {
      apiKey = '';
      localStorage.removeItem('pico_api_key');
      showToast('APIキーを削除しました', 'success');
      navigate('setup');
    });

    // Save proxy
    document.getElementById('save-proxy-btn').addEventListener('click', function () {
      var url = document.getElementById('settings-proxy').value.trim();
      if (url && url.charAt(url.length - 1) === '/') url = url.slice(0, -1);
      workerUrl = url;
      if (url) {
        localStorage.setItem('pico_worker_url', url);
      } else {
        localStorage.removeItem('pico_worker_url');
      }
      showToast('プロキシURLを保存しました', 'success');
    });
  }

  /* ============================================================
     Boot
     ============================================================ */
  init();
})();
