/**
 * Laya 商店截图生成器 - 主应用控制器
 * 1. 编辑栏 100% 固定简体中文，画布内容支持一键简繁互转
 * 2. 自动持久化保存所有文字、排版、隐藏状态及上传的图片/MP4视频（IndexedDB），刷新或重开完全保留，仅点击「重置默认」清空
 */
(function (global) {
  'use strict';

  const state = global.LayaPersistence
    ? global.LayaPersistence.loadSavedState(global.LayaDefaults.createDefaultState())
    : global.LayaDefaults.createDefaultState();

  const mediaRegistry = {
    appIcon: null,
    storeLogo: null,
    floatingLogo: null,
    playStrip: null,
    userAvatar: null,
    customNavIcons: {},
    cardMedia: {},
    raw: global.LayaDefaults.createRawImageMap()
  };

  let renderer = null;
  let interaction = null;
  let zoomMode = 'fit';
  let currentExportAbort = null;
  let activeInlineHandler = null;
  let pendingDirectFileCallback = null;

  function persistState() {
    if (global.LayaPersistence) {
      global.LayaPersistence.scheduleSaveState(state);
    }
  }

  function persistMedia(slotKey, fileOrBlob, extraMeta) {
    if (global.LayaPersistence && fileOrBlob) {
      global.LayaPersistence.saveMediaBlob(slotKey, fileOrBlob, extraMeta);
    }
  }

  function removePersistedMedia(slotKey) {
    if (global.LayaPersistence && slotKey) {
      global.LayaPersistence.deleteMediaBlob(slotKey);
    }
  }

  async function restorePersistedMediaBlobs() {
    if (!global.LayaPersistence) return;
    const records = await global.LayaPersistence.loadAllMediaBlobs();
    if (!records || !records.length) return;

    for (const rec of records) {
      if (!rec || !rec.slotKey || !rec.blob) continue;
      const key = rec.slotKey;

      if (key === 'appIcon' || key === 'storeLogo' || key === 'floatingLogo' || key === 'playStrip' || key === 'userAvatar') {
        loadBlobAsImage(rec.blob, (img) => {
          mediaRegistry[key] = img;
        });
      } else if (key.startsWith('navIcon:')) {
        const navId = key.slice('navIcon:'.length);
        loadBlobAsImage(rec.blob, (img) => {
          mediaRegistry.customNavIcons[navId] = img;
          renderDynamicNavControls();
        });
      } else if (key.startsWith('cardMedia:')) {
        const cardId = key.slice('cardMedia:'.length);
        const card = (state.feedModule.cards || []).find((c) => c.id === cardId);
        if (card) {
          mountCardMediaBlob(card, rec.blob, rec.fileName || card.mediaName || '已保存媒体', false);
        }
      }
    }
  }

  function init() {
    const stageCanvas = document.getElementById('stageCanvas');
    const overlayCanvas = document.getElementById('overlayCanvas');

    renderer = new global.StageRenderer(stageCanvas, overlayCanvas, mediaRegistry);
    interaction = new global.StageInteraction({
      overlayCanvas,
      renderer,
      getState: () => state,
      onOffsetChange: (key, x, y) => {
        closeInlineEditor();
        if (!state.offsets[key]) state.offsets[key] = { x: 0, y: 0 };
        state.offsets[key].x = x;
        state.offsets[key].y = y;
        updateSelectedElementBar();
        persistState();
      },
      onSelectElement: (hit) => {
        if (!hit) closeInlineEditor();
        updateSelectedElementBar();
      },
      onToggleCardVideo: (cardId) => {
        toggleCardVideoPlayback(cardId);
      },
      onHideElement: (key, label) => {
        closeInlineEditor();
        hideElementByKey(key, label);
      },
      onDirectClickElement: (hit, clientX, clientY) => {
        handleDirectCanvasClick(hit, clientX, clientY);
      },
      onDropFileOnElement: (hit, file) => {
        handleDirectCanvasFileDrop(hit, file);
      }
    });

    bindInlineCanvasEditor();
    bindToolbarEvents();
    bindPanelAccordion();
    bindStaticControlInputs();
    syncStaticInputsFromState();
    syncStageTransparencyClass();
    syncPosterLangButtons();
    renderHiddenElementsManager();
    renderDynamicNavControls();
    renderDynamicFeedCards();
    updateExportModeHint();
    fitStageToViewport();

    // 异步恢复上次上传的所有图片与 MP4 视频
    restorePersistedMediaBlobs();

    window.addEventListener('resize', fitStageToViewport);
    window.addEventListener('beforeunload', () => {
      if (global.LayaPersistence) {
        global.LayaPersistence.saveStateNow(state);
      }
    });

    const tick = () => {
      renderer.render(state);
      renderer.renderOverlay(interaction.uiState);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function fitStageToViewport() {
    const wrap = document.getElementById('stageViewport');
    const shell = document.getElementById('phoneStageShell');
    const zoomLabel = document.getElementById('zoomPercentLabel');
    if (!wrap || !shell) return;

    const stageW = global.LayaDefaults.STAGE_WIDTH;
    const stageH = global.LayaDefaults.STAGE_HEIGHT;

    let scale;
    if (zoomMode === 'fit') {
      const availW = Math.max(320, wrap.clientWidth - 48);
      const availH = Math.max(260, wrap.clientHeight - 48);
      scale = Math.min(availW / stageW, availH / stageH, 0.92);
    } else {
      scale = Number(zoomMode) || 0.55;
    }

    const cssW = Math.round(stageW * scale);
    const cssH = Math.round(stageH * scale);
    shell.style.width = `${cssW}px`;
    shell.style.height = `${cssH}px`;
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    }
  }

  function syncStageTransparencyClass() {
    const shell = document.getElementById('phoneStageShell');
    const t = state.layout.canvasTheme;
    if (shell) {
      if (t === 'transparent' || t === 'full-transparent') {
        shell.classList.add('is-transparent');
      } else {
        shell.classList.remove('is-transparent');
      }
    }
    const topBtn = document.getElementById('btnToggleTransTop');
    if (topBtn) {
      if (t === 'transparent') {
        topBtn.textContent = '✨ 再点切全透明无框';
      } else if (t === 'full-transparent') {
        topBtn.textContent = '🌙 恢复深色背景';
      } else {
        topBtn.textContent = '🏁 一键透明背景';
      }
    }
    document.querySelectorAll('[data-theme-btn]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-theme-btn') === t);
    });
  }

  function syncPosterLangButtons() {
    const lang = state.posterLang || 'zh-CN';
    const topBtn = document.getElementById('btnTogglePosterLang');
    if (topBtn) {
      topBtn.textContent =
        lang === 'zh-TW' ? '🌐 画布：繁体（点此切简体）' : '🌐 画布：简体（点此切繁体）';
    }
    document.querySelectorAll('[data-lang-btn]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-lang-btn') === lang);
    });
  }

  function applyPosterLanguage(targetLang) {
    const toTrad = targetLang === 'zh-TW';
    if (global.LayaPosterLang) {
      global.LayaPosterLang.convertPosterStateLanguage(state, toTrad);
    }
    syncPosterLangButtons();
    syncStaticInputsFromState();
    renderDynamicNavControls();
    renderDynamicFeedCards();
    persistState();
    showToast(
      toTrad
        ? '🇭🇰 已将画布内容一键切换为【繁体中文】（编辑栏保持简体）'
        : '🇨🇳 已将画布内容一键切换为【简体中文】'
    );
  }

  // ===========================================================================
  // 全页面元素隐藏 / 删除 / 恢复系统
  // ===========================================================================
  function hideElementByKey(key, label) {
    if (!key) return;
    if (!state.hiddenElements) state.hiddenElements = {};
    state.hiddenElements[key] = label || key;
    if (interaction && interaction.uiState.selectedBox && interaction.uiState.selectedBox.key === key) {
      interaction.uiState.selectedBox = null;
    }
    updateSelectedElementBar();
    renderHiddenElementsManager();
    renderDynamicFeedCards();
    persistState();
    showToast(`🗑️ 已隐藏「${label || key}」，可在右侧随时恢复`);
  }

  function restoreElementByKey(key) {
    if (!state.hiddenElements || !state.hiddenElements[key]) return;
    const lbl = state.hiddenElements[key];
    delete state.hiddenElements[key];
    renderHiddenElementsManager();
    renderDynamicFeedCards();
    persistState();
    showToast(`👁️ 已恢复显示「${lbl}」`);
  }

  function toggleElementVisibility(key, label) {
    if (state.hiddenElements && state.hiddenElements[key]) {
      restoreElementByKey(key);
    } else {
      hideElementByKey(key, label);
    }
  }

  function renderHiddenElementsManager() {
    const wrap = document.getElementById('hiddenManagerBox');
    const list = document.getElementById('hiddenChipsList');
    if (!wrap || !list) return;

    const entries = Object.entries(state.hiddenElements || {});
    if (entries.length === 0) {
      wrap.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    wrap.classList.remove('hidden');
    list.innerHTML = '';
    entries.forEach(([key, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'restore-chip';
      btn.textContent = `↺ ${label}`;
      btn.title = '点击恢复显示此元素';
      btn.addEventListener('click', () => restoreElementByKey(key));
      list.appendChild(btn);
    });
  }

  // ===========================================================================
  // 顶部工具栏与全局按钮事件
  // ===========================================================================
  function bindToolbarEvents() {
    const stageW = global.LayaDefaults.STAGE_WIDTH;

    document.getElementById('btnZoomOut').addEventListener('click', () => {
      const shell = document.getElementById('phoneStageShell');
      const cur = shell.clientWidth / stageW;
      zoomMode = Math.max(0.22, +(cur - 0.06).toFixed(2));
      fitStageToViewport();
    });

    document.getElementById('btnZoomIn').addEventListener('click', () => {
      const shell = document.getElementById('phoneStageShell');
      const cur = shell.clientWidth / stageW;
      zoomMode = Math.min(1.0, +(cur + 0.06).toFixed(2));
      fitStageToViewport();
    });

    document.getElementById('btnZoomFit').addEventListener('click', () => {
      zoomMode = 'fit';
      fitStageToViewport();
    });

    const selDragScope = document.getElementById('selDragScope');
    selDragScope.addEventListener('change', () => {
      interaction.dragMode = selDragScope.value;
      interaction.uiState.selectedBox = null;
      updateSelectedElementBar();
    });

    const chkSnapGuides = document.getElementById('chkSnapGuides');
    chkSnapGuides.addEventListener('change', () => {
      interaction.enableSnap = chkSnapGuides.checked;
    });

    document.getElementById('btnResetSelectedOffset').addEventListener('click', () => {
      const sel = interaction.uiState.selectedBox;
      if (sel && state.offsets[sel.key]) {
        delete state.offsets[sel.key];
        interaction.uiState.selectedBox = null;
        updateSelectedElementBar();
        persistState();
        showToast(`已复位「${sel.label}」的位置`);
      }
    });

    document.getElementById('btnHideSelectedEl').addEventListener('click', () => {
      const sel = interaction.uiState.selectedBox;
      if (sel) {
        hideElementByKey(sel.key, sel.label);
      }
    });

    document.getElementById('btnRestoreAllHidden').addEventListener('click', () => {
      state.hiddenElements = {};
      renderHiddenElementsManager();
      renderDynamicFeedCards();
      persistState();
      showToast('已恢复显示全部隐藏的元素');
    });

    document.getElementById('btnResetAllOffsets').addEventListener('click', () => {
      state.offsets = {};
      interaction.uiState.selectedBox = null;
      updateSelectedElementBar();
      persistState();
      showToast('已重置所有元素的拖动偏移');
    });

    // 画布文字简体/繁体一键切换
    document.getElementById('btnTogglePosterLang').addEventListener('click', () => {
      const next = state.posterLang === 'zh-TW' ? 'zh-CN' : 'zh-TW';
      applyPosterLanguage(next);
    });

    document.querySelectorAll('[data-lang-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyPosterLanguage(btn.getAttribute('data-lang-btn'));
      });
    });

    // 透明背景一键切换
    const applyThemeMode = (nextTheme) => {
      state.layout.canvasTheme = nextTheme;
      syncStaticInputsFromState();
      syncStageTransparencyClass();
      persistState();
      if (nextTheme === 'transparent') {
        showToast('🏁 已切换为【透明外背景】，导出截图即为无黑底透明 PNG');
      } else if (nextTheme === 'full-transparent') {
        showToast('✨ 已切换为【全透明无黑框】，连卡片黑底也已全部透明化');
      } else {
        showToast('🌙 已切换回深色背景');
      }
    };

    document.getElementById('btnToggleTransTop').addEventListener('click', () => {
      const cur = state.layout.canvasTheme;
      if (cur === 'dark' || cur === 'light') applyThemeMode('transparent');
      else if (cur === 'transparent') applyThemeMode('full-transparent');
      else applyThemeMode('dark');
    });

    document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyThemeMode(btn.getAttribute('data-theme-btn'));
      });
    });

    const handleRandomStatus = () => {
      state.statusBar = global.LayaDefaults.randomizeStatusBar(state.statusBar);
      syncStaticInputsFromState();
      persistState();
      showToast(`🎲 已开启并随机组合状态栏（${state.statusBar.time} · 电量 ${state.statusBar.battery}%）`);
    };
    document.getElementById('btnRandomStatusTop').addEventListener('click', handleRandomStatus);
    document.getElementById('btnRandomStatusPanel').addEventListener('click', handleRandomStatus);

    document.getElementById('btnRandomUserProfile').addEventListener('click', () => {
      state.userModule = global.LayaDefaults.randomizeUserProfile(state.userModule);
      if (state.posterLang === 'zh-TW' && global.LayaPosterLang) {
        state.userModule.age = global.LayaPosterLang.convertString(state.userModule.age, true);
        state.userModule.region = global.LayaPosterLang.convertString(state.userModule.region, true);
        state.userModule.distance = global.LayaPosterLang.convertString(state.userModule.distance, true);
        state.userModule.bioTag = global.LayaPosterLang.convertString(state.userModule.bioTag, true);
      }
      syncStaticInputsFromState();
      persistState();
      showToast(`🎲 已随机生成个人资料（${state.userModule.age} · ${state.userModule.region}）`);
    });

    document.getElementById('btnAiCopyTop').addEventListener('click', () => {
      openAccordionSection('sec-feed', true);
      handleGenerateAICopy();
    });
    document.getElementById('btnAiCopyPanel').addEventListener('click', handleGenerateAICopy);

    document.getElementById('btnLocalInspire').addEventListener('click', () => {
      const targetCards = getTargetCardsForAI();
      const generated = global.LayaAIExporter.generateLocalFallbackCopy(
        state.aiConfig.topicPrompt,
        targetCards.length,
        state.posterLang === 'zh-TW'
      );
      applyGeneratedCopyToCards(targetCards, generated);
      persistState();
      showToast('已填入精选爆款短视频文案，可继续手动微调');
    });

    document.getElementById('btnExportPNG').addEventListener('click', async () => {
      try {
        const stageCanvas = document.getElementById('stageCanvas');
        await global.LayaAIExporter.exportScreenshotPNG(stageCanvas, renderer, state);
        const isTrans =
          state.layout.canvasTheme === 'transparent' || state.layout.canvasTheme === 'full-transparent';
        showToast(
          isTrans
            ? '✅ 已导出 1920×1080 真透明背景 PNG（可直接拖入剪映/PS叠加）'
            : '✅ 已导出 1920×1080 高清横屏 PNG 截图'
        );
      } catch (err) {
        showToast(`导出截图失败：${err.message}`, true);
      }
    });

    document.getElementById('btnExportMP4').addEventListener('click', handleExportMP4);

    document.getElementById('btnStopExportEarly').addEventListener('click', () => {
      if (currentExportAbort && typeof currentExportAbort.onStopEarly === 'function') {
        currentExportAbort.onStopEarly();
      }
    });

    // 仅点击「重置默认」确认后，才彻底清空本地保存状态与上传文件缓存
    document.getElementById('btnResetDefault').addEventListener('click', async () => {
      if (!window.confirm('确定要清空所有已保存的修改、上传的图片视频，恢复为初始默认状态吗？')) {
        return;
      }
      closeInlineEditor();
      cleanupAllUploadedMedia();
      if (global.LayaPersistence) {
        await global.LayaPersistence.clearAllSavedData();
      }
      const fresh = global.LayaDefaults.createDefaultState();
      Object.keys(state).forEach((k) => delete state[k]);
      Object.keys(fresh).forEach((k) => {
        state[k] = fresh[k];
      });
      interaction.uiState.selectedBox = null;
      syncStaticInputsFromState();
      syncStageTransparencyClass();
      syncPosterLangButtons();
      renderHiddenElementsManager();
      renderDynamicNavControls();
      renderDynamicFeedCards();
      updateSelectedElementBar();
      updateExportModeHint();
      showToast('已清空缓存并恢复全部默认设置');
    });
  }

  function updateSelectedElementBar() {
    const bar = document.getElementById('selectedGizmoBar');
    const txt = document.getElementById('selectedGizmoName');
    const sel = interaction && interaction.uiState.selectedBox;
    if (!sel) {
      bar.classList.add('hidden');
      return;
    }
    const off = state.offsets[sel.key] || { x: 0, y: 0 };
    bar.classList.remove('hidden');
    txt.textContent = `已选中：${sel.label} (${off.x >= 0 ? '+' : ''}${off.x}, ${
      off.y >= 0 ? '+' : ''
    }${off.y})`;
  }

  // ===========================================================================
  // 折叠面板丝滑弹簧切换与吸顶快速跳转
  // ===========================================================================
  function bindPanelAccordion() {
    document.querySelectorAll('.acc-item').forEach((item) => {
      const body = item.querySelector(':scope > .acc-body');
      if (body) {
        const collapse = document.createElement('div');
        collapse.className = 'acc-collapse';
        const inner = document.createElement('div');
        inner.className = 'acc-collapse-inner';
        item.insertBefore(collapse, body);
        collapse.appendChild(inner);
        inner.appendChild(body);
      }
    });

    document.querySelectorAll('.acc-header').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.acc-item');
        item.classList.toggle('open');
      });
    });

    document.querySelectorAll('[data-jump-sec]').forEach((jumpBtn) => {
      jumpBtn.addEventListener('click', () => {
        const targetId = jumpBtn.getAttribute('data-jump-sec');
        openAccordionSection(targetId, true);
      });
    });
  }

  function openAccordionSection(id, flash) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('open');
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
      if (flash) {
        el.classList.remove('flash-focus');
        void el.offsetWidth;
        el.classList.add('flash-focus');
        setTimeout(() => el.classList.remove('flash-focus'), 1100);
      }
    }
  }

  // ===========================================================================
  // 双向数据绑定与三处文字百分百实时互相同步
  // ===========================================================================
  function bindStaticControlInputs() {
    document.querySelectorAll('[data-bind]').forEach((el) => {
      const path = el.getAttribute('data-bind');
      const evtName = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evtName, () => {
        let val;
        if (el.type === 'checkbox') {
          val = el.checked;
        } else if (el.type === 'range' || el.type === 'number') {
          val = Number(el.value);
          const badge = document.querySelector(`[data-val-for="${path}"]`);
          if (badge) badge.textContent = val;
        } else {
          val = el.value;
        }
        setByPath(state, path, val);

        if (path === 'layout.canvasTheme') {
          syncStageTransparencyClass();
        }

        if (path === 'userModule.searchQuery' || path === 'userModule.userId') {
          const cleanText = String(val).replace(/^ID\s*[:：]\s*/i, '');
          syncEveryIdEverywhere(cleanText, el);
        } else if (path === 'steps.step3') {
          const strVal = String(val);
          let m = strVal.match(/^(.*?(?:搜索|搜寻|\u641c\u5c0b)\s*)(.*)$/);
          if (m) {
            state.steps.step3Prefix = m[1];
            syncEveryIdEverywhere(m[2], el);
          } else {
            m = strVal.match(/^(\d+\s*[、.．:：-]\s*)(.*)$/);
            if (m) {
              state.steps.step3Prefix = m[1];
              syncEveryIdEverywhere(m[2], el);
            } else {
              state.steps.step3Prefix = '';
              syncEveryIdEverywhere(strVal, el);
            }
          }
        }

        persistState();
      });
    });

    const inpGlobalId = document.getElementById('inpGlobalId');
    if (inpGlobalId) {
      inpGlobalId.addEventListener('input', () => {
        const cleanText = String(inpGlobalId.value).replace(/^ID\s*[:：]\s*/i, '');
        syncEveryIdEverywhere(cleanText, inpGlobalId);
        persistState();
      });
    }

    const handlePlayLogoUpload = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      saveAndApplyImageSlot('appIcon', file, 'play_icon', '🖼️ 已替换并保存应用主 Logo');
      e.target.value = '';
    };
    document.getElementById('filePlayIcon').addEventListener('change', handlePlayLogoUpload);
    document.getElementById('filePlayIconTop').addEventListener('change', handlePlayLogoUpload);

    document.getElementById('btnResetPlayIcon').addEventListener('click', () => {
      mediaRegistry.appIcon = null;
      removePersistedMedia('appIcon');
      showToast('已恢复默认 Laya Logo');
    });

    document.getElementById('fileStoreLogo').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      saveAndApplyImageSlot('storeLogo', file, 'play_store_logo', '已替换并保存商店左上小标 Logo');
      e.target.value = '';
    });

    document.getElementById('fileFloatingLogo').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      saveAndApplyImageSlot(
        'floatingLogo',
        file,
        'floating_brand_logo',
        '✨ 已添加独立浮动 Logo，可在画布自由拖动'
      );
      e.target.value = '';
    });

    document.getElementById('btnClearAllLogos').addEventListener('click', () => {
      mediaRegistry.appIcon = null;
      mediaRegistry.storeLogo = null;
      mediaRegistry.floatingLogo = null;
      removePersistedMedia('appIcon');
      removePersistedMedia('storeLogo');
      removePersistedMedia('floatingLogo');
      showToast('已恢复全部默认 Logo');
    });

    document.getElementById('fileUserAvatar').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      saveAndApplyImageSlot(
        'userAvatar',
        file,
        'user_avatar',
        '👤 已更新并保存头像（下方视频卡片头像已同步！）'
      );
      e.target.value = '';
    });

    document.getElementById('btnResetUserAvatar').addEventListener('click', () => {
      mediaRegistry.userAvatar = null;
      removePersistedMedia('userAvatar');
      showToast('已恢复默认用户头像');
    });

    document.getElementById('fileTrophyIcon').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      loadBlobAsImage(file, (img) => {
        mediaRegistry.customNavIcons['top_trophy'] = img;
        persistMedia('navIcon:top_trophy', file);
        showToast('已替换并保存奖杯图标');
      });
      e.target.value = '';
    });

    document.getElementById('fileTopSearchIcon').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      loadBlobAsImage(file, (img) => {
        mediaRegistry.customNavIcons['top_search'] = img;
        persistMedia('navIcon:top_search', file);
        showToast('已替换并保存搜索图标');
      });
      e.target.value = '';
    });

    document.getElementById('btnResetNavRightIcons').addEventListener('click', () => {
      delete mediaRegistry.customNavIcons['top_trophy'];
      delete mediaRegistry.customNavIcons['top_search'];
      removePersistedMedia('navIcon:top_trophy');
      removePersistedMedia('navIcon:top_search');
      showToast('已恢复默认奖杯与搜索图标');
    });

    document.getElementById('btnAddFeedCard').addEventListener('click', () => {
      const nextIdx = state.feedModule.cards.length + 1;
      const isTrad = state.posterLang === 'zh-TW';
      const conv = (s) =>
        isTrad && global.LayaPosterLang ? global.LayaPosterLang.convertString(s, true) : s;
      const newCard = {
        id: `card_${Date.now()}`,
        overlayTitle: conv(`热门语音话题\n第 ${nextIdx} 弹`),
        overlaySubtitle: conv('这句话真的戳中无数人'),
        footerTitle: conv(`热门语音话题精选 #${nextIdx}`),
        likes: String(Math.floor(Math.random() * 2000 + 600)),
        mediaType: 'default',
        defaultVariant: nextIdx % 2 === 1 ? 'boy' : 'girl',
        mediaName: '原图封面',
        showPlayBadge: true
      };
      state.feedModule.cards.push(newCard);
      renderDynamicFeedCards();
      persistState();
      showToast(`已新增卡片 ${nextIdx}`);
    });
  }

  function saveAndApplyImageSlot(slotKey, file, unhideKey, msg) {
    loadBlobAsImage(file, (img) => {
      mediaRegistry[slotKey] = img;
      persistMedia(slotKey, file);
      if (unhideKey && state.hiddenElements) {
        delete state.hiddenElements[unhideKey];
        renderHiddenElementsManager();
        persistState();
      }
      if (msg) showToast(msg);
    });
  }

  function syncEveryIdEverywhere(newText, sourceEl) {
    state.userModule.searchQuery = newText;
    state.userModule.userId = newText;

    if (sourceEl !== document.querySelector('[data-bind="steps.step3"]')) {
      const defaultPref = '3、搜索 ';
      const prefix =
        state.steps.step3Prefix !== undefined ? state.steps.step3Prefix : defaultPref;
      state.steps.step3 = `${prefix}${newText}`;
    }

    const qInput = document.querySelector('[data-bind="userModule.searchQuery"]');
    const idInput = document.querySelector('[data-bind="userModule.userId"]');
    const s3Input = document.querySelector('[data-bind="steps.step3"]');
    const gInput = document.getElementById('inpGlobalId');

    if (qInput && qInput !== sourceEl) qInput.value = newText;
    if (idInput && idInput !== sourceEl) idInput.value = newText;
    if (s3Input && s3Input !== sourceEl) s3Input.value = state.steps.step3;
    if (gInput && gInput !== sourceEl) gInput.value = newText;
  }

  function syncStaticInputsFromState() {
    document.querySelectorAll('[data-bind]').forEach((el) => {
      const path = el.getAttribute('data-bind');
      const val = getByPath(state, path);
      if (el.type === 'checkbox') {
        el.checked = Boolean(val);
      } else {
        el.value = val !== undefined && val !== null ? val : '';
        const badge = document.querySelector(`[data-val-for="${path}"]`);
        if (badge) badge.textContent = el.value;
      }
    });
    const gInput = document.getElementById('inpGlobalId');
    if (gInput) gInput.value = state.userModule.searchQuery || '';
  }

  // ===========================================================================
  // 动态渲染面板：模块 2（100% 简体中文编辑栏）
  // ===========================================================================
  function renderDynamicNavControls() {
    const topContainer = document.getElementById('topTabsEditorList');
    topContainer.innerHTML = '';

    state.navModule.topTabs.forEach((label, idx) => {
      const row = document.createElement('div');
      row.className = 'inline-item-row';
      const isActive = idx === state.navModule.activeTopIndex;
      const hidKey = `top_tab_${idx}`;
      const isHid = Boolean(state.hiddenElements && state.hiddenElements[hidKey]);

      row.innerHTML = `
        <button type="button" class="pill-radio ${isActive ? 'active' : ''}">
          ${isActive ? '★ 高亮' : '设高亮'}
        </button>
        <input type="text" class="ctrl-input" value="${escapeHtml(label)}" placeholder="标签文字" />
        <button type="button" class="mini-clear-btn" title="${isHid ? '恢复显示' : '隐藏此标签'}">
          ${isHid ? '显示' : '隐藏'}
        </button>
      `;

      row.querySelector('.pill-radio').addEventListener('click', () => {
        state.navModule.activeTopIndex = idx;
        renderDynamicNavControls();
        persistState();
      });

      const inp = row.querySelector('input');
      inp.addEventListener('input', () => {
        state.navModule.topTabs[idx] = inp.value;
        persistState();
      });

      row.querySelector('.mini-clear-btn').addEventListener('click', () => {
        toggleElementVisibility(hidKey, `顶部标签：${label}`);
        renderDynamicNavControls();
      });

      topContainer.appendChild(row);
    });

    const botContainer = document.getElementById('bottomNavEditorList');
    botContainer.innerHTML = '';

    state.navModule.bottomTabs.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'inline-item-row nav-bot-row';
      const isActive = idx === state.navModule.activeBottomIndex;
      const hasCustom = Boolean(mediaRegistry.customNavIcons[item.id]);
      const hidKey = `bot_nav_${idx}`;
      const isHid = Boolean(state.hiddenElements && state.hiddenElements[hidKey]);

      row.innerHTML = `
        <button type="button" class="pill-radio ${isActive ? 'active' : ''}">
          ${isActive ? '★ 高亮' : '设高亮'}
        </button>
        <input type="text" class="ctrl-input" value="${escapeHtml(item.label)}" />
        <label class="mini-upload-btn" title="上传自定义图标">
          图标
          <input type="file" accept="image/*" hidden />
        </label>
        ${hasCustom ? '<button type="button" class="mini-clear-btn" data-act="clrIcon" title="恢复内置图标">×</button>' : ''}
        <button type="button" class="mini-clear-btn" data-act="toggleVis" title="${isHid ? '恢复显示' : '隐藏此导航'}">
          ${isHid ? '显示' : '隐藏'}
        </button>
      `;

      row.querySelector('.pill-radio').addEventListener('click', () => {
        state.navModule.activeBottomIndex = idx;
        renderDynamicNavControls();
        persistState();
      });

      const txtInp = row.querySelector('.ctrl-input');
      txtInp.addEventListener('input', () => {
        item.label = txtInp.value;
        persistState();
      });

      const fileInp = row.querySelector('input[type="file"]');
      fileInp.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        loadBlobAsImage(f, (img) => {
          mediaRegistry.customNavIcons[item.id] = img;
          persistMedia(`navIcon:${item.id}`, f);
          renderDynamicNavControls();
          showToast(`已更新并保存「${item.label}」导航图标`);
        });
      });

      const clrIconBtn = row.querySelector('[data-act="clrIcon"]');
      if (clrIconBtn) {
        clrIconBtn.addEventListener('click', () => {
          delete mediaRegistry.customNavIcons[item.id];
          removePersistedMedia(`navIcon:${item.id}`);
          renderDynamicNavControls();
        });
      }

      row.querySelector('[data-act="toggleVis"]').addEventListener('click', () => {
        toggleElementVisibility(hidKey, `底部导航：${item.label}`);
        renderDynamicNavControls();
      });

      botContainer.appendChild(row);
    });
  }

  // ===========================================================================
  // 动态渲染面板：模块 4（100% 简体中文编辑栏）
  // ===========================================================================
  function renderDynamicFeedCards() {
    const aiTargetSelect = document.getElementById('selAiTarget');
    if (aiTargetSelect) {
      const prev = state.aiConfig.targetCard || 'all';
      aiTargetSelect.innerHTML = '<option value="all">全部视频卡片</option>';
      state.feedModule.cards.forEach((c, i) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `仅卡片 ${i + 1}`;
        aiTargetSelect.appendChild(opt);
      });
      aiTargetSelect.value = state.feedModule.cards.some((c) => c.id === prev) ? prev : 'all';
      state.aiConfig.targetCard = aiTargetSelect.value;
    }

    const container = document.getElementById('feedCardsEditorList');
    container.innerHTML = '';

    state.feedModule.cards.forEach((card, idx) => {
      const entry = mediaRegistry.cardMedia[card.id];
      const isVideo = entry && entry.type === 'video';
      const isImage = entry && entry.type === 'image';
      const hid = state.hiddenElements || {};

      const subParts = [
        { key: `card_badge_${card.id}`, name: '▶ 播放标', full: `卡片 ${idx + 1} 播放角标` },
        { key: `card_title_${card.id}`, name: '🔤 大标题', full: `卡片 ${idx + 1} 标题` },
        { key: `card_sub_${card.id}`, name: '💬 字幕', full: `卡片 ${idx + 1} 字幕` },
        { key: `card_ft_${card.id}`, name: '📝 底栏标题', full: `卡片 ${idx + 1} 底部标题` },
        { key: `card_author_${card.id}`, name: '👤 同步头像昵称', full: `卡片 ${idx + 1} 同步头像昵称` },
        { key: `card_likes_${card.id}`, name: '♡ 点赞数', full: `卡片 ${idx + 1} 点赞数` }
      ];

      const chipsHtml = subParts
        .map((sp) => {
          const isHidden = Boolean(hid[sp.key]);
          return `<button type="button" class="el-vis-chip ${isHidden ? 'is-off' : ''}" data-vis-key="${
            sp.key
          }" data-vis-full="${escapeHtml(sp.full)}" title="点击切换显示/隐藏此卡片元素">${
            isHidden ? '🚫 ' : '✓ '
          }${sp.name}</button>`;
        })
        .join('');

      const box = document.createElement('div');
      box.className = 'feed-card-editor';

      box.innerHTML = `
        <div class="feed-card-editor-head">
          <span class="card-badge">卡片 ${idx + 1}（${idx % 2 === 0 ? '左列' : '右列'}）</span>
          <div class="card-head-actions">
            <span class="media-type-pill ${isVideo ? 'is-video' : ''}">
              ${isVideo ? '🎬 MP4 视频' : isImage ? '🖼️ 自定义图片' : '🎨 原图封面'}
            </span>
            <button type="button" class="btn-icon-danger" data-act="hideCard" title="隐藏整张卡片">隐藏卡片</button>
            ${
              state.feedModule.cards.length > 1
                ? '<button type="button" class="btn-icon-danger" data-act="del" title="彻底移除此卡片">删除</button>'
                : ''
            }
          </div>
        </div>

        <div class="field-group">
          <label class="field-label">卡片内元素显示/隐藏（点击即可隐藏或恢复任意元素）</label>
          <div class="el-vis-chip-wrap">${chipsHtml}</div>
        </div>

        <div class="upload-bar-row">
          <label class="btn-purple-outline full-upload-label">
            📁 上传视频/图片
            <input type="file" accept="video/mp4,video/webm,video/quicktime,image/*" hidden data-act="upload" />
          </label>
          ${
            entry
              ? '<button type="button" class="btn-dark-sm" data-act="clearMedia">恢复原图</button>'
              : ''
          }
        </div>

        ${
          isVideo
            ? `
          <div class="video-mini-controls">
            <button type="button" class="btn-dark-sm" data-act="playPause">
              ${entry.el.paused ? '▶ 播放视频' : '⏸ 暂停视频'}
            </button>
            <button type="button" class="btn-dark-sm" data-act="muteToggle">
              ${entry.el.muted ? '🔇 已静音' : '🔊 原声开启'}
            </button>
            <span class="video-file-hint" title="${escapeHtml(card.mediaName)}">${escapeHtml(
                card.mediaName
              )}</span>
          </div>
        `
            : ''
        }

        <div class="field-group">
          <label class="field-label">画面标题大字（白字黑边，支持换行；可用 *词* 标重点色）</label>
          <textarea class="ctrl-textarea" rows="2" data-field="overlayTitle">${escapeHtml(
            card.overlayTitle
          )}</textarea>
        </div>

        <div class="field-group">
          <label class="field-label">画面下方字幕</label>
          <input type="text" class="ctrl-input" data-field="overlaySubtitle" value="${escapeHtml(
            card.overlaySubtitle
          )}" />
        </div>

        <div class="grid-2-col">
          <div class="field-group">
            <label class="field-label">卡片底部标题摘要</label>
            <input type="text" class="ctrl-input" data-field="footerTitle" value="${escapeHtml(
              card.footerTitle || ''
            )}" />
          </div>
          <div class="field-group">
            <label class="field-label">♡ 点赞数</label>
            <input type="text" class="ctrl-input" data-field="likes" value="${escapeHtml(card.likes)}" />
          </div>
        </div>
      `;

      box.querySelectorAll('[data-vis-key]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const k = chip.getAttribute('data-vis-key');
          const full = chip.getAttribute('data-vis-full');
          toggleElementVisibility(k, full);
        });
      });

      box.querySelectorAll('[data-field]').forEach((inp) => {
        const field = inp.getAttribute('data-field');
        inp.addEventListener('input', () => {
          card[field] = inp.value;
          persistState();
        });
      });

      const uploadInp = box.querySelector('[data-act="upload"]');
      uploadInp.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        handleCardMediaUpload(card, file);
        e.target.value = '';
      });

      const clearBtn = box.querySelector('[data-act="clearMedia"]');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          disposeCardMedia(card.id);
          removePersistedMedia(`cardMedia:${card.id}`);
          card.mediaType = 'default';
          card.mediaName = '原图封面';
          renderDynamicFeedCards();
          updateExportModeHint();
          persistState();
        });
      }

      const playPauseBtn = box.querySelector('[data-act="playPause"]');
      if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
          toggleCardVideoPlayback(card.id);
        });
      }

      const muteBtn = box.querySelector('[data-act="muteToggle"]');
      if (muteBtn && isVideo) {
        muteBtn.addEventListener('click', () => {
          entry.el.muted = !entry.el.muted;
          renderDynamicFeedCards();
        });
      }

      box.querySelector('[data-act="hideCard"]').addEventListener('click', () => {
        toggleElementVisibility(`feed_card_${card.id}`, `视频卡片 ${idx + 1}`);
      });

      const delBtn = box.querySelector('[data-act="del"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          disposeCardMedia(card.id);
          removePersistedMedia(`cardMedia:${card.id}`);
          state.feedModule.cards.splice(idx, 1);
          renderDynamicFeedCards();
          updateExportModeHint();
          persistState();
        });
      }

      container.appendChild(box);
    });
  }

  function mountCardMediaBlob(card, blobOrFile, displayName, shouldSaveToDB) {
    disposeCardMedia(card.id);
    const url = URL.createObjectURL(blobOrFile);
    const mime = blobOrFile.type || '';

    if (mime.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = url;
      video.playsInline = true;
      video.loop = true;
      video.muted = false;
      video.preload = 'auto';

      video.addEventListener('loadeddata', () => {
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
        renderDynamicFeedCards();
        updateExportModeHint();
      });

      video.addEventListener('play', () => renderDynamicFeedCards());
      video.addEventListener('pause', () => renderDynamicFeedCards());

      mediaRegistry.cardMedia[card.id] = { type: 'video', el: video, url };
      card.mediaType = 'video';
      card.mediaName = displayName;
      if (shouldSaveToDB) {
        persistMedia(`cardMedia:${card.id}`, blobOrFile, { fileName: displayName });
        persistState();
        showToast(`🎬 已载入并自动保存视频「${displayName}」`);
      }
    } else {
      const img = new Image();
      img.onload = () => {
        mediaRegistry.cardMedia[card.id] = { type: 'image', el: img, url };
        card.mediaType = 'image';
        card.mediaName = displayName;
        renderDynamicFeedCards();
        updateExportModeHint();
        if (shouldSaveToDB) {
          persistMedia(`cardMedia:${card.id}`, blobOrFile, { fileName: displayName });
          persistState();
          showToast(`🖼️ 已载入并自动保存图片「${displayName}」`);
        }
      };
      img.src = url;
    }
  }

  function handleCardMediaUpload(card, file) {
    mountCardMediaBlob(card, file, file.name || '上传媒体', true);
  }

  function toggleCardVideoPlayback(cardId) {
    const entry = mediaRegistry.cardMedia[cardId];
    if (!entry || entry.type !== 'video' || !entry.el) return;
    const v = entry.el;
    if (v.paused) {
      v.play().catch(() => {
        v.muted = true;
        v.play().catch(() => {});
      });
    } else {
      v.pause();
    }
    renderDynamicFeedCards();
  }

  function disposeCardMedia(cardId) {
    const entry = mediaRegistry.cardMedia[cardId];
    if (!entry) return;
    if (entry.type === 'video' && entry.el) {
      entry.el.pause();
      entry.el.removeAttribute('src');
      entry.el.load();
    }
    if (entry.url) {
      URL.revokeObjectURL(entry.url);
    }
    delete mediaRegistry.cardMedia[cardId];
  }

  function cleanupAllUploadedMedia() {
    mediaRegistry.appIcon = null;
    mediaRegistry.storeLogo = null;
    mediaRegistry.floatingLogo = null;
    mediaRegistry.playStrip = null;
    mediaRegistry.userAvatar = null;
    mediaRegistry.customNavIcons = {};
    Object.keys(mediaRegistry.cardMedia).forEach((cid) => disposeCardMedia(cid));
  }

  // ===========================================================================
  // 画布直接点击编辑文字 ＆ 直接点击上传图片/视频 ＆ 拖拽文件直传
  // ===========================================================================
  function bindInlineCanvasEditor() {
    const picker = document.getElementById('directCanvasFilePicker');
    if (picker) {
      picker.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file && typeof pendingDirectFileCallback === 'function') {
          pendingDirectFileCallback(file);
        }
        pendingDirectFileCallback = null;
        picker.value = '';
      });
    }

    const editor = document.getElementById('canvasInlineEditor');
    const inp = document.getElementById('inlineEditorInput');
    const area = document.getElementById('inlineEditorTextarea');
    const closeBtn = document.getElementById('btnCloseInlineEditor');

    if (closeBtn) {
      closeBtn.addEventListener('click', closeInlineEditor);
    }

    const onTextChange = (val) => {
      if (typeof activeInlineHandler === 'function') {
        activeInlineHandler(val);
        persistState();
      }
    };

    if (inp) {
      inp.addEventListener('input', () => onTextChange(inp.value));
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          closeInlineEditor();
        }
      });
    }

    if (area) {
      area.addEventListener('input', () => onTextChange(area.value));
      area.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeInlineEditor();
        }
      });
    }

    document.addEventListener('pointerdown', (e) => {
      if (!editor || editor.classList.contains('hidden')) return;
      if (editor.contains(e.target) || e.target.id === 'overlayCanvas') return;
      closeInlineEditor();
    });
  }

  function closeInlineEditor() {
    const editor = document.getElementById('canvasInlineEditor');
    if (editor) editor.classList.add('hidden');
    activeInlineHandler = null;
  }

  function triggerDirectFileUpload(accept, callback) {
    const picker = document.getElementById('directCanvasFilePicker');
    if (!picker) return;
    picker.accept = accept || 'image/*';
    pendingDirectFileCallback = callback;
    picker.click();
  }

  function openInlineEditorPopover(cfg) {
    const { title, initialValue, multiline, clientX, clientY, onInput, extraButtons } = cfg;
    const editor = document.getElementById('canvasInlineEditor');
    const titleEl = document.getElementById('inlineEditorTitle');
    const inp = document.getElementById('inlineEditorInput');
    const area = document.getElementById('inlineEditorTextarea');
    const extraWrap = document.getElementById('inlineEditorExtraActions');
    if (!editor) return;

    titleEl.textContent = `✏️ ${title}`;
    activeInlineHandler = onInput || null;

    if (initialValue === null || initialValue === undefined) {
      inp.classList.add('hidden');
      area.classList.add('hidden');
    } else if (multiline) {
      inp.classList.add('hidden');
      area.classList.remove('hidden');
      area.value = initialValue;
    } else {
      area.classList.add('hidden');
      inp.classList.remove('hidden');
      inp.value = initialValue;
    }

    extraWrap.innerHTML = '';
    (extraButtons || []).forEach((bCfg) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = bCfg.primary ? 'btn-purple-outline' : 'btn-dark-sm';
      btn.style.fontSize = '12px';
      btn.style.padding = '5px 10px';
      btn.textContent = bCfg.text;
      btn.addEventListener('click', () => bCfg.onClick());
      extraWrap.appendChild(btn);
    });

    editor.classList.remove('hidden');
    const popW = 300;
    const popH = editor.offsetHeight || 130;
    const left = Math.max(12, Math.min(window.innerWidth - popW - 16, clientX - popW / 2));
    const top = Math.max(68, Math.min(window.innerHeight - popH - 16, clientY + 18));
    editor.style.left = `${left}px`;
    editor.style.top = `${top}px`;

    setTimeout(() => {
      if (initialValue !== null && initialValue !== undefined) {
        const targetInput = multiline ? area : inp;
        targetInput.focus();
        targetInput.select();
      }
    }, 10);
  }

  function applySyncedStep3FromText(strVal) {
    state.steps.step3 = strVal;
    let m = strVal.match(/^(.*?(?:搜索|搜寻|\u641c\u5c0b)\s*)(.*)$/);
    if (m) {
      state.steps.step3Prefix = m[1];
      syncEveryIdEverywhere(m[2], null);
    } else {
      m = strVal.match(/^(\d+\s*[、.．:：-]\s*)(.*)$/);
      if (m) {
        state.steps.step3Prefix = m[1];
        syncEveryIdEverywhere(m[2], null);
      } else {
        state.steps.step3Prefix = '';
        syncEveryIdEverywhere(strVal, null);
      }
    }
  }

  function handleDirectCanvasClick(hit, clientX, clientY) {
    if (!hit || hit.kind === 'module') {
      closeInlineEditor();
      return;
    }
    const key = hit.key;

    if (key === 'play_icon') {
      closeInlineEditor();
      triggerDirectFileUpload('image/*', (file) => {
        saveAndApplyImageSlot('appIcon', file, 'play_icon', '🖼️ 已更新并保存应用主 Logo');
      });
      return;
    }

    if (key === 'play_store_logo') {
      closeInlineEditor();
      triggerDirectFileUpload('image/*', (file) => {
        saveAndApplyImageSlot('storeLogo', file, 'play_store_logo', '🖼️ 已更新并保存商店左上小标 Logo');
      });
      return;
    }

    if (key === 'floating_brand_logo') {
      closeInlineEditor();
      triggerDirectFileUpload('image/*', (file) => {
        saveAndApplyImageSlot('floatingLogo', file, 'floating_brand_logo', '🖼️ 已替换并保存独立浮动 Logo');
      });
      return;
    }

    if (key === 'play_strip') {
      closeInlineEditor();
      triggerDirectFileUpload('image/*', (file) => {
        saveAndApplyImageSlot('playStrip', file, 'play_strip', '🖼️ 已替换并保存商店底部预览海报');
      });
      return;
    }

    if (key === 'nav_top_trophy') {
      closeInlineEditor();
      triggerDirectFileUpload('image/*', (file) => {
        loadBlobAsImage(file, (img) => {
          mediaRegistry.customNavIcons['top_trophy'] = img;
          persistMedia('navIcon:top_trophy', file);
          showToast('🏆 已替换并保存奖杯图标');
        });
      });
      return;
    }

    if (key === 'nav_top_search') {
      closeInlineEditor();
      triggerDirectFileUpload('image/*', (file) => {
        loadBlobAsImage(file, (img) => {
          mediaRegistry.customNavIcons['top_search'] = img;
          persistMedia('navIcon:top_search', file);
          showToast('🔍 已替换并保存搜索放大镜图标');
        });
      });
      return;
    }

    if (key === 'user_avatar') {
      closeInlineEditor();
      triggerDirectFileUpload('image/*', (file) => {
        saveAndApplyImageSlot('userAvatar', file, 'user_avatar', '👤 已更新并保存个人头像（下方卡片已同步）');
      });
      return;
    }

    if (key.startsWith('feed_card_')) {
      const cardId = key.replace('feed_card_', '');
      const card = state.feedModule.cards.find((c) => c.id === cardId);
      if (!card) return;
      const entry = mediaRegistry.cardMedia[cardId];

      if (!entry || entry.type !== 'video') {
        closeInlineEditor();
        triggerDirectFileUpload('video/mp4,video/webm,video/quicktime,image/*', (file) => {
          handleCardMediaUpload(card, file);
        });
      } else {
        openInlineEditorPopover({
          title: `${hit.label} 媒体控制`,
          initialValue: null,
          clientX,
          clientY,
          extraButtons: [
            {
              text: '📁 重新上传视频/图片',
              primary: true,
              onClick: () => {
                closeInlineEditor();
                triggerDirectFileUpload('video/mp4,video/webm,video/quicktime,image/*', (file) => {
                  handleCardMediaUpload(card, file);
                });
              }
            },
            {
              text: entry.el.paused ? '▶ 播放' : '⏸ 暂停',
              onClick: () => {
                toggleCardVideoPlayback(cardId);
                closeInlineEditor();
              }
            },
            {
              text: entry.el.muted ? '🔊 开启原声' : '🔇 静音',
              onClick: () => {
                entry.el.muted = !entry.el.muted;
                renderDynamicFeedCards();
                closeInlineEditor();
              }
            }
          ]
        });
      }
      return;
    }

    const staticFieldMap = {
      step_title_1: { path: 'steps.step1', title: '步骤 1 标题' },
      step_title_2: { path: 'steps.step2', title: '步骤 2 标题' },
      sb_time: { path: 'statusBar.time', title: '状态栏时间' },
      play_header: { path: 'playEntry.storeHeader', title: '商店顶栏名称' },
      play_title: { path: 'playEntry.appName', title: '应用名称' },
      play_meta: { path: 'playEntry.company', title: '公司名称' },
      play_install: { path: 'playEntry.installText', title: '安装按钮文字' },
      play_stats: { path: 'playEntry.reviews', title: '评价与数据说明' },
      user_cancel_btn: { path: 'userModule.cancelText', title: '右侧取消按钮' },
      user_section_label: { path: 'userModule.sectionTitle', title: '用户分组小标题' },
      user_nickname: { path: 'userModule.nickname', title: '用户昵称（自动同步下方卡片）' },
      user_age_badge: { path: 'userModule.age', title: '年龄文字' },
      user_level_badge: { path: 'userModule.level', title: '等级徽章文字' },
      user_bio_tag: { path: 'userModule.bioTag', title: '声音/个性标签' },
      user_region: { path: 'userModule.region', title: '地区/城市位置' },
      user_distance: { path: 'userModule.distance', title: '距离与在线状态' }
    };

    if (staticFieldMap[key]) {
      const info = staticFieldMap[key];
      openInlineEditorPopover({
        title: info.title,
        initialValue: String(getByPath(state, info.path) || ''),
        clientX,
        clientY,
        onInput: (val) => {
          setByPath(state, info.path, val);
          syncStaticInputsFromState();
        }
      });
      return;
    }

    if (key === 'step_title_3') {
      openInlineEditorPopover({
        title: '步骤 3 标题（与搜索框、ID 三处同步）',
        initialValue: state.steps.step3,
        clientX,
        clientY,
        onInput: (val) => applySyncedStep3FromText(val)
      });
      return;
    }

    if (key === 'user_search_box' || key === 'user_id_row') {
      openInlineEditorPopover({
        title: '搜索文字 / ID（三处自动同步）',
        initialValue: state.userModule.searchQuery,
        clientX,
        clientY,
        onInput: (val) => {
          const clean = String(val).replace(/^ID\s*[:：]\s*/i, '');
          syncEveryIdEverywhere(clean, null);
        }
      });
      return;
    }

    if (key.startsWith('top_tab_')) {
      const idx = Number(key.replace('top_tab_', ''));
      openInlineEditorPopover({
        title: `顶部标签 ${idx + 1}`,
        initialValue: state.navModule.topTabs[idx] || '',
        clientX,
        clientY,
        onInput: (val) => {
          state.navModule.topTabs[idx] = val;
          renderDynamicNavControls();
        },
        extraButtons: [
          {
            text: '★ 设为高亮标签',
            primary: true,
            onClick: () => {
              state.navModule.activeTopIndex = idx;
              renderDynamicNavControls();
              persistState();
            }
          }
        ]
      });
      return;
    }

    if (key.startsWith('bot_nav_')) {
      const idx = Number(key.replace('bot_nav_', ''));
      const item = state.navModule.bottomTabs[idx];
      if (!item) return;
      openInlineEditorPopover({
        title: `底部导航：${item.label}`,
        initialValue: item.label,
        clientX,
        clientY,
        onInput: (val) => {
          item.label = val;
          renderDynamicNavControls();
        },
        extraButtons: [
          {
            text: '📁 上传替换图标',
            primary: true,
            onClick: () => {
              closeInlineEditor();
              triggerDirectFileUpload('image/*', (file) => {
                loadBlobAsImage(file, (img) => {
                  mediaRegistry.customNavIcons[item.id] = img;
                  persistMedia(`navIcon:${item.id}`, file);
                  renderDynamicNavControls();
                  showToast(`已更新并保存「${item.label}」导航图标`);
                });
              });
            }
          },
          {
            text: '★ 设为高亮',
            onClick: () => {
              state.navModule.activeBottomIndex = idx;
              renderDynamicNavControls();
              persistState();
            }
          }
        ]
      });
      return;
    }

    const cardTitleMatch = key.match(/^card_(title|sub|ft|likes|author)_(.+)$/);
    if (cardTitleMatch) {
      const kind = cardTitleMatch[1];
      const cardId = cardTitleMatch[2];
      const card = state.feedModule.cards.find((c) => c.id === cardId);
      if (!card) return;

      if (kind === 'title') {
        openInlineEditorPopover({
          title: '卡片画面大标题（可换行，*词* 标重点色）',
          initialValue: card.overlayTitle || '',
          multiline: true,
          clientX,
          clientY,
          onInput: (val) => {
            card.overlayTitle = val;
            renderDynamicFeedCards();
          }
        });
      } else if (kind === 'sub') {
        openInlineEditorPopover({
          title: '卡片画面下方字幕',
          initialValue: card.overlaySubtitle || '',
          clientX,
          clientY,
          onInput: (val) => {
            card.overlaySubtitle = val;
            renderDynamicFeedCards();
          }
        });
      } else if (kind === 'ft') {
        openInlineEditorPopover({
          title: '卡片底栏标题摘要',
          initialValue: card.footerTitle || '',
          clientX,
          clientY,
          onInput: (val) => {
            card.footerTitle = val;
            renderDynamicFeedCards();
          }
        });
      } else if (kind === 'likes') {
        openInlineEditorPopover({
          title: '卡片点赞数',
          initialValue: card.likes || '',
          clientX,
          clientY,
          onInput: (val) => {
            card.likes = val;
            renderDynamicFeedCards();
          }
        });
      } else if (kind === 'author') {
        openInlineEditorPopover({
          title: '同步作者昵称 ＆ 头像',
          initialValue: state.userModule.nickname || '',
          clientX,
          clientY,
          onInput: (val) => {
            state.userModule.nickname = val;
            syncStaticInputsFromState();
          },
          extraButtons: [
            {
              text: '👤 上传替换头像',
              primary: true,
              onClick: () => {
                closeInlineEditor();
                triggerDirectFileUpload('image/*', (file) => {
                  saveAndApplyImageSlot('userAvatar', file, 'user_avatar', '👤 已替换并保存同步头像');
                });
              }
            }
          ]
        });
      }
    }
  }

  function handleDirectCanvasFileDrop(hit, file) {
    if (!file) return;
    const key = hit ? hit.key : '';

    if (file.type.startsWith('video/')) {
      let targetCard = state.feedModule.cards[0];
      if (key) {
        const found = state.feedModule.cards.find((c) => key.includes(c.id));
        if (found) targetCard = found;
      }
      if (targetCard) handleCardMediaUpload(targetCard, file);
      return;
    }

    if (!file.type.startsWith('image/')) return;

    if (key === 'play_icon') {
      saveAndApplyImageSlot('appIcon', file, 'play_icon', '🖼️ 已拖放更新并保存应用主 Logo');
    } else if (key === 'play_store_logo') {
      saveAndApplyImageSlot('storeLogo', file, 'play_store_logo', '🖼️ 已拖放更新并保存商店小标 Logo');
    } else if (key === 'play_strip') {
      saveAndApplyImageSlot('playStrip', file, 'play_strip', '🖼️ 已拖放更新并保存底部预览海报条');
    } else if (key === 'user_avatar' || key.startsWith('card_author_')) {
      saveAndApplyImageSlot('userAvatar', file, 'user_avatar', '👤 已拖放更新并保存个人同步头像');
    } else if (key) {
      const foundCard = state.feedModule.cards.find((c) => key.includes(c.id));
      if (foundCard) {
        handleCardMediaUpload(foundCard, file);
        return;
      }
      saveAndApplyImageSlot('floatingLogo', file, 'floating_brand_logo', '✨ 已拖放添加为独立浮动 Logo');
    }
  }

  function updateExportModeHint() {
    const hasAnyVideo = Object.values(mediaRegistry.cardMedia).some((m) => m && m.type === 'video');
    const hintBadge = document.getElementById('exportModeBadge');
    const mp4Btn = document.getElementById('btnExportMP4');
    const pngBtn = document.getElementById('btnExportPNG');
    if (!hintBadge) return;

    if (hasAnyVideo) {
      hintBadge.textContent = '🎬 动态视频模式（已上传 MP4）';
      hintBadge.classList.add('video-active');
      mp4Btn.classList.add('pulse-highlight');
      pngBtn.classList.remove('pulse-highlight');
    } else {
      hintBadge.textContent = '🖼️ 横屏海报模式（1920×1080）';
      hintBadge.classList.remove('video-active');
      mp4Btn.classList.remove('pulse-highlight');
    }
  }

  function getTargetCardsForAI() {
    const target = state.aiConfig.targetCard;
    if (!target || target === 'all') {
      return state.feedModule.cards;
    }
    const found = state.feedModule.cards.filter((c) => c.id === target);
    return found.length ? found : state.feedModule.cards;
  }

  function applyGeneratedCopyToCards(targetCards, generatedList) {
    targetCards.forEach((card, i) => {
      const g = generatedList[i % generatedList.length];
      if (!g) return;
      card.overlayTitle = g.overlayTitle;
      card.overlaySubtitle = g.overlaySubtitle;
      card.footerTitle = g.footerTitle;
      if (g.likes) card.likes = g.likes;
    });
    renderDynamicFeedCards();
    persistState();
  }

  async function handleGenerateAICopy() {
    const btnTop = document.getElementById('btnAiCopyTop');
    const btnPanel = document.getElementById('btnAiCopyPanel');
    const targetCards = getTargetCardsForAI();
    if (!targetCards.length) return;

    if (!String(state.aiConfig.apiKey || '').trim() && !String(state.aiConfig.gasProxyUrl || '').trim()) {
      const generated = global.LayaAIExporter.generateLocalFallbackCopy(
        state.aiConfig.topicPrompt,
        targetCards.length,
        state.posterLang === 'zh-TW'
      );
      applyGeneratedCopyToCards(targetCards, generated);
      showToast('✨ 已生成精选短视频文案（可在「高级 API 设置」填入密钥启用云端大模型）');
      return;
    }

    btnTop.disabled = true;
    btnPanel.disabled = true;
    const origText = btnPanel.textContent;
    btnPanel.textContent = '⏳ AI 生成中...';

    try {
      const generated = await global.LayaAIExporter.generateCardCopyWithGemini({
        apiKey: state.aiConfig.apiKey,
        gasProxyUrl: state.aiConfig.gasProxyUrl,
        topicPrompt: state.aiConfig.topicPrompt,
        targetCards,
        mediaRegistry,
        isTraditional: state.posterLang === 'zh-TW'
      });
      applyGeneratedCopyToCards(targetCards, generated);
      showToast('✨ Gemini AI 已自动生成卡片标题与字幕');
    } catch (err) {
      const fallback = global.LayaAIExporter.generateLocalFallbackCopy(
        state.aiConfig.topicPrompt,
        targetCards.length,
        state.posterLang === 'zh-TW'
      );
      applyGeneratedCopyToCards(targetCards, fallback);
      showToast(`AI 接口提示（${err.message}），已填入精选灵感文案`, true);
    } finally {
      btnTop.disabled = false;
      btnPanel.disabled = false;
      btnPanel.textContent = origText;
    }
  }

  async function handleExportMP4() {
    const modal = document.getElementById('exportProgressModal');
    const barFill = document.getElementById('exportProgressBar');
    const pctText = document.getElementById('exportProgressText');
    const customSecInput = document.getElementById('inpExportDuration');
    const customSec = customSecInput ? Number(customSecInput.value) || 0 : 0;

    modal.classList.remove('hidden');
    barFill.style.width = '2%';
    pctText.textContent = '准备合成 1920×1080 画面与音轨... 0%';

    currentExportAbort = {};
    try {
      const stageCanvas = document.getElementById('stageCanvas');
      const result = await global.LayaAIExporter.exportVideoMP4({
        stageCanvas,
        renderer,
        getState: () => state,
        mediaRegistry,
        customDurationSec: customSec,
        abortSignal: currentExportAbort,
        onProgress: (pct) => {
          barFill.style.width = `${pct}%`;
          pctText.textContent = `正在渲染导出 1920×1080 横屏视频... ${pct}%`;
        }
      });
      showToast(`🎬 导出完成（${result.ext.toUpperCase()} · 约 ${Math.round(result.durationSec)} 秒）`);
    } catch (err) {
      showToast(`导出视频失败：${err.message}`, true);
    } finally {
      currentExportAbort = null;
      setTimeout(() => {
        modal.classList.add('hidden');
      }, 400);
    }
  }

  function loadBlobAsImage(blobOrFile, callback) {
    const url = URL.createObjectURL(blobOrFile);
    const img = new Image();
    img.onload = () => {
      callback(img);
    };
    img.src = url;
  }

  function getByPath(obj, path) {
    return path.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), obj);
  }

  function setByPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]]) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let toastTimer = 0;
  function showToast(msg, isWarn) {
    const el = document.getElementById('appToast');
    if (!el) return;
    el.textContent = msg;
    el.className = `app-toast show ${isWarn ? 'warn' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 3600);
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
