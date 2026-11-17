/**
 * Laya App 商店截图生成器 - Gemini AI 文案生成引擎 + 1080×1920 PNG/MP4 导出器
 */
(function (global) {
  'use strict';

  const W = global.LayaDefaults.STAGE_WIDTH;
  const H = global.LayaDefaults.STAGE_HEIGHT;

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
   * 调用 Gemini API（支持 Vertex AI AQ.* Key、AI Studio Key 及可选 Google Apps Script 代理）
   */
  async function generateCardCopyWithGemini(options) {
    const { apiKey, gasProxyUrl, topicPrompt, targetCards, mediaRegistry, isTraditional } = options;
    const trimmedKey = String(apiKey || '').trim();
    const trimmedProxy = String(gasProxyUrl || '').trim();
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

    const requestBody = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json'
      }
    };

    // 1) 若配置了 Google Apps Script Web App URL，优先走 GAS 无服务器代理
    if (trimmedProxy) {
      const proxyResp = await fetch(trimmedProxy, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          apiKey: trimmedKey,
          payload: requestBody
        })
      });
      if (!proxyResp.ok) {
        throw new Error(`GAS 代理请求失败 (HTTP ${proxyResp.status})`);
      }
      const proxyJson = await proxyResp.json();
      if (proxyJson.error) {
        throw new Error(proxyJson.error.message || JSON.stringify(proxyJson.error));
      }
      return parseGeminiCardsJson(proxyJson, count);
    }

    if (!trimmedKey) {
      throw new Error('请先填写 Gemini API Key');
    }

    // 2) 直接请求官方端点（根据 AQ. 前缀智能排序 Vertex AI Express 与 Generative Language 端点）
    const encKey = encodeURIComponent(trimmedKey);
    const vertexEndpoints = [
      `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent?key=${encKey}`,
      `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.0-flash:generateContent?key=${encKey}`
    ];
    const studioEndpoints = [
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encKey}`
    ];

    const endpoints = trimmedKey.startsWith('AQ.')
      ? vertexEndpoints.concat(studioEndpoints)
      : studioEndpoints.concat(vertexEndpoints);

    let lastErr = null;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (data && data.error && data.error.message) || `HTTP ${res.status}`;
          lastErr = new Error(msg);
          continue;
        }
        const parsed = parseGeminiCardsJson(data, count);
        if (parsed && parsed.length > 0) {
          return parsed;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr || new Error('Gemini API 请求未返回有效文案');
  }

  function parseGeminiCardsJson(apiResponse, expectedCount) {
    const candidates = apiResponse && apiResponse.candidates;
    if (!candidates || !candidates.length) {
      throw new Error('模型未返回候选内容');
    }
    const parts = (candidates[0].content && candidates[0].content.parts) || [];
    const rawText = parts.map((p) => p.text || '').join('').trim();
    if (!rawText) {
      throw new Error('模型返回文本为空');
    }

    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const obj = JSON.parse(cleaned);
    const arr = Array.isArray(obj) ? obj : obj.cards || [];
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error('解析 JSON 卡片列表失败');
    }

    const normalized = [];
    for (let i = 0; i < expectedCount; i++) {
      const src = arr[i % arr.length] || {};
      normalized.push({
        overlayTitle: String(src.overlayTitle || '深夜连麦\n一秒沦陷的声音').replace(/\\n/g, '\n'),
        overlaySubtitle: String(src.overlaySubtitle || '这种音色真的顶不住'),
        footerTitle: String(src.footerTitle || String(src.overlayTitle || '').replace(/\n+/g, ' ').replace(/\*/g, '')),
        likes: String(src.likes || Math.floor(Math.random() * 2600 + 800))
      });
    }
    return normalized;
  }

  /**
   * 内置高质量本地靈感备选库（当离线或无网络时也可一键救急体验）
   */
  function generateLocalFallbackCopy(topicPrompt, count, isTraditional) {
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
        overlayTitle: conv(base.overlayTitle),
        overlaySubtitle: conv(base.overlaySubtitle),
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
   * 导出 1080×1920 高清 PNG 截图
   */
  function exportScreenshotPNG(stageCanvas, renderer, state) {
    return new Promise((resolve, reject) => {
      try {
        renderer.render(state, true);
        stageCanvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('生成 PNG 数据失败'));
            return;
          }
          const stamp = formatTimestamp();
          triggerDownload(blob, `Laya_Store_${W}x${H}_${stamp}.png`);
          resolve();
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 导出 1080×1920 高清 MP4 影片（支持原生 H.264 MediaRecorder + WebAudio 混音 + WebCodecs Mp4Muxer 兜底）
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
    const activeVideos = [];
    (state.feedModule.cards || []).forEach((c) => {
      const entry = mediaRegistry.cardMedia[c.id];
      if (entry && entry.type === 'video' && entry.el) {
        activeVideos.push(entry.el);
      }
    });

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
        triggerDownload(blob, `Laya_Store_${W}x${H}_${stamp}.${ext}`);
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
    const { stageCanvas, renderer, getState, durationSec, onProgress, abortSignal } = cfg;
    const Mp4Muxer = global.Mp4Muxer;
    const fps = 30;
    const totalFrames = Math.max(15, Math.round(durationSec * fps));

    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: W,
        height: H
      },
      fastStart: 'in-memory'
    });

    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error('VideoEncoder error:', e)
    });

    encoder.configure({
      codec: 'avc1.640028',
      width: W,
      height: H,
      bitrate: 10_000_000,
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
    triggerDownload(blob, `Laya_Store_${W}x${H}_${stamp}.mp4`);
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
    exportScreenshotPNG,
    exportVideoMP4
  };
})(window);
