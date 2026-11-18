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
    return state && state.activeWorkspace === 'profile' ? 'Profile_Poster' : 'Store_Poster';
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
   * 导出当前画布高清 PNG 截图（自适应 1920×1080 横屏或 1080×自适应 个人中心长图/竖屏）
   */
  function exportScreenshotPNG(stageCanvas, renderer, state) {
    return new Promise((resolve, reject) => {
      try {
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
          resolve({ w, h });
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 导出当前画布高清 MP4 影片（支持原生 H.264 MediaRecorder + WebAudio 混音 + WebCodecs Mp4Muxer 兜底）
   */
  async function exportVideoMP4(options) {
    const {
      stageCanvas,
      renderer,
      getState,
      mediaRegistry,
      customDurationSec,
      onProgress,
      abortSignal
    } = options;

    const state = getState();
    renderer.render(state, false);
    const { w, h } = getStageDims(stageCanvas);
    const filePrefix = getFilePrefix(state);

    const activeVideos = [];
    if (state.activeWorkspace === 'profile') {
      const posts = (state.profileCenter && state.profileCenter.posts) || [];
      posts.forEach((p) => {
        const entry = mediaRegistry.profCardMedia && mediaRegistry.profCardMedia[p.id];
        if (entry && entry.type === 'video' && entry.el) {
          activeVideos.push(entry.el);
        }
      });
    } else {
      (state.feedModule.cards || []).forEach((c) => {
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

    // 检测浏览器原生 MP4 MediaRecorder 支持度
    const mp4MimeTypes = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=h264',
      'video/mp4'
    ];
    const supportedMp4Mime =
      typeof MediaRecorder !== 'undefined'
        ? mp4MimeTypes.find((t) => MediaRecorder.isTypeSupported(t))
        : null;

    // 方案 A：原生 MediaRecorder 直出 MP4（含音轨合成）
    if (supportedMp4Mime) {
      return recordViaMediaRecorder({
        stageCanvas,
        renderer,
        getState,
        activeVideos,
        durationSec,
        mimeType: supportedMp4Mime,
        ext: 'mp4',
        w,
        h,
        filePrefix,
        onProgress,
        abortSignal
      });
    }

    // 方案 B：若 MediaRecorder 不支持 MP4，使用 CDN 加载的 Mp4Muxer + WebCodecs VideoEncoder 编码标準 H.264 MP4
    if (global.Mp4Muxer && typeof global.VideoEncoder !== 'undefined') {
      return recordViaWebCodecsMp4({
        stageCanvas,
        renderer,
        getState,
        durationSec,
        w,
        h,
        filePrefix,
        onProgress,
        abortSignal
      });
    }

    // 方案 C：兜底高码率录制
    const fallbackMime =
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

    return recordViaMediaRecorder({
      stageCanvas,
      renderer,
      getState,
      activeVideos,
      durationSec,
      mimeType: fallbackMime,
      ext: fallbackMime.includes('mp4') ? 'mp4' : 'webm',
      w,
      h,
      filePrefix,
      onProgress,
      abortSignal
    });
  }

  function recordViaMediaRecorder(cfg) {
    const {
      stageCanvas,
      renderer,
      getState,
      activeVideos,
      durationSec,
      mimeType,
      ext,
      w,
      h,
      filePrefix,
      onProgress,
      abortSignal
    } = cfg;

    return new Promise((resolve, reject) => {
      const fps = 30;
      const canvasStream = stageCanvas.captureStream(fps);
      const combinedTracks = [...canvasStream.getVideoTracks()];

      // 混入上传视频的音频轨道
      if (activeVideos.length > 0) {
        try {
          const audioCtx = ensureAudioContext();
          if (audioCtx) {
            const dest = audioCtx.createMediaStreamDestination();
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
              } catch (_) {}
            });
            const audioTracks = dest.stream.getAudioTracks();
            if (audioTracks.length > 0) {
              combinedTracks.push(audioTracks[0]);
            }
          }
        } catch (_) {
          // 忽略部分无音轨视频的音频上下文错误
        }
      }

      const finalStream = new MediaStream(combinedTracks);
      const chunks = [];
      let recorder;
      try {
        recorder = new MediaRecorder(finalStream, {
          mimeType,
          videoBitsPerSecond: 12_000_000 // 12Mbps 确保 1080×1920 文字边缘锐利无色块
        });
      } catch (e) {
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

      recorder.onstop = () => {
        canvasStream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        const stamp = formatTimestamp();
        triggerDownload(blob, `${filePrefix}_${w}x${h}_${stamp}.${ext}`);
        if (onProgress) onProgress(100);
        resolve({ ext, durationSec });
      };

      recorder.onerror = (err) => {
        cancelAnimationFrame(animId);
        reject(err.error || new Error('录制影片过程出错'));
      };

      recorder.start(200);

      const pumpFrame = () => {
        if (finished) return;
        const elapsed = performance.now() - startTime;
        renderer.render(getState());
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
    const { stageCanvas, renderer, getState, durationSec, w, h, filePrefix, onProgress, abortSignal } = cfg;
    const Mp4Muxer = global.Mp4Muxer;
    const fps = 30;
    const totalFrames = Math.max(15, Math.round(durationSec * fps));

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: w,
        height: h
      },
      fastStart: 'in-memory'
    });

    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error('VideoEncoder error:', e)
    });

    const codecStr = w * h > 1920 * 1080 ? 'avc1.640033' : 'avc1.640028';
    encoder.configure({
      codec: codecStr,
      width: w,
      height: h,
      bitrate: 12_000_000,
      framerate: fps
    });

    let stoppedEarly = false;
    if (abortSignal) {
      abortSignal.onStopEarly = () => {
        stoppedEarly = true;
      };
    }

    const frameIntervalMs = 1000 / fps;
    for (let i = 0; i < totalFrames; i++) {
      if (stoppedEarly) break;
      const frameStart = performance.now();
      renderer.render(getState());

      const timestampUs = Math.round((i * 1_000_000) / fps);
      const vf = new VideoFrame(stageCanvas, { timestamp: timestampUs });
      encoder.encode(vf, { keyFrame: i % 30 === 0 });
      vf.close();

      if (onProgress) {
        onProgress(Math.min(98, Math.round(((i + 1) / totalFrames) * 100)));
      }

      const spent = performance.now() - frameStart;
      const waitMs = Math.max(2, frameIntervalMs - spent);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    await encoder.flush();
    muxer.finalize();

    const buffer = muxer.target.buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    const stamp = formatTimestamp();
    triggerDownload(blob, `${filePrefix}_${w}x${h}_${stamp}.mp4`);
    if (onProgress) onProgress(100);
    return { ext: 'mp4', durationSec };
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
    exportVideoMP4
  };
})(window);
