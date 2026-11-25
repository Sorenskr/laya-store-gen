/**
 * Laya App 商店截图生成器 - Gemini AI 文案生成引擎 + 1080×1920 PNG/MP4 导出器
 */
(function (global) {
  'use strict';

  function getStageDims(stageCanvas) {
    const rawW = (stageCanvas && stageCanvas.width) || global.LayaDefaults.STAGE_WIDTH || 1920;
    const rawH = (stageCanvas && stageCanvas.height) || global.LayaDefaults.STAGE_HEIGHT || 1080;
    return {
      w: Math.max(2, Math.floor(rawW / 2) * 2),
      h: Math.max(2, Math.floor(rawH / 2) * 2)
    };
  }

  function getFilePrefix(state) {
    if (!state) return 'Store_Poster';
    if (state.activeWorkspace === 'profile') return 'Profile_Poster';
    if (state.activeWorkspace === 'store-portrait') return 'Store_Portrait_9x16';
    return 'Store_Poster';
  }

  // 缓存每个 <video> 的 WebAudio SourceNode，避免重复绑定报错
  const videoAudioNodeMap = new WeakMap();
  let sharedAudioCtx = null;

  function ensureAudioContext() {
    if (!sharedAudioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) sharedAudioCtx = new AC();
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  }

  /**
   * 将上传的图片或当前视频帧压缩为 Base64 JPEG 供 Gemini 多模态识别
   */
  function extractMediaBase64(mediaEl) {
    if (!mediaEl) return null;
    try {
      const sw = mediaEl.videoWidth || mediaEl.naturalWidth || mediaEl.width;
      const sh = mediaEl.videoHeight || mediaEl.naturalHeight || mediaEl.height;
      if (!sw || !sh) return null;

      const maxDim = 512;
      const scale = Math.min(1, maxDim / Math.max(sw, sh));
      const cw = Math.max(1, Math.round(sw * scale));
      const ch = Math.max(1, Math.round(sh * scale));

      const temp = document.createElement('canvas');
      temp.width = cw;
      temp.height = ch;
      const tctx = temp.getContext('2d');
      tctx.drawImage(mediaEl, 0, 0, cw, ch);
      const dataUrl = temp.toDataURL('image/jpeg', 0.78);
      const base64 = dataUrl.split(',')[1];
      return base64 ? { mimeType: 'image/jpeg', data: base64 } : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * 智能异步截帧（若视频首帧全黑，自动跳至亮帧再识别）
   */
  async function extractMediaBase64Smart(mediaEl) {
    if (!mediaEl) return null;
    try {
      const isVid = String(mediaEl.tagName || '').toUpperCase() === 'VIDEO';
      if (isVid && mediaEl.readyState >= 2 && Number.isFinite(mediaEl.duration) && mediaEl.duration > 0.25) {
        const probeBright = () => {
          try {
            const c = document.createElement('canvas');
            c.width = 48;
            c.height = 48;
            const g = c.getContext('2d');
            g.drawImage(mediaEl, 0, 0, 48, 48);
            const d = g.getImageData(0, 0, 48, 48).data;
            let s = 0;
            for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
            return s / (d.length / 4) / 3;
          } catch (_) {
            return 30;
          }
        };
        if (probeBright() < 12) {
          const origTime = mediaEl.currentTime || 0;
          const tryTimes = [Math.min(0.45, mediaEl.duration * 0.2), Math.min(1.2, mediaEl.duration * 0.45)];
          for (const t of tryTimes) {
            await new Promise((res) => {
              let done = false;
              const finish = () => {
                if (done) return;
                done = true;
                mediaEl.removeEventListener('seeked', finish);
                res();
              };
              mediaEl.addEventListener('seeked', finish, { once: true });
              setTimeout(finish, 420);
              try {
                mediaEl.currentTime = t;
              } catch (_) {
                finish();
              }
            });
            if (probeBright() >= 12) break;
          }
          const res = extractMediaBase64(mediaEl);
          try {
            mediaEl.currentTime = origTime;
          } catch (_) {}
          if (res) return res;
        }
      }
    } catch (_) {}
    return extractMediaBase64(mediaEl);
  }

  /**
   * 针对单个刚上传的视频或图片，自动识别画面内容生成一句简短自然的底部标题（4~14 字）
   */
  async function recognizeSingleMediaTitleWithAI(options) {
    const { mediaEl, fileName, isTraditional, aiConfig } = options || {};
    const langName = isTraditional ? '繁体中文' : '简体中文';
    const conv = (s) =>
      isTraditional && global.LayaPosterLang ? global.LayaPosterLang.convertString(s, true) : s;

    const imgData = await extractMediaBase64Smart(mediaEl);
    const hasCaller =
      global.LayaProfileCenter && typeof global.LayaProfileCenter.callGeminiRequest === 'function';

    if (imgData && hasCaller) {
      try {
        const promptText = [
          '你是资深短视频社交平台内容运营。',
          `请仔细观察这张${fileName ? `名为「${fileName}」的` : ''}视频截图/照片里的画面人物动作、表情、物品、穿搭或场景氛围，为卡片底部生成 1 句自然真实、抓人眼球的${langName}短视频标题。`,
          '要求：',
          '1. 长度严格控制在 4~14 个字左右（一句短话，口语化真实感，不要加书名号、不要加引号、不要加换行）。',
          '2. 紧扣画面细节，避免空洞鸡汤（例如：深夜自拍破防瞬间 / 这甜度超标了吧 / 今日份氛围感大片）。',
          `严格只返回 JSON：{"footerTitle":"..."}，使用${langName}。`
        ].join('\n');

        const apiResp = await global.LayaProfileCenter.callGeminiRequest(
          aiConfig || {},
          [{ text: promptText }, { inlineData: imgData }],
          {
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 256,
              responseMimeType: 'application/json'
            }
          }
        );

        let parsed = null;
        if (typeof global.LayaProfileCenter.extractJsonFromGeminiResponse === 'function') {
          parsed = global.LayaProfileCenter.extractJsonFromGeminiResponse(apiResp);
        }
        const title = parsed && String(parsed.footerTitle || parsed.title || '').trim();
        if (title) {
          return { footerTitle: conv(title.replace(/\n+/g, ' ').replace(/\*/g, '').slice(0, 22)), usedRemoteAI: true };
        }
      } catch (_) {}
    }

    // 离线 / 兜底智能拟题（优先利用有意义的中文/英文文件名，其次按媒体类型与横竖比抽自然文案）
    const cleanName = String(fileName || '')
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    const isGeneric = /^(IMG|VID|Screenshot|screen|clip|video|image|REC|DCIM|微信|QQ|抖音|\d{4,}|[a-f0-9]{12,})/i.test(cleanName);
    if (cleanName && !isGeneric && cleanName.length >= 2 && cleanName.length <= 16) {
      return { footerTitle: conv(cleanName), usedRemoteAI: false };
    }

    const isVid = mediaEl && String(mediaEl.tagName || '').toUpperCase() === 'VIDEO';
    const vidPool = [
      '这段原声反差绝了 ✨',
      '深夜刷到直接沦陷',
      '谁懂这一帧的心动感',
      '状态在线的日常碎片',
      '看一遍就上头的现场'
    ];
    const imgPool = [
      '今日份氛围感自拍 ✨',
      '这颜值状态太能打了',
      '刚好捕捉到心动瞬间',
      '宝藏女孩的日常碎片',
      '光影满分的这一张 📸'
    ];
    const pool = isVid ? vidPool : imgPool;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return { footerTitle: conv(picked), usedRemoteAI: false };
  }

  /**
   * 调用 Gemini API（优先复用 LayaProfileCenter 的团队内置 Key / 多模型容错链，并兼容 Vertex AI / Studio / GAS 代理）
   */
  async function generateCardCopyWithGemini(options) {
    const { apiKey, gasProxyUrl, topicPrompt, targetCards, mediaRegistry, isTraditional, includeOverlayText } = options;
    const resolved =
      global.LayaProfileCenter && typeof global.LayaProfileCenter.resolveGeminiConfig === 'function'
        ? global.LayaProfileCenter.resolveGeminiConfig({ apiKey, gasProxyUrl })
        : { apiKey: String(apiKey || '').trim(), gasProxyUrl: String(gasProxyUrl || '').trim() };
    const trimmedKey = resolved.apiKey;
    const trimmedProxy = resolved.gasProxyUrl;
    const langName = isTraditional ? '繁体中文' : '简体中文';

    const count = targetCards.length;
    const promptText = [
      '你是「Laya 语音社交 App」资深短视频爆款文案策划。',
      `请根据主题关键词「${topicPrompt || '语音交友、声音控、情感共鸣、深夜连麦破防瞬间'}」${
        count > 0 ? `，为 ${count} 张双列短视频卡片生成极具点击欲望的${langName}短视频封面文案。` : ''
      }`,
      '要求：',
      '1. overlayTitle：画面顶部大字标题，分两行（用 \\n 换行），每行 4~8 个字，语气犀利有悬念或强烈共鸣（可用 *词语* 标出最多 1 个重点词，也可不标）。',
      '2. overlaySubtitle：画面底部单行字幕，6~13 个字，像真人说话吐槽或提问。',
      '3. footerTitle：卡片底部单行简洁标题（10~15 字以内，不含换行与星号）。',
      '4. likes：真实感点赞数字符串（如 "1437"、"2891"）。',
      `请严格只返回 JSON 格式：{"cards":[{"overlayTitle":"...","overlaySubtitle":"...","footerTitle":"...","likes":"..."}]}，数组长度必须为 ${count}，且所有文案必须使用${langName}。`
    ].join('\n');

    // 组装多模态 parts（附带已上传的图片/视频截帧）
    const parts = [{ text: promptText }];
    targetCards.forEach((card, idx) => {
      const m = mediaRegistry.cardMedia[card.id];
      if (m && m.el) {
        const imgData = extractMediaBase64(m.el);
        if (imgData) {
          parts.push({ text: `第 ${idx + 1} 张卡片的画面参考：` });
          parts.push({ inlineData: imgData });
        }
      }
    });

    if (global.LayaProfileCenter && typeof global.LayaProfileCenter.callGeminiRequest === 'function') {
      const apiResp = await global.LayaProfileCenter.callGeminiRequest(
        { apiKey: trimmedKey, gasProxyUrl: trimmedProxy },
        parts,
        {
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json'
          }
        }
      );
      return parseGeminiCardsJson(apiResp, count, Boolean(includeOverlayText));
    }

    const normalizedParts = parts.map((p) =>
      p && p.inlineData
        ? { inline_data: { mime_type: p.inlineData.mimeType || 'image/jpeg', data: p.inlineData.data } }
        : p
    );
    const baseGenCfg = {
      temperature: 0.9,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json'
    };

    // 1) 若配置了 Google Apps Script Web App URL，优先走 GAS 无服务器代理
    if (trimmedProxy) {
      const proxyResp = await fetch(trimmedProxy, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          apiKey: trimmedKey,
          payload: { contents: [{ role: 'user', parts: normalizedParts }], generationConfig: baseGenCfg }
        })
      });
      if (!proxyResp.ok) {
        throw new Error(`GAS 代理请求失败 (HTTP ${proxyResp.status})`);
      }
      const proxyJson = await proxyResp.json();
      if (proxyJson.error) {
        throw new Error(proxyJson.error.message || JSON.stringify(proxyJson.error));
      }
      return parseGeminiCardsJson(proxyJson, count, Boolean(includeOverlayText));
    }

    if (!trimmedKey) {
      throw new Error('请先填写 Gemini API Key');
    }

    // 2) 直接请求官方端点（3.8-flash -> flash-latest -> 2.5-flash -> 2.0-flash 容错链）
    const encKey = encodeURIComponent(trimmedKey);
    const modelSpecs = [
      { id: 'gemini-3.8-flash', cfg: Object.assign({ thinkingConfig: { thinkingLevel: 'LOW' } }, baseGenCfg) },
      { id: 'gemini-flash-latest', cfg: baseGenCfg },
      { id: 'gemini-2.5-flash', cfg: baseGenCfg },
      { id: 'gemini-2.0-flash', cfg: baseGenCfg }
    ];
    const attempts = [];
    modelSpecs.forEach((spec) => {
      const vertexUrl = `https://aiplatform.googleapis.com/v1/publishers/google/models/${spec.id}:generateContent?key=${encKey}`;
      const studioUrl = `https://generativelanguage.googleapis.com/v1beta/models/${spec.id}:generateContent?key=${encKey}`;
      if (trimmedKey.startsWith('AQ.')) {
        attempts.push({ url: vertexUrl, cfg: spec.cfg }, { url: studioUrl, cfg: spec.cfg });
      } else {
        attempts.push({ url: studioUrl, cfg: spec.cfg }, { url: vertexUrl, cfg: spec.cfg });
      }
    });

    let lastErr = null;
    for (const item of attempts) {
      try {
        const res = await fetch(item.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: normalizedParts }],
            generationConfig: item.cfg
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
          lastErr = new Error(msg);
          continue;
        }
        const parsed = parseGeminiCardsJson(data, count, Boolean(includeOverlayText));
        if (parsed && parsed.length > 0) {
          return parsed;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr || new Error('Gemini API 请求未返回有效文案');
  }

  function parseGeminiCardsJson(apiResponse, expectedCount, includeOverlayText) {
    const candidates = apiResponse && apiResponse.candidates;
    if (!candidates || !candidates.length) {
      throw new Error('模型未返回候选内容');
    }
    const parts = (candidates[0].content && candidates[0].content.parts) || [];
    const rawText = parts
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('')
      .trim();
    if (!rawText) {
      throw new Error('模型返回文本为空');
    }

    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const firstObj = cleaned.indexOf('{');
    const lastObj = cleaned.lastIndexOf('}');
    const firstArr = cleaned.indexOf('[');
    const lastArr = cleaned.lastIndexOf(']');
    let jsonSlice = cleaned;
    if (firstObj !== -1 && lastObj > firstObj && (firstArr === -1 || firstObj < firstArr)) {
      jsonSlice = cleaned.slice(firstObj, lastObj + 1);
    } else if (firstArr !== -1 && lastArr > firstArr) {
      jsonSlice = cleaned.slice(firstArr, lastArr + 1);
    }

    const obj = JSON.parse(jsonSlice);
    const arr = Array.isArray(obj) ? obj : obj.cards || [];
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error('解析 JSON 卡片列表失败');
    }

    const normalized = [];
    for (let i = 0; i < expectedCount; i++) {
      const src = arr[i % arr.length] || {};
      const titleStr = String(src.overlayTitle || '深夜连麦\n一秒沦陷的声音').replace(/\\n/g, '\n');
      normalized.push({
        overlayTitle: includeOverlayText ? titleStr : '',
        overlaySubtitle: includeOverlayText ? String(src.overlaySubtitle || '这种音色真的顶不住') : '',
        footerTitle: String(src.footerTitle || titleStr.replace(/\n+/g, ' ').replace(/\*/g, '')),
        likes: String(src.likes || Math.floor(Math.random() * 2600 + 800))
      });
    }
    return normalized;
  }

  /**
   * 内置高质量本地灵感备选库（默认仅更新底部标题与点赞，不往画面添加字幕）
   */
  function generateLocalFallbackCopy(topicPrompt, count, isTraditional, includeOverlayText) {
    const pool = [
      {
        overlayTitle: '耳机党慎入\n一开口就*沦陷*了',
        overlaySubtitle: '这低音炮谁听谁迷糊啊',
        footerTitle: '耳机党慎入！一开口就沦陷了',
        likes: '3182'
      },
      {
        overlayTitle: '深夜连麦\n遇到*神仙音色*',
        overlaySubtitle: '本来想睡觉结果聊到天亮',
        footerTitle: '深夜连麦遇到神仙音色',
        likes: '1964'
      },
      {
        overlayTitle: '最招人*讨厌*的音色\n青受音',
        overlaySubtitle: '爆雷率肯定很高',
        footerTitle: '最招人讨厌的音色—青受音',
        likes: '2337'
      },
      {
        overlayTitle: '大龄女生\n真正破防的瞬间',
        overlaySubtitle: '你们会 真的因此 pass 吗',
        footerTitle: '大龄女生真正破防的瞬间',
        likes: '1437'
      },
      {
        overlayTitle: '声音好听的男生\n到底有多*加分*',
        overlaySubtitle: '颜值不够 音色真的能凑吗',
        footerTitle: '声音好听的男生到底有多加分',
        likes: '2745'
      },
      {
        overlayTitle: '语音房潜规则\n千万别乱开麦',
        overlaySubtitle: '开口第一句就暴露性格了',
        footerTitle: '语音房潜规则：千万别乱开麦',
        likes: '1659'
      }
    ];

    const conv = (s) =>
      isTraditional && global.LayaPosterLang
        ? global.LayaPosterLang.convertString(s, true)
        : s;

    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    const out = [];
    for (let i = 0; i < count; i++) {
      const base = shuffled[i % shuffled.length];
      const item = {
        overlayTitle: includeOverlayText ? conv(base.overlayTitle) : '',
        overlaySubtitle: includeOverlayText ? conv(base.overlaySubtitle) : '',
        footerTitle: conv(base.footerTitle),
        likes: base.likes
      };
      if (topicPrompt && topicPrompt.trim() && i === 0 && topicPrompt.length <= 10) {
        item.footerTitle = `${conv(topicPrompt.trim())} · ${item.footerTitle}`;
      }
      out.push(item);
    }
    return out;
  }

  /**
   * 导出当前画布高清 PNG 截图（自适应 1920×1080 横屏、1080×1920 竖屏或个人中心长图）
   */
  function exportScreenshotPNG(stageCanvas, renderer, state) {
    return new Promise((resolve, reject) => {
      try {
        if (renderer && typeof renderer.ensureCanvasDimensions === 'function') {
          renderer.ensureCanvasDimensions(state);
        }
        renderer.render(state, true);
        const { w, h } = getStageDims(stageCanvas);
        const prefix = getFilePrefix(state);
        stageCanvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('生成 PNG 数据失败'));
            return;
          }
          const stamp = formatTimestamp();
          triggerDownload(blob, `${prefix}_${w}x${h}_${stamp}.png`);
          resolve({ w, h, orientation: h > w ? 'portrait' : 'landscape' });
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 导出当前画布高清 MP4 影片（锁定横竖屏方向 + WebCodecs/Mp4Muxer 标准封装 + 容器/解码双层方向校验）
   */
  function computeSafeVideoDims(stageCanvas, state) {
    let { w: srcW, h: srcH } = getStageDims(stageCanvas);
    if (state && state.activeWorkspace === 'store-portrait' && srcW > srcH) {
      srcW = (global.LayaDefaults && global.LayaDefaults.PORTRAIT_STAGE_WIDTH) || 1080;
      srcH = (global.LayaDefaults && global.LayaDefaults.PORTRAIT_STAGE_HEIGHT) || 1920;
    } else if (state && state.activeWorkspace === 'store' && srcH > srcW) {
      srcW = (global.LayaDefaults && global.LayaDefaults.STAGE_WIDTH) || 1920;
      srcH = (global.LayaDefaults && global.LayaDefaults.STAGE_HEIGHT) || 1080;
    } else if (state && state.activeWorkspace === 'profile' && srcW > srcH) {
      const tmp = srcW;
      srcW = srcH;
      srcH = tmp;
    }
    const maxEdge = 1920;
    const largest = Math.max(srcW, srcH);
    if (largest <= maxEdge) {
      return {
        w: srcW,
        h: srcH,
        srcW,
        srcH,
        scaled: false,
        orientation: srcH > srcW ? 'portrait' : 'landscape'
      };
    }
    const scale = maxEdge / largest;
    const outW = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const outH = Math.max(2, Math.round((srcH * scale) / 2) * 2);
    return {
      w: outW,
      h: outH,
      srcW,
      srcH,
      scaled: true,
      orientation: outH > outW ? 'portrait' : 'landscape'
    };
  }

  function buildExportState(rawState, videoMode) {
    if (!rawState || (videoMode !== 'webm-alpha' && videoMode !== 'mp4-greenscreen')) {
      return rawState;
    }
    const curTheme = rawState.layout && rawState.layout.canvasTheme;
    if (curTheme === 'transparent' || curTheme === 'full-transparent') {
      return rawState;
    }
    return Object.assign({}, rawState, {
      layout: Object.assign({}, rawState.layout || {}, {
        canvasTheme: 'transparent'
      })
    });
  }

  function createExportCanvas(w, h, keepAlpha) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: Boolean(keepAlpha) }) || canvas.getContext('2d');
    return { canvas, ctx };
  }

  function drawFrameToExportCanvas(exportCtx, stageCanvas, w, h, state, bgMode) {
    if (!exportCtx || !stageCanvas) return;
    if (bgMode === 'alpha') {
      exportCtx.clearRect(0, 0, w, h);
      exportCtx.drawImage(stageCanvas, 0, 0, w, h);
      return;
    }
    if (bgMode === 'greenscreen') {
      exportCtx.fillStyle = '#00FF00';
      exportCtx.fillRect(0, 0, w, h);
      exportCtx.drawImage(stageCanvas, 0, 0, w, h);
      return;
    }
    const isLight = state && state.layout && state.layout.canvasTheme === 'light';
    exportCtx.fillStyle = isLight ? '#f5f6fa' : '#09070f';
    exportCtx.fillRect(0, 0, w, h);
    exportCtx.drawImage(stageCanvas, 0, 0, w, h);
  }

  function readU32BE(bytes, offset) {
    return (
      ((bytes[offset] << 24) >>> 0) +
      (bytes[offset + 1] << 16) +
      (bytes[offset + 2] << 8) +
      bytes[offset + 3]
    );
  }

  function readI32BE(bytes, offset) {
    return (
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]
    );
  }

  function readU16BE(bytes, offset) {
    return (bytes[offset] << 8) | bytes[offset + 1];
  }

  function inspectMp4TrackDims(bytes) {
    const out = {
      hasVideoTrack: false,
      tkhdW: 0,
      tkhdH: 0,
      avc1W: 0,
      avc1H: 0,
      effW: 0,
      effH: 0,
      rotated90: false
    };
    const containerTypes = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);
    function walk(start, end, trackCtx) {
      let o = start;
      while (o + 8 <= end) {
        let sz = readU32BE(bytes, o);
        const tp = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
        let hs = 8;
        if (sz === 1) {
          if (o + 16 > end) break;
          sz = readU32BE(bytes, o + 8) * 4294967296 + readU32BE(bytes, o + 12);
          hs = 16;
        } else if (sz === 0) {
          sz = end - o;
        }
        if (sz < hs || o + sz > end) break;
        const boxEnd = o + sz;

        if (tp === 'trak') {
          const tInfo = { tkhdW: 0, tkhdH: 0, avc1W: 0, avc1H: 0, rotated90: false };
          walk(o + hs, boxEnd, tInfo);
          if (tInfo.tkhdW > 0 && tInfo.tkhdH > 0) {
            out.hasVideoTrack = true;
            out.tkhdW = tInfo.tkhdW;
            out.tkhdH = tInfo.tkhdH;
            out.avc1W = tInfo.avc1W || out.avc1W;
            out.avc1H = tInfo.avc1H || out.avc1H;
            out.rotated90 = tInfo.rotated90;
            out.effW = tInfo.rotated90 ? tInfo.tkhdH : tInfo.tkhdW;
            out.effH = tInfo.rotated90 ? tInfo.tkhdW : tInfo.tkhdH;
          }
        } else if (tp === 'tkhd' && trackCtx && o + hs + 84 <= boxEnd) {
          const version = bytes[o + hs];
          const matrixOff = o + hs + (version === 1 ? 52 : 40);
          if (matrixOff + 44 <= boxEnd) {
            const a = readI32BE(bytes, matrixOff);
            const b = readI32BE(bytes, matrixOff + 4);
            const c = readI32BE(bytes, matrixOff + 12);
            const d = readI32BE(bytes, matrixOff + 16);
            const wFixed = readU32BE(bytes, matrixOff + 36);
            const hFixed = readU32BE(bytes, matrixOff + 40);
            trackCtx.tkhdW = Math.round(wFixed / 65536);
            trackCtx.tkhdH = Math.round(hFixed / 65536);
            trackCtx.rotated90 = a === 0 && d === 0 && b !== 0 && c !== 0;
          }
        } else if (tp === 'avc1' && trackCtx && o + hs + 28 <= boxEnd) {
          trackCtx.avc1W = readU16BE(bytes, o + hs + 24);
          trackCtx.avc1H = readU16BE(bytes, o + hs + 26);
        } else if (tp === 'stsd' && o + hs + 8 <= boxEnd) {
          walk(o + hs + 8, boxEnd, trackCtx);
        } else if (containerTypes.has(tp)) {
          walk(o + hs, boxEnd, trackCtx);
        }
        o = boxEnd;
      }
    }
    walk(0, bytes.length, null);
    return out;
  }

  async function probeVideoElementDims(blob) {
    if (
      typeof global.HTMLVideoElement === 'undefined' ||
      typeof global.document === 'undefined' ||
      typeof global.document.createElement !== 'function' ||
      typeof global.URL === 'undefined' ||
      typeof global.URL.createObjectURL !== 'function'
    ) {
      return { checked: false };
    }
    let url = '';
    try {
      const vid = global.document.createElement('video');
      if (!vid || typeof vid.load !== 'function') return { checked: false };
      vid.muted = true;
      vid.playsInline = true;
      vid.preload = 'metadata';
      url = global.URL.createObjectURL(blob);
      return await new Promise((resolve) => {
        let done = false;
        const finish = (res) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          vid.onloadedmetadata = null;
          vid.onerror = null;
          try {
            vid.removeAttribute('src');
            vid.load();
          } catch (_) {}
          try {
            global.URL.revokeObjectURL(url);
          } catch (_) {}
          resolve(res);
        };
        const timer = setTimeout(() => finish({ checked: false }), 1500);
        vid.onloadedmetadata = () => {
          if (vid.videoWidth > 0 && vid.videoHeight > 0) {
            finish({ checked: true, width: vid.videoWidth, height: vid.videoHeight });
          } else {
            finish({ checked: false });
          }
        };
        vid.onerror = () => finish({ checked: true, error: '浏览器无法解码导出的视频文件' });
        vid.src = url;
      });
    } catch (_) {
      if (url) {
        try {
          global.URL.revokeObjectURL(url);
        } catch (__) {}
      }
      return { checked: false };
    }
  }

  async function readBlobBytes(blob) {
    if (typeof blob.arrayBuffer === 'function') {
      return new Uint8Array(await blob.arrayBuffer());
    }
    if (typeof global.FileReader !== 'undefined') {
      return new Promise((resolve, reject) => {
        const reader = new global.FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result || new ArrayBuffer(0)));
        reader.onerror = () => reject(reader.error || new Error('读取视频字节失败'));
        reader.readAsArrayBuffer(blob);
      });
    }
    if (Array.isArray(blob.parts)) {
      let total = 0;
      const chunks = blob.parts.map((p) => {
        if (p instanceof Uint8Array) return p;
        if (p instanceof ArrayBuffer) return new Uint8Array(p);
        if (ArrayBuffer.isView(p)) return new Uint8Array(p.buffer, p.byteOffset, p.byteLength);
        return new TextEncoder().encode(String(p));
      });
      chunks.forEach((c) => {
        total += c.length;
      });
      const out = new Uint8Array(total);
      let pos = 0;
      chunks.forEach((c) => {
        out.set(c, pos);
        pos += c.length;
      });
      return out;
    }
    return new Uint8Array(0);
  }

  async function validateVideoBlob(blob, ext, expectedDims) {
    if (!blob || typeof blob.size !== 'number' || blob.size < 1024) {
      return { valid: false, reason: '导出视频体积过小或为空' };
    }
    let bytes;
    try {
      bytes = await readBlobBytes(blob);
    } catch (e) {
      return { valid: false, reason: e.message || '读取导出文件失败' };
    }
    if (!bytes || bytes.length < 1024) {
      return { valid: false, reason: '导出视频有效字节不足' };
    }

    if (ext === 'mp4') {
      if (bytes.length < 24) {
        return { valid: false, reason: 'MP4 文件头长度不足' };
      }
      const firstType = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
      if (firstType !== 'ftyp') {
        return { valid: false, reason: `MP4 缺少 ftyp 文件头（实际为 ${firstType}）` };
      }
      let offset = 0;
      let hasMoov = false;
      let hasMdat = false;
      let mdatPayload = 0;
      while (offset + 8 <= bytes.length) {
        let boxSize = readU32BE(bytes, offset);
        const boxType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
        let headerSize = 8;
        if (boxSize === 1) {
          if (offset + 16 > bytes.length) {
            return { valid: false, reason: `MP4 扩展盒体长度损坏（${boxType}）` };
          }
          const hi = readU32BE(bytes, offset + 8);
          const lo = readU32BE(bytes, offset + 12);
          boxSize = hi * 4294967296 + lo;
          headerSize = 16;
        } else if (boxSize === 0) {
          boxSize = bytes.length - offset;
        }
        if (boxSize < headerSize || offset + boxSize > bytes.length) {
          return { valid: false, reason: `MP4 盒体结构异常或被截断（${boxType}）` };
        }
        if (boxType === 'moov') hasMoov = true;
        if (boxType === 'mdat') {
          hasMdat = true;
          mdatPayload += boxSize - headerSize;
        }
        offset += boxSize;
      }
      if (offset !== bytes.length) {
        return { valid: false, reason: 'MP4 尾部存在损坏残留字节' };
      }
      if (!hasMoov) {
        return { valid: false, reason: 'MP4 缺少 moov 元数据索引' };
      }
      if (!hasMdat || mdatPayload <= 64) {
        return { valid: false, reason: 'MP4 缺少有效视频帧数据（mdat 为空）' };
      }

      if (expectedDims && expectedDims.w > 0 && expectedDims.h > 0) {
        const trackInfo = inspectMp4TrackDims(bytes);
        if (trackInfo.hasVideoTrack && trackInfo.effW > 0 && trackInfo.effH > 0) {
          const wantPortrait = expectedDims.h > expectedDims.w;
          const gotPortrait = trackInfo.effH > trackInfo.effW;
          if (wantPortrait !== gotPortrait) {
            return {
              valid: false,
              reason: `MP4 显示方向与当前模式相反（期望 ${expectedDims.w}×${expectedDims.h}，实际 ${trackInfo.effW}×${trackInfo.effH}）`
            };
          }
          const wantRatio = expectedDims.w / expectedDims.h;
          const gotRatio = trackInfo.effW / trackInfo.effH;
          if (Math.abs(wantRatio - gotRatio) > 0.08) {
            return {
              valid: false,
              reason: `MP4 宽高比例异常（期望 ${expectedDims.w}×${expectedDims.h}，实际 ${trackInfo.effW}×${trackInfo.effH}）`
            };
          }
          if (!trackInfo.rotated90 && trackInfo.avc1W > 0 && trackInfo.avc1H > 0) {
            if ((trackInfo.avc1H > trackInfo.avc1W) !== wantPortrait) {
              return {
                valid: false,
                reason: `MP4 编码分辨率方向异常（期望 ${expectedDims.w}×${expectedDims.h}，avc1 为 ${trackInfo.avc1W}×${trackInfo.avc1H}）`
              };
            }
          }
        }
      }
    } else if (ext === 'webm') {
      if (bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) {
        return { valid: false, reason: 'WebM 缺少合法 EBML 文件头' };
      }
    }

    const probe = await probeVideoElementDims(blob);
    if (probe.error) {
      return { valid: false, reason: probe.error };
    }
    if (probe.checked && expectedDims && expectedDims.w > 0 && expectedDims.h > 0) {
      const wantPortrait = expectedDims.h > expectedDims.w;
      const decodedPortrait = probe.height > probe.width;
      if (wantPortrait !== decodedPortrait) {
        return {
          valid: false,
          reason: `浏览器实测解码方向错误（期望 ${expectedDims.w}×${expectedDims.h}，实测解码 ${probe.width}×${probe.height}）`
        };
      }
      const wantRatio = expectedDims.w / expectedDims.h;
      const gotRatio = probe.width / probe.height;
      if (Math.abs(wantRatio - gotRatio) > 0.08) {
        return {
          valid: false,
          reason: `浏览器实测解码比例异常（期望 ${expectedDims.w}×${expectedDims.h}，实测解码 ${probe.width}×${probe.height}）`
        };
      }
    }

    return { valid: true };
  }

  function pickMediaRecorderMime(hasAudio, preferWebm) {
    if (typeof global.MediaRecorder === 'undefined' || typeof global.MediaRecorder.isTypeSupported !== 'function') {
      return null;
    }
    const candidates = preferWebm
      ? hasAudio
        ? [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
          ]
        : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      : hasAudio
      ? [
          'video/mp4;codecs=avc1.4d002a,mp4a.40.2',
          'video/mp4;codecs=avc1.64002a,mp4a.40.2',
          'video/mp4;codecs=avc1.640028,mp4a.40.2',
          'video/mp4;codecs=avc1,mp4a.40.2',
          'video/mp4;codecs=h264,mp4a.40.2',
          'video/mp4'
        ]
      : [
          'video/mp4;codecs=avc1.4d002a',
          'video/mp4;codecs=avc1.64002a',
          'video/mp4;codecs=avc1.640028',
          'video/mp4;codecs=avc1',
          'video/mp4;codecs=h264',
          'video/mp4'
        ];
    return candidates.find((t) => global.MediaRecorder.isTypeSupported(t)) || null;
  }

  async function pickWebCodecsVideoConfig(w, h, fps, preferredHwMode) {
    if (typeof global.VideoEncoder === 'undefined' || typeof global.VideoEncoder.isConfigSupported !== 'function') {
      return null;
    }
    const codecs = [
      'avc1.4d002a',
      'avc1.64002a',
      'avc1.42002a',
      'avc1.640033',
      'avc1.4d0033',
      'avc1.420033',
      'avc1.640028',
      'avc1.4d0028'
    ];
    const isPortrait = h > w;
    // 竖屏 1080×1920 在部分 Windows GPU 硬件编码器下会强行转横屏或拉伸，优先走软件 H.264 保证竖屏几何尺寸精确
    const hwModes = preferredHwMode
      ? [preferredHwMode]
      : isPortrait
      ? ['prefer-software', 'no-preference']
      : ['no-preference', 'prefer-software'];
    const bitrates = [8_000_000, 5_000_000];
    for (const hw of hwModes) {
      for (const codec of codecs) {
        for (const bitrate of bitrates) {
          const cfg = {
            codec,
            width: w,
            height: h,
            displayWidth: w,
            displayHeight: h,
            bitrate,
            framerate: fps,
            hardwareAcceleration: hw,
            avc: { format: 'avc' }
          };
          try {
            const res = await global.VideoEncoder.isConfigSupported(cfg);
            if (res && res.supported) {
              const outCfg = Object.assign({}, res.config || cfg, {
                width: w,
                height: h,
                displayWidth: w,
                displayHeight: h
              });
              return outCfg;
            }
          } catch (_) {}
        }
      }
    }
    return null;
  }

  async function prepareMixedAudioBuffer(activeVideos, durationSec) {
    const audibleVideos = (activeVideos || []).filter((v) => v && !v.muted && (v.currentSrc || v.src));
    if (
      audibleVideos.length === 0 ||
      typeof global.AudioEncoder === 'undefined' ||
      typeof global.AudioEncoder.isConfigSupported !== 'function' ||
      typeof global.AudioData === 'undefined'
    ) {
      return null;
    }
    const OfflineAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!OfflineAC) return null;

    const sampleRate = 48000;
    const numberOfChannels = 2;
    try {
      const support = await global.AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        sampleRate,
        numberOfChannels,
        bitrate: 128_000
      });
      if (!support || !support.supported) return null;
    } catch (_) {
      return null;
    }

    const totalFrames = Math.max(sampleRate, Math.ceil(durationSec * sampleRate));
    const offline = new OfflineAC(numberOfChannels, totalFrames, sampleRate);
    let attachedCount = 0;

    for (const v of audibleVideos) {
      try {
        const srcUrl = v.currentSrc || v.src;
        if (!srcUrl) continue;
        const resp = await fetch(srcUrl);
        if (!resp.ok) continue;
        const rawBuf = await resp.arrayBuffer();
        const decoded = await offline.decodeAudioData(rawBuf);
        if (!decoded || decoded.duration <= 0) continue;
        const srcNode = offline.createBufferSource();
        srcNode.buffer = decoded;
        srcNode.loop = true;
        srcNode.connect(offline.destination);
        srcNode.start(0);
        attachedCount += 1;
      } catch (_) {}
    }

    if (attachedCount === 0) return null;
    try {
      return await offline.startRendering();
    } catch (_) {
      return null;
    }
  }

  async function exportVideoMP4(options) {
    const {
      stageCanvas,
      renderer,
      getState,
      mediaRegistry,
      customDurationSec,
      videoMode = 'mp4-standard',
      onProgress,
      abortSignal
    } = options;

    const rawState = getState();
    const getExportState = () => buildExportState(getState(), videoMode);
    const initialExportState = buildExportState(rawState, videoMode);
    if (renderer && typeof renderer.ensureCanvasDimensions === 'function') {
      renderer.ensureCanvasDimensions(rawState);
    }
    renderer.render(initialExportState, false);
    const dims = computeSafeVideoDims(stageCanvas, rawState);
    const { w, h } = dims;
    const filePrefix = getFilePrefix(rawState);
    const isAlphaWebm = videoMode === 'webm-alpha';
    const isGreenScreen = videoMode === 'mp4-greenscreen';
    const bgMode = isAlphaWebm ? 'alpha' : isGreenScreen ? 'greenscreen' : 'opaque';
    const fileTag = isAlphaWebm ? 'Alpha' : isGreenScreen ? 'GreenScreen' : '';

    const activeVideos = [];
    if (rawState.activeWorkspace === 'profile') {
      const posts = (rawState.profileCenter && rawState.profileCenter.posts) || [];
      posts.forEach((p) => {
        const entry = mediaRegistry.profCardMedia && mediaRegistry.profCardMedia[p.id];
        if (entry && entry.type === 'video' && entry.el) {
          activeVideos.push(entry.el);
        }
      });
    } else {
      (rawState.feedModule.cards || []).forEach((c) => {
        const entry = mediaRegistry.cardMedia[c.id];
        if (entry && entry.type === 'video' && entry.el) {
          activeVideos.push(entry.el);
        }
      });
    }

    // 计算导出时长：取最长视频时长（上限 60 秒）或用户指定秒数（无视频时默认 5 秒动态预览）
    let durationSec = Number(customDurationSec) || 0;
    if (durationSec <= 0) {
      const maxVidDur = activeVideos.reduce((m, v) => {
        const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
        return Math.max(m, d);
      }, 0);
      durationSec = maxVidDur > 0 ? Math.min(60, maxVidDur) : 5;
    }

    // 将所有上传的卡片视频重置到 0 秒并同步播放
    for (const v of activeVideos) {
      try {
        v.currentTime = 0;
        v.loop = true;
        await v.play();
      } catch (_) {}
    }

    try {
      // 方案一：真透明 WebM（VP9 + Alpha 通道，免抠直叠）
      if (isAlphaWebm) {
        return await recordViaMediaRecorder({
          stageCanvas,
          renderer,
          getState: getExportState,
          activeVideos,
          durationSec,
          preferWebm: true,
          keepAlpha: true,
          bgMode: 'alpha',
          fileTag: 'Alpha',
          videoMode,
          w,
          h,
          filePrefix,
          onProgress,
          abortSignal
        });
      }

      // 方案 A：优先使用 Mp4Muxer + WebCodecs VideoEncoder（竖屏优先软件 H.264、横屏优先硬件，支持标准与绿幕 MP4）
      if (global.Mp4Muxer && typeof global.VideoEncoder !== 'undefined' && typeof global.VideoFrame !== 'undefined') {
        const hwCandidates = h > w ? ['prefer-software', 'no-preference'] : ['no-preference', 'prefer-software'];
        for (const hwMode of hwCandidates) {
          try {
            return await recordViaWebCodecsMp4({
              stageCanvas,
              renderer,
              getState: getExportState,
              activeVideos,
              durationSec,
              w,
              h,
              hwMode,
              bgMode,
              fileTag,
              videoMode,
              filePrefix,
              onProgress,
              abortSignal
            });
          } catch (errA) {
            console.warn(`[LayaExport] WebCodecs Mp4Muxer (${hwMode}) 失败或方向校验不通过:`, errA);
          }
        }
      }

      // 方案 B：原生 MediaRecorder 直出 MP4（仅在确有音轨时声明 AAC，并严格校验容器结构）
      if (typeof global.MediaRecorder !== 'undefined') {
        try {
          return await recordViaMediaRecorder({
            stageCanvas,
            renderer,
            getState: getExportState,
            activeVideos,
            durationSec,
            preferWebm: false,
            keepAlpha: false,
            bgMode,
            fileTag,
            videoMode,
            w,
            h,
            filePrefix,
            onProgress,
            abortSignal
          });
        } catch (errB) {
          console.warn('[LayaExport] 原生 MediaRecorder MP4 校验未通过或受限，回退高兼容 WebM:', errB);
        }
      }

      // 方案 C：高兼容 WebM 兜底
      return await recordViaMediaRecorder({
        stageCanvas,
        renderer,
        getState: getExportState,
        activeVideos,
        durationSec,
        preferWebm: true,
        keepAlpha: false,
        bgMode,
        fileTag,
        videoMode,
        w,
        h,
        filePrefix,
        onProgress,
        abortSignal
      });
    } finally {
      // 导出完成后立即按原始画布状态重绘一次，确保临时透明导出不影响实时预览
      try {
        renderer.render(getState(), false);
      } catch (_) {}
    }
  }

  function recordViaMediaRecorder(cfg) {
    const {
      stageCanvas,
      renderer,
      getState,
      activeVideos,
      durationSec,
      preferWebm,
      keepAlpha,
      bgMode,
      fileTag,
      videoMode,
      w,
      h,
      filePrefix,
      onProgress,
      abortSignal
    } = cfg;

    return new Promise((resolve, reject) => {
      if (typeof global.MediaRecorder === 'undefined') {
        reject(new Error('当前浏览器不支持 MediaRecorder 视频录制'));
        return;
      }

      const fps = 30;
      const { canvas: exportCanvas, ctx: exportCtx } = createExportCanvas(w, h, Boolean(keepAlpha));
      renderer.render(getState(), false);
      drawFrameToExportCanvas(exportCtx, stageCanvas, w, h, getState(), bgMode || 'opaque');

      const canvasStream = exportCanvas.captureStream(fps);
      const combinedTracks = [...canvasStream.getVideoTracks()];
      let hasAudio = false;

      // 仅当存在真实未静音音频轨道时混入并向 MediaRecorder 声明音轨
      if (activeVideos.length > 0) {
        try {
          const audioCtx = ensureAudioContext();
          if (audioCtx) {
            const dest = audioCtx.createMediaStreamDestination();
            let connected = 0;
            activeVideos.forEach((v) => {
              if (v.muted) return;
              let srcNode = videoAudioNodeMap.get(v);
              if (!srcNode) {
                srcNode = audioCtx.createMediaElementSource(v);
                srcNode.connect(audioCtx.destination);
                videoAudioNodeMap.set(v, srcNode);
              }
              try {
                srcNode.connect(dest);
                connected += 1;
              } catch (_) {}
            });
            const audioTracks = dest.stream.getAudioTracks();
            if (connected > 0 && audioTracks.length > 0) {
              combinedTracks.push(audioTracks[0]);
              hasAudio = true;
            }
          }
        } catch (_) {
          // 忽略无音轨视频的音频上下文异常
        }
      }

      const mimeType = pickMediaRecorderMime(hasAudio, Boolean(preferWebm));
      if (!mimeType) {
        canvasStream.getTracks().forEach((t) => t.stop());
        reject(new Error(preferWebm ? '当前浏览器不支持 WebM 录制' : '当前浏览器不支持原生 MP4 录制'));
        return;
      }
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const tagPart = fileTag ? `_${fileTag}` : '';

      const finalStream = new MediaStream(combinedTracks);
      const chunks = [];
      let recorder;
      try {
        recorder = new global.MediaRecorder(finalStream, {
          mimeType,
          videoBitsPerSecond: 8_000_000
        });
      } catch (e) {
        canvasStream.getTracks().forEach((t) => t.stop());
        reject(e);
        return;
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      let animId = 0;
      const startTime = performance.now();
      const totalMs = durationSec * 1000;
      let finished = false;

      const finishRecording = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(animId);
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      if (abortSignal) {
        abortSignal.onStopEarly = finishRecording;
      }

      recorder.onstop = async () => {
        canvasStream.getTracks().forEach((t) => t.stop());
        try {
          const blob = new Blob(chunks, { type: mimeType });
          const check = await validateVideoBlob(blob, ext, { w, h });
          if (!check.valid) {
            reject(new Error(check.reason || '录制生成的视频文件无效'));
            return;
          }
          const stamp = formatTimestamp();
          triggerDownload(blob, `${filePrefix}${tagPart}_${w}x${h}_${stamp}.${ext}`);
          if (onProgress) onProgress(100);
          resolve({
            ext,
            durationSec,
            w,
            h,
            orientation: h > w ? 'portrait' : 'landscape',
            videoMode: videoMode || 'mp4-standard',
            engine: `mediarecorder-${ext}`
          });
        } catch (err) {
          reject(err);
        }
      };

      recorder.onerror = (err) => {
        finished = true;
        cancelAnimationFrame(animId);
        canvasStream.getTracks().forEach((t) => t.stop());
        reject(err.error || new Error('录制影片过程出错'));
      };

      // 不使用短间隔分片（如 start(200)），避免生成在本地播放器报损坏的碎裂 fMP4
      recorder.start();

      const pumpFrame = () => {
        if (finished) return;
        const elapsed = performance.now() - startTime;
        const curState = getState();
        if (renderer && typeof renderer.ensureCanvasDimensions === 'function') {
          renderer.ensureCanvasDimensions(curState);
        }
        renderer.render(curState, false);
        drawFrameToExportCanvas(exportCtx, stageCanvas, w, h, curState, bgMode || 'opaque');
        const pct = Math.min(99, Math.round((elapsed / totalMs) * 100));
        if (onProgress) onProgress(pct);

        if (elapsed >= totalMs) {
          finishRecording();
          return;
        }
        animId = requestAnimationFrame(pumpFrame);
      };

      pumpFrame();
    });
  }

  async function recordViaWebCodecsMp4(cfg) {
    const {
      stageCanvas,
      renderer,
      getState,
      activeVideos,
      durationSec,
      w,
      h,
      hwMode,
      bgMode,
      fileTag,
      videoMode,
      filePrefix,
      onProgress,
      abortSignal
    } = cfg;
    const Mp4Muxer = global.Mp4Muxer;
    const fps = 30;
    const frameDurationUs = Math.round(1_000_000 / fps);
    const totalFrames = Math.max(15, Math.round(durationSec * fps));

    const videoConfig = await pickWebCodecsVideoConfig(w, h, fps, hwMode);
    if (!videoConfig) {
      throw new Error(`当前浏览器 WebCodecs 不支持 ${w}×${h} (${hwMode || 'auto'}) H.264 编码`);
    }

    const mixedAudio = await prepareMixedAudioBuffer(activeVideos, durationSec);
    const hasAudio = Boolean(mixedAudio && mixedAudio.length > 0);

    const muxerOpts = {
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: w,
        height: h,
        rotation: 0,
        frameRate: fps
      },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset'
    };
    if (hasAudio) {
      muxerOpts.audio = {
        codec: 'aac',
        numberOfChannels: 2,
        sampleRate: 48000
      };
    }

    const muxer = new Mp4Muxer.Muxer(muxerOpts);
    const { canvas: exportCanvas, ctx: exportCtx } = createExportCanvas(w, h, false);

    let encoderError = null;
    let encodedVideoChunks = 0;
    const wantPortrait = h > w;
    const encoder = new global.VideoEncoder({
      output: (chunk, meta) => {
        const dc = meta && meta.decoderConfig;
        if (dc && dc.codedWidth > 0 && dc.codedHeight > 0 && (dc.codedHeight > dc.codedWidth) !== wantPortrait) {
          encoderError = new Error(
            `编码器输出方向与当前画布相反（预期 ${w}×${h}，输出 ${dc.codedWidth}×${dc.codedHeight}）`
          );
          return;
        }
        encodedVideoChunks += 1;
        muxer.addVideoChunk(chunk, meta);
      },
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e || 'VideoEncoder 编码失败'));
      }
    });

    encoder.configure(videoConfig);

    let stoppedEarly = false;
    if (abortSignal) {
      abortSignal.onStopEarly = () => {
        stoppedEarly = true;
      };
    }

    try {
      const frameIntervalMs = 1000 / fps;
      for (let i = 0; i < totalFrames; i++) {
        if (i > 0 && stoppedEarly) break;
        if (encoderError) throw encoderError;

        while (encoder.encodeQueueSize > 8 && !encoderError) {
          await new Promise((r) => setTimeout(r, 15));
        }
        if (encoderError) throw encoderError;

        const frameStart = performance.now();
        const curState = getState();
        if (renderer && typeof renderer.ensureCanvasDimensions === 'function') {
          renderer.ensureCanvasDimensions(curState);
        }
        renderer.render(curState, false);
        drawFrameToExportCanvas(exportCtx, stageCanvas, w, h, curState, bgMode || 'opaque');

        const timestampUs = i * frameDurationUs;
        let vf;
        try {
          vf = new global.VideoFrame(exportCanvas, {
            timestamp: timestampUs,
            duration: frameDurationUs,
            visibleRect: { x: 0, y: 0, width: w, height: h },
            displayWidth: w,
            displayHeight: h
          });
        } catch (_) {
          vf = new global.VideoFrame(exportCanvas, {
            timestamp: timestampUs,
            duration: frameDurationUs
          });
        }
        encoder.encode(vf, { keyFrame: i % (fps * 2) === 0 });
        vf.close();

        if (onProgress) {
          onProgress(Math.min(94, Math.round(((i + 1) / totalFrames) * 94)));
        }

        const spent = performance.now() - frameStart;
        const waitMs = Math.max(2, frameIntervalMs - spent);
        await new Promise((r) => setTimeout(r, waitMs));
      }

      await encoder.flush();
      if (encoderError) throw encoderError;
      if (encodedVideoChunks === 0) {
        throw new Error('VideoEncoder 未输出任何有效视频帧');
      }
    } finally {
      try {
        if (encoder.state !== 'closed') encoder.close();
      } catch (_) {}
    }

    if (hasAudio) {
      let audioError = null;
      const audioEncoder = new global.AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => {
          audioError = e instanceof Error ? e : new Error(String(e || 'AudioEncoder 编码失败'));
        }
      });
      try {
        audioEncoder.configure({
          codec: 'mp4a.40.2',
          numberOfChannels: 2,
          sampleRate: 48000,
          bitrate: 128_000
        });
        const sampleRate = 48000;
        const ch0 = mixedAudio.getChannelData(0);
        const ch1 = mixedAudio.numberOfChannels > 1 ? mixedAudio.getChannelData(1) : ch0;
        const totalSamples = mixedAudio.length;
        const chunkSamples = 1024;
        for (let offset = 0; offset < totalSamples && !audioError; offset += chunkSamples) {
          const frames = Math.min(chunkSamples, totalSamples - offset);
          const planar = new Float32Array(frames * 2);
          planar.set(ch0.subarray(offset, offset + frames), 0);
          planar.set(ch1.subarray(offset, offset + frames), frames);
          const audioData = new global.AudioData({
            format: 'f32-planar',
            sampleRate,
            numberOfFrames: frames,
            numberOfChannels: 2,
            timestamp: Math.round((offset * 1_000_000) / sampleRate),
            data: planar
          });
          audioEncoder.encode(audioData);
          audioData.close();
        }
        await audioEncoder.flush();
        if (audioError) throw audioError;
      } finally {
        try {
          if (audioEncoder.state !== 'closed') audioEncoder.close();
        } catch (_) {}
      }
    }

    if (onProgress) onProgress(97);
    muxer.finalize();

    const buffer = muxer.target && muxer.target.buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    const check = await validateVideoBlob(blob, 'mp4', { w, h });
    if (!check.valid) {
      throw new Error(check.reason || '生成的 MP4 容器校验失败');
    }

    const stamp = formatTimestamp();
    const tagPart = fileTag ? `_${fileTag}` : '';
    triggerDownload(blob, `${filePrefix}${tagPart}_${w}x${h}_${stamp}.mp4`);
    if (onProgress) onProgress(100);
    return {
      ext: 'mp4',
      durationSec,
      w,
      h,
      orientation: wantPortrait ? 'portrait' : 'landscape',
      videoMode: videoMode || 'mp4-standard',
      engine: 'webcodecs-mp4'
    };
  }

  function formatTimestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(
      d.getMinutes()
    )}${pad(d.getSeconds())}`;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  global.LayaAIExporter = {
    generateCardCopyWithGemini,
    generateLocalFallbackCopy,
    recognizeSingleMediaTitleWithAI,
    exportScreenshotPNG,
    exportVideoMP4,
    buildExportState,
    computeSafeVideoDims,
    pickMediaRecorderMime,
    pickWebCodecsVideoConfig,
    inspectMp4TrackDims,
    validateVideoBlob
  };
})(window);
