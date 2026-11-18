/**
 * 应用商店截图与个人主页生成器 - 主应用控制器
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
    profileBg: null,
    profAvatar: null,
    customNavIcons: {},
    cardMedia: {},
    profCardMedia: {},
    profCommentAvatars: {},
    customElementImages: {},
    raw: global.LayaDefaults.createRawImageMap()
  };

  let renderer = null;
  let interaction = null;
  let zoomMode = 'fit';
  let currentExportAbort = null;
  let activeInlineHandler = null;
  let activeInlineFontKey = null;
  let pendingDirectFileCallback = null;
  let lastCanvasSize = { w: 1920, h: 1080 };
  let autoAiBatchTimer = 0;
  let pendingAutoAiPostIds = new Set();
  let stageDirty = true;
  let overlayDirty = true;
  let warmupUntil = Date.now() + 2800;
  let lastIdleAnimTime = 0;
  let lastJumpKey = '';
  let lastJumpAt = 0;

  function requestStageRender() {
    stageDirty = true;
    overlayDirty = true;
  }

  function requestOverlayRender() {
    overlayDirty = true;
  }

  function hasPlayingVideoOnActiveWorkspace() {
    if (state.activeWorkspace === 'profile') {
      return Object.values(mediaRegistry.profCardMedia || {}).some(
        (m) => m && m.type === 'video' && m.el && !m.el.paused && !m.el.ended
      );
    }
    return Object.values(mediaRegistry.cardMedia || {}).some(
      (m) => m && m.type === 'video' && m.el && !m.el.paused && !m.el.ended
    );
  }

  function persistState() {
    if (global.LayaPersistence) {
      global.LayaPersistence.scheduleSaveState(state);
    }
    requestStageRender();
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

      if (
        key === 'appIcon' ||
        key === 'storeLogo' ||
        key === 'floatingLogo' ||
        key === 'playStrip' ||
        key === 'userAvatar' ||
        key === 'profileBg' ||
        key === 'profAvatar'
      ) {
        loadBlobAsImage(rec.blob, (img) => {
          mediaRegistry[key] = img;
          if (key === 'profAvatar') refreshProfileAvatarPreview();
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
      } else if (key.startsWith('profCardMedia:')) {
        const postId = key.slice('profCardMedia:'.length);
        const posts = (state.profileCenter && state.profileCenter.posts) || [];
        const post = posts.find((p) => p.id === postId);
        if (post) {
          mountProfPostMediaBlob(post, rec.blob, rec.fileName || post.mediaName || '已保存媒体', false);
        }
      } else if (key.startsWith('profCmtAv:')) {
        const cmtId = key.slice('profCmtAv:'.length);
        loadBlobAsImage(rec.blob, (img) => {
          mediaRegistry.profCommentAvatars[cmtId] = img;
          renderProfileCommentsEditor();
        });
      } else if (key.startsWith('customElImg:')) {
        const elId = key.slice('customElImg:'.length);
        loadBlobAsImage(rec.blob, (img) => {
          mediaRegistry.customElementImages[elId] = img;
          renderCustomElementsList();
          requestStageRender();
        });
      }
    }
    requestStageRender();
  }

  function init() {
    const stageCanvas = document.getElementById('stageCanvas');
    const overlayCanvas = document.getElementById('overlayCanvas');

    let scaleStartSnapshot = null;
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
      onScaleElement: (key, ratio, phase) => {
        if (!key || !key.startsWith('custom_el_')) return;
        const elId = key.slice('custom_el_'.length);
        const target = (state.customElements || []).find((it) => it && it.id === elId);
        if (!target) return;
        if (phase === 'start') {
          scaleStartSnapshot = { key, scale: Number(target.scale) || 1 };
        } else if (phase === 'move') {
          if (!scaleStartSnapshot || scaleStartSnapshot.key !== key) {
            scaleStartSnapshot = { key, scale: Number(target.scale) || 1 };
          }
          target.scale = Math.max(0.3, Math.min(3.5, Math.round(scaleStartSnapshot.scale * ratio * 100) / 100));
          updateSelectedElementBar();
          requestStageRender();
        } else if (phase === 'end') {
          scaleStartSnapshot = null;
          renderCustomElementsList();
          renderPerTextFontList();
          persistState();
        }
      },
      onSelectElement: (hit) => {
        if (!hit) {
          closeInlineEditor();
        } else {
          syncRightPanelToCanvasHit(hit);
        }
        updateSelectedElementBar();
        requestStageRender();
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
    bindCustomElementEvents();
    bindWorkspaceModeBarEvents();
    bindAvatarLibraryModal();
    bindProfileControlEvents();
    bindPanelAccordion();
    bindStaticControlInputs();
    syncStaticInputsFromState();
    syncStageTransparencyClass();
    syncPosterLangButtons();
    syncGlobalFontScaleLabels();
    renderHiddenElementsManager();
    renderCustomElementsList();
    renderDynamicNavControls();
    renderDynamicFeedCards();
    renderProfilePanelEditors();
    applyWorkspaceMode(state.activeWorkspace === 'profile' ? 'profile' : 'store', true);
    updateExportModeHint();
    fitStageToViewport();

    // 9:16 竖屏个人中心支持滚轮直接上下滚动内容预览
    overlayCanvas.addEventListener(
      'wheel',
      (e) => {
        if (
          state.activeWorkspace === 'profile' &&
          state.profileCenter &&
          state.profileCenter.viewportMode === 'mobile'
        ) {
          e.preventDefault();
          const maxScroll = Math.max(100, renderer.lastProfileMaxScroll || 1600);
          const cur = Number(state.profileCenter.scrollY) || 0;
          const next = Math.max(0, Math.min(maxScroll, cur + Math.round(e.deltaY * 0.85)));
          state.profileCenter.scrollY = next;
          const rng = document.getElementById('rngProfScrollY');
          if (rng) {
            rng.max = String(maxScroll);
            rng.value = next;
          }
          const badge = document.querySelector('[data-val-for="profileCenter.scrollY"]');
          if (badge) badge.textContent = next;
          persistState();
        }
      },
      { passive: false }
    );

    // 异步恢复上次上传的所有图片与 MP4 视频
    restorePersistedMediaBlobs();

    // 全局捕获表单与点击操作触发按需重绘，鼠标悬停仅重绘覆盖层
    document.addEventListener('input', requestStageRender, true);
    document.addEventListener('change', requestStageRender, true);
    document.addEventListener('click', requestStageRender, true);

    ['pointermove', 'pointerdown', 'pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => {
      overlayCanvas.addEventListener(evt, requestOverlayRender, { passive: true });
    });

    window.addEventListener('resize', fitStageToViewport);
    window.addEventListener('beforeunload', () => {
      if (global.LayaPersistence) {
        global.LayaPersistence.saveStateNow(state);
      }
    });

    let lastSyncedProfMaxScroll = -1;
    const tick = () => {
      const nowMs = Date.now();
      const playingVid = hasPlayingVideoOnActiveWorkspace();
      const inWarmup = nowMs < warmupUntil;
      const animActive = Boolean(state.layout && state.layout.enableAnim !== false);
      const dueIdleAnim = animActive && nowMs - lastIdleAnimTime >= 75;

      if (stageDirty || playingVid || inWarmup || dueIdleAnim) {
        stageDirty = false;
        if (dueIdleAnim) lastIdleAnimTime = nowMs;
        renderer.render(state);
        if (stageCanvas.width !== lastCanvasSize.w || stageCanvas.height !== lastCanvasSize.h) {
          lastCanvasSize.w = stageCanvas.width;
          lastCanvasSize.h = stageCanvas.height;
          fitStageToViewport();
        }
        if (
          state.activeWorkspace === 'profile' &&
          state.profileCenter &&
          state.profileCenter.viewportMode === 'mobile'
        ) {
          const nextMax = Math.max(100, Math.round(renderer.lastProfileMaxScroll || 0));
          if (nextMax !== lastSyncedProfMaxScroll) {
            lastSyncedProfMaxScroll = nextMax;
            const rng = document.getElementById('rngProfScrollY');
            if (rng) rng.max = String(nextMax);
          }
        }
        if (interaction && interaction.uiState && interaction.uiState.selectedBox) {
          const refreshed = (renderer.hitBoxes || []).find(
            (b) => b.key === interaction.uiState.selectedBox.key
          );
          if (refreshed) interaction.uiState.selectedBox = refreshed;
        }
        overlayDirty = true;
      }

      if (overlayDirty) {
        overlayDirty = false;
        renderer.renderOverlay(interaction.uiState);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function fitStageToViewport() {
    const wrap = document.getElementById('stageViewport');
    const shell = document.getElementById('phoneStageShell');
    const stageCanvas = document.getElementById('stageCanvas');
    const zoomLabel = document.getElementById('zoomPercentLabel');
    if (!wrap || !shell) return;

    const isProfile = state.activeWorkspace === 'profile';
    const stageW = (stageCanvas && stageCanvas.width) || (isProfile ? 1080 : global.LayaDefaults.STAGE_WIDTH);
    const stageH = (stageCanvas && stageCanvas.height) || (isProfile ? 1920 : global.LayaDefaults.STAGE_HEIGHT);

    let scale;
    if (zoomMode === 'fit') {
      const availW = Math.max(320, wrap.clientWidth - 48);
      const availH = Math.max(260, wrap.clientHeight - 48);
      if (isProfile && (!state.profileCenter || state.profileCenter.viewportMode !== 'mobile')) {
        scale = Math.max(0.32, Math.min(availW / stageW, 0.56));
      } else {
        scale = Math.min(availW / stageW, availH / stageH, 0.92);
      }
    } else {
      scale = Number(zoomMode) || 0.55;
    }

    const cssW = Math.round(stageW * scale);
    const cssH = Math.round(stageH * scale);
    shell.style.width = `${cssW}px`;
    shell.style.height = `${cssH}px`;
    wrap.classList.toggle('is-profile-long', isProfile && cssH > wrap.clientHeight - 40);
    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    }
    requestOverlayRender();
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
    renderProfilePanelEditors();
    renderCustomElementsList();
    renderPerTextFontList();
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
    renderDynamicNavControls();
    renderDynamicFeedCards();
    renderProfilePanelEditors();
    renderCustomElementsList();
    persistState();
    showToast(`🗑️ 已隐藏「${label || key}」，可在右侧随时恢复`);
  }

  function restoreElementByKey(key) {
    if (!state.hiddenElements || !state.hiddenElements[key]) return;
    const lbl = state.hiddenElements[key];
    delete state.hiddenElements[key];
    renderHiddenElementsManager();
    renderDynamicNavControls();
    renderDynamicFeedCards();
    renderProfilePanelEditors();
    renderCustomElementsList();
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
    const countBadge = document.getElementById('quickRestoreCount');
    const entries = Object.entries(state.hiddenElements || {});
    if (countBadge) {
      countBadge.textContent = String(entries.length);
      countBadge.classList.toggle('hidden', entries.length === 0);
    }
    if (!wrap || !list) return;

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
      btn.title = '点击重新加回画布';
      btn.addEventListener('click', () => restoreElementByKey(key));
      list.appendChild(btn);
    });
  }

  // ===========================================================================
  // 顶部工具栏与全局按钮事件
  // ===========================================================================
  function bindToolbarEvents() {
    const getLiveStageW = () => {
      const sc = document.getElementById('stageCanvas');
      return (sc && sc.width) || global.LayaDefaults.STAGE_WIDTH;
    };

    document.getElementById('btnZoomOut').addEventListener('click', () => {
      const shell = document.getElementById('phoneStageShell');
      const cur = shell.clientWidth / getLiveStageW();
      zoomMode = Math.max(0.22, +(cur - 0.06).toFixed(2));
      fitStageToViewport();
    });

    document.getElementById('btnZoomIn').addEventListener('click', () => {
      const shell = document.getElementById('phoneStageShell');
      const cur = shell.clientWidth / getLiveStageW();
      zoomMode = Math.min(1.0, +(cur + 0.06).toFixed(2));
      fitStageToViewport();
    });

    document.getElementById('btnZoomFit').addEventListener('click', () => {
      zoomMode = 'fit';
      fitStageToViewport();
    });

    // 顶部画布工具条与右侧面板的「全部文字统一缩放」快捷按钮
    const stepGlobalFont = (delta) => {
      const cur = Number(state.layout.globalFontScale) || 100;
      setGlobalFontScale(Math.max(50, Math.min(180, cur + delta)));
    };
    document.getElementById('btnGlobalFontDown').addEventListener('click', () => stepGlobalFont(-6));
    document.getElementById('btnGlobalFontUp').addEventListener('click', () => stepGlobalFont(6));
    document.getElementById('btnPanelGlobalFontDown').addEventListener('click', () => stepGlobalFont(-6));
    document.getElementById('btnPanelGlobalFontUp').addEventListener('click', () => stepGlobalFont(6));

    const handleResetAllFonts = () => {
      resetAllFontSizes();
      showToast('↺ 已恢复全画布默认字号与 100% 缩放比例');
    };
    document.getElementById('btnGlobalFontResetTop').addEventListener('click', handleResetAllFonts);
    document.getElementById('btnResetAllFontSizes').addEventListener('click', handleResetAllFonts);

    // 底部选中元素浮条的「单独调整选中文字大小」按钮
    const stepSelectedFont = (delta) => {
      const sel = interaction && interaction.uiState.selectedBox;
      if (!sel) return;
      const meta = global.LayaDefaults.getTextElementMeta(state, sel.key);
      if (!meta) return;
      const curBase = global.LayaDefaults.getBaseFontSize(state, sel.key, meta.defaultSize);
      setIndividualFontSize(sel.key, curBase + delta);
    };
    document.getElementById('btnSelFontDown').addEventListener('click', () => stepSelectedFont(-2));
    document.getElementById('btnSelFontUp').addEventListener('click', () => stepSelectedFont(2));

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
      renderProfilePanelEditors();
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
      if (state.activeWorkspace === 'profile' && state.profileCenter) {
        const rnd = global.LayaDefaults.randomizeStatusBar({});
        const hdr = state.profileCenter.header;
        hdr.showStatusBar = true;
        hdr.time = rnd.time;
        hdr.battery = rnd.battery;
        hdr.charging = rnd.charging;
        hdr.wifi = rnd.wifi;
        hdr.dualSim = rnd.dualSim;
        hdr.signal1 = rnd.signal1;
        hdr.signal2 = rnd.signal2;
        hdr.networkType = rnd.networkType;
        hdr.showLayaNotif = true;
        syncStaticInputsFromState();
        persistState();
        showToast(`🎲 已随机个人中心顶部状态栏（${hdr.time} · ${hdr.networkType} · 电量 ${hdr.battery}%）`);
        return;
      }
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
      const g = (state.userModule && state.userModule.gender) || 'female';
      const pref = g === 'male' ? 'male' : g === 'female' ? 'female' : 'any';
      const picked =
        global.LayaProfileCenter && global.LayaProfileCenter.pickRandomAvatarFromLibrary
          ? global.LayaProfileCenter.pickRandomAvatarFromLibrary(pref)
          : { category: pref === 'male' ? 'guys' : 'beauties', index: Math.floor(Math.random() * 60) };
      mediaRegistry.userAvatar = null;
      removePersistedMedia('userAvatar');
      state.userModule.avatarCategory = picked.category;
      state.userModule.avatarIndex = picked.index;
      syncStaticInputsFromState();
      persistState();
      showToast(`🎲 已随机生成个人资料与头像（${state.userModule.age} · ${state.userModule.region}）`);
    });

    document.getElementById('btnAiCopyTop').addEventListener('click', () => {
      if (state.activeWorkspace === 'profile') {
        openAccordionSection('prof-sec-feed', true);
        handleProfileAiFeedComments();
      } else {
        openAccordionSection('sec-feed', true);
        handleGenerateAICopy();
      }
    });
    document.getElementById('btnAiCopyPanel').addEventListener('click', handleGenerateAICopy);

    document.getElementById('btnLocalInspire').addEventListener('click', () => {
      const targetCards = getTargetCardsForAI();
      const generated = global.LayaAIExporter.generateLocalFallbackCopy(
        state.aiConfig.topicPrompt,
        targetCards.length,
        state.posterLang === 'zh-TW',
        Boolean(state.aiConfig && state.aiConfig.includeOverlayText)
      );
      applyGeneratedCopyToCards(targetCards, generated);
      persistState();
      showToast('已填入精选短视频底部标题，可继续手动微调');
    });

    document.getElementById('btnExportPNG').addEventListener('click', async () => {
      try {
        const stageCanvas = document.getElementById('stageCanvas');
        const info = await global.LayaAIExporter.exportScreenshotPNG(stageCanvas, renderer, state);
        const isTrans =
          state.layout.canvasTheme === 'transparent' || state.layout.canvasTheme === 'full-transparent';
        const dimsStr = `${(info && info.w) || stageCanvas.width}×${(info && info.h) || stageCanvas.height}`;
        showToast(
          isTrans
            ? `✅ 已导出 ${dimsStr} 真透明背景 PNG（可直接拖入剪映/PS叠加）`
            : `✅ 已导出 ${dimsStr} 高清 PNG 截图`
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
      mediaRegistry.customElementImages = {};
      interaction.uiState.selectedBox = null;
      syncStaticInputsFromState();
      syncStageTransparencyClass();
      syncPosterLangButtons();
      syncGlobalFontScaleLabels();
      renderHiddenElementsManager();
      renderCustomElementsList();
      renderDynamicNavControls();
      renderDynamicFeedCards();
      renderProfilePanelEditors();
      applyWorkspaceMode('store', true);
      updateSelectedElementBar();
      updateExportModeHint();
      showToast('已清空缓存并恢复全部默认设置');
    });
  }

  function syncGlobalFontScaleLabels() {
    const pct = Number(state.layout.globalFontScale) || 100;
    const topLbl = document.getElementById('globalFontScaleTopLabel');
    if (topLbl) topLbl.textContent = `${pct}%`;
    const valBadge = document.querySelector('[data-val-for="layout.globalFontScale"]');
    if (valBadge) valBadge.textContent = pct;
    const rangeInp = document.querySelector('[data-bind="layout.globalFontScale"]');
    if (rangeInp) rangeInp.value = pct;
  }

  function setGlobalFontScale(nextPct) {
    const clamped = Math.max(50, Math.min(180, Math.round(Number(nextPct) || 100)));
    state.layout.globalFontScale = clamped;
    syncGlobalFontScaleLabels();
    updateSelectedElementBar();
    refreshInlineFontBoxUI();
    renderPerTextFontList();
    persistState();
  }

  function setIndividualFontSize(key, nextPx) {
    const meta = global.LayaDefaults.getTextElementMeta(state, key);
    if (!meta) return;
    if (!state.fontSizes) state.fontSizes = {};
    const clamped = Math.max(meta.min, Math.min(meta.max, Math.round(Number(nextPx) || meta.defaultSize)));
    state.fontSizes[key] = clamped;
    updateSelectedElementBar();
    refreshInlineFontBoxUI();
    renderPerTextFontList();
    persistState();
  }

  function resetIndividualFontSize(key) {
    if (state.fontSizes && state.fontSizes[key] !== undefined) {
      delete state.fontSizes[key];
      updateSelectedElementBar();
      refreshInlineFontBoxUI();
      renderPerTextFontList();
      persistState();
    }
  }

  function resetAllFontSizes() {
    state.layout.globalFontScale = 100;
    state.steps.fontSize = 40;
    state.feedModule.titleFontSize = 38;
    state.feedModule.subtitleFontSize = 24;
    state.fontSizes = {};
    syncStaticInputsFromState();
    syncGlobalFontScaleLabels();
    updateSelectedElementBar();
    refreshInlineFontBoxUI();
    renderPerTextFontList();
    persistState();
  }

  function renderPerTextFontList() {
    const container = document.getElementById('perTextFontList');
    if (!container || !global.LayaDefaults.listAllTextItems) return;
    const items = global.LayaDefaults.listAllTextItems(state);
    container.innerHTML = '';

    let lastGroup = '';
    items.forEach((meta) => {
      if (meta.group !== lastGroup) {
        lastGroup = meta.group;
        const gTitle = document.createElement('div');
        gTitle.className = 'per-text-group-title';
        gTitle.textContent = meta.group;
        container.appendChild(gTitle);
      }

      const isCustom = Boolean(state.fontSizes && state.fontSizes[meta.key] !== undefined);
      const basePx = global.LayaDefaults.getBaseFontSize(state, meta.key, meta.defaultSize);
      const effPx = Math.round(global.LayaDefaults.getEffectiveFontSize(state, meta.key, meta.defaultSize));

      const row = document.createElement('div');
      row.className = `per-text-row ${isCustom ? 'is-custom' : ''}`;
      row.innerHTML = `
        <span class="pt-label" title="${escapeHtml(meta.label)}">${escapeHtml(meta.label)}</span>
        <input type="range" min="${meta.min}" max="${meta.max}" value="${basePx}" />
        <span class="val-pill">${effPx}px</span>
        <button type="button" class="mini-clear-btn" style="padding:2px 6px;font-size:11px;" title="恢复此项默认字号">↺</button>
      `;

      const slider = row.querySelector('input[type="range"]');
      const pill = row.querySelector('.val-pill');
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        if (!state.fontSizes) state.fontSizes = {};
        state.fontSizes[meta.key] = v;
        row.classList.add('is-custom');
        pill.textContent = `${Math.round(global.LayaDefaults.getEffectiveFontSize(state, meta.key, meta.defaultSize))}px`;
        updateSelectedElementBar();
        refreshInlineFontBoxUI();
        persistState();
      });

      row.querySelector('.mini-clear-btn').addEventListener('click', () => {
        resetIndividualFontSize(meta.key);
      });

      container.appendChild(row);
    });
  }

  function updateSelectedElementBar() {
    const bar = document.getElementById('selectedGizmoBar');
    const txt = document.getElementById('selectedGizmoName');
    const fontGroup = document.getElementById('selectedGizmoFontGroup');
    const fontVal = document.getElementById('selectedGizmoFontVal');
    const customTools = document.getElementById('selectedCustomTools');
    const sel = interaction && interaction.uiState.selectedBox;
    if (!sel) {
      bar.classList.add('hidden');
      if (customTools) customTools.classList.add('hidden');
      return;
    }
    const off = state.offsets[sel.key] || { x: 0, y: 0 };
    bar.classList.remove('hidden');
    txt.textContent = `已选中：${sel.label} (${off.x >= 0 ? '+' : ''}${off.x}, ${
      off.y >= 0 ? '+' : ''
    }${off.y})`;

    if (customTools) {
      customTools.classList.toggle('hidden', !String(sel.key || '').startsWith('custom_el_'));
    }

    const meta = global.LayaDefaults.getTextElementMeta(state, sel.key);
    if (fontGroup && fontVal) {
      if (meta) {
        fontGroup.classList.remove('hidden');
        const eff = Math.round(global.LayaDefaults.getEffectiveFontSize(state, sel.key, meta.defaultSize));
        fontVal.textContent = `${eff}px`;
      } else {
        fontGroup.classList.add('hidden');
      }
    }
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

  function resolveRightPanelTargetForHit(hit) {
    if (!hit || !hit.key) return null;
    const key = String(hit.key);
    const parentMod = String(hit.parentModule || '');

    if (key.startsWith('custom_el_')) {
      const elId = key.slice('custom_el_'.length);
      return {
        sectionId: null,
        selector: `#customElementsPanel [data-ce-id="${elId}"], #customElementsPanel`
      };
    }

    if (state.activeWorkspace === 'profile') {
      const pc = state.profileCenter || {};
      const profStaticMap = {
        prof_bg_banner: { sectionId: 'prof-sec-header', selector: '[data-bind="profileCenter.header.bgStyle"]' },
        prof_back_btn: { sectionId: 'prof-sec-header', selector: '[data-bind="profileCenter.header.bgStyle"]' },
        prof_more_btn: { sectionId: 'prof-sec-header', selector: '[data-bind="profileCenter.header.bgStyle"]' },
        prof_online_badge: { sectionId: 'prof-sec-header', selector: '[data-bind="profileCenter.header.onlineBadgeText"]' },
        prof_sb_time: { sectionId: 'prof-sec-header', selector: '[data-bind="profileCenter.header.time"]' },
        prof_avatar: { sectionId: 'prof-sec-user', selector: '#btnRandProfAvatar' },
        prof_nickname: { sectionId: 'prof-sec-user', selector: '[data-bind="profileCenter.user.nickname"]' },
        prof_ip_text: { sectionId: 'prof-sec-user', selector: '[data-bind="profileCenter.user.ipText"]' },
        prof_id_row: { sectionId: 'prof-sec-user', selector: '[data-bind="profileCenter.user.userId"]' },
        prof_user_id: { sectionId: 'prof-sec-user', selector: '[data-bind="profileCenter.user.userId"]' },
        prof_age_badge: { sectionId: 'prof-sec-user', selector: '[data-bind="profileCenter.user.age"]' },
        prof_level_badge: { sectionId: 'prof-sec-user', selector: '[data-bind="profileCenter.user.level"]' },
        prof_voice_tag: { sectionId: 'prof-sec-user', selector: '[data-bind="profileCenter.user.voiceTag"]' },
        prof_bio_text: { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.bio.text"]' },
        prof_moment_icon: { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.momentBar.iconText"]' },
        prof_moment_desc: { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.momentBar.descText"]' },
        prof_moment_bar: { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.momentBar.descText"]' },
        prof_btn_follow: { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.actions.followText"]' },
        prof_btn_msg: { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.actions.msgText"]' },
        prof_btn_friend: { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.actions.msgText"]' },
        prof_content_search: { sectionId: 'prof-sec-feed', selector: '#profTabsEditorList' },
        prof_comments_header: { sectionId: 'prof-sec-comments', selector: '[data-bind="profileCenter.commentSection.headerTitle"]' },
        prof_comments_placeholder: { sectionId: 'prof-sec-comments', selector: '[data-bind="profileCenter.commentSection.inputPlaceholder"]' }
      };
      if (profStaticMap[key]) return profStaticMap[key];
      if (key.startsWith('prof_sb_')) {
        return { sectionId: 'prof-sec-header', selector: '[data-bind="profileCenter.header.battery"]' };
      }
      if (key.startsWith('prof_extra_badge_')) {
        return { sectionId: 'prof-sec-user', selector: '#profExtraBadgesList' };
      }
      const statMatch = key.match(/^prof_stat_(?:num|lbl)_(\d+)$/);
      if (statMatch) {
        return { sectionId: 'prof-sec-stats', selector: `#profStatsEditorList [data-stat-idx="${statMatch[1]}"]` };
      }
      if (key.startsWith('prof_bio')) {
        return { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.bio.text"]' };
      }
      if (key.startsWith('prof_moment_')) {
        return { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.momentBar.descText"]' };
      }
      if (key.startsWith('prof_tab_')) {
        return { sectionId: 'prof-sec-feed', selector: '#profTabsEditorList' };
      }
      if (key.startsWith('prof_post_')) {
        const matchedPost = (pc.posts || []).find((p) => p && (key === `prof_post_${p.id}` || key.endsWith(`_${p.id}`)));
        if (matchedPost) {
          let field = '';
          if (key.startsWith('prof_post_title_')) field = 'title';
          else if (key.startsWith('prof_post_hotcmt_')) field = 'hotComment';
          else if (key.startsWith('prof_post_likes_')) field = 'likes';
          else if (key.startsWith('prof_post_overlay_')) field = 'overlayTitle';
          else if (key.startsWith('prof_post_pin_')) field = 'pinBadge';
          else if (key.startsWith('prof_post_watched_')) field = 'watchedTag';
          else if (key.startsWith('prof_post_time_')) field = 'publishTime';
          else if (key.startsWith('prof_post_author_')) field = 'customAuthor';
          return {
            sectionId: 'prof-sec-feed',
            selector: field
              ? `[data-post-id="${matchedPost.id}"] [data-field="${field}"]`
              : `[data-post-id="${matchedPost.id}"]`
          };
        }
        return { sectionId: 'prof-sec-feed', selector: '#profPostsEditorList' };
      }
      if (key.startsWith('prof_cmt_')) {
        const cmtItems = (pc.commentSection && pc.commentSection.items) || [];
        const matchedCmt = cmtItems.find((c) => c && (key === `prof_cmt_${c.id}` || key.endsWith(`_${c.id}`)));
        if (matchedCmt) {
          let field = '';
          if (key.startsWith('prof_cmt_nick_')) field = 'nickname';
          else if (key.startsWith('prof_cmt_text_')) field = 'text';
          else if (key.startsWith('prof_cmt_reply_')) field = 'authorReply';
          else if (key.startsWith('prof_cmt_meta_')) field = 'timeLoc';
          else if (key.startsWith('prof_cmt_likes_')) field = 'likes';
          return {
            sectionId: 'prof-sec-comments',
            selector: field
              ? `[data-cmt-id="${matchedCmt.id}"] [data-field="${field}"]`
              : `[data-cmt-id="${matchedCmt.id}"]`
          };
        }
        return { sectionId: 'prof-sec-comments', selector: '#profCommentsEditorList' };
      }
      if (key.startsWith('prof_bot_')) {
        return { sectionId: 'prof-sec-comments', selector: '#profBottomNavEditorList' };
      }
      const modMap = {
        prof_header: { sectionId: 'prof-sec-header', selector: '[data-bind="profileCenter.header.bgStyle"]' },
        prof_status_bar: { sectionId: 'prof-sec-header', selector: '[data-bind="profileCenter.header.time"]' },
        prof_identity: { sectionId: 'prof-sec-user', selector: '[data-bind="profileCenter.user.nickname"]' },
        prof_stats: { sectionId: 'prof-sec-stats', selector: '#profStatsEditorList' },
        prof_bio: { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.bio.text"]' },
        prof_moment_bar: { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.momentBar.descText"]' },
        prof_actions: { sectionId: 'prof-sec-stats', selector: '[data-bind="profileCenter.actions.followText"]' },
        prof_tabs: { sectionId: 'prof-sec-feed', selector: '#profTabsEditorList' },
        prof_feed: { sectionId: 'prof-sec-feed', selector: '#profPostsEditorList' },
        prof_comment_section: { sectionId: 'prof-sec-comments', selector: '#profCommentsEditorList' },
        prof_bottom_nav: { sectionId: 'prof-sec-comments', selector: '#profBottomNavEditorList' }
      };
      if (modMap[key]) return modMap[key];
      if (modMap[parentMod]) return modMap[parentMod];
      return null;
    }

    const storeStaticMap = {
      step_title_1: { sectionId: 'sec-status', selector: '[data-bind="steps.step1"]' },
      step_title_2: { sectionId: 'sec-status', selector: '[data-bind="steps.step2"]' },
      step_title_3: { sectionId: 'sec-status', selector: '[data-bind="steps.step3"]' },
      sb_time: { sectionId: 'sec-status', selector: '[data-bind="statusBar.time"]' },
      sb_notifs: { sectionId: 'sec-status', selector: '[data-bind="statusBar.battery"]' },
      sb_system: { sectionId: 'sec-status', selector: '[data-bind="statusBar.battery"]' },
      play_icon: { sectionId: 'sec-play', selector: '#btnResetPlayIcon' },
      play_store_logo: { sectionId: 'sec-play', selector: '#btnResetPlayIcon' },
      floating_brand_logo: { sectionId: 'sec-play', selector: '#btnResetPlayIcon' },
      play_header: { sectionId: 'sec-play', selector: '[data-bind="playEntry.storeHeader"]' },
      play_install: { sectionId: 'sec-play', selector: '[data-bind="playEntry.installText"]' },
      play_title: { sectionId: 'sec-play', selector: '[data-bind="playEntry.appName"]' },
      play_meta: { sectionId: 'sec-play', selector: '[data-bind="playEntry.company"]' },
      play_stats: { sectionId: 'sec-play', selector: '[data-bind="playEntry.rating"]' },
      play_inapp: { sectionId: 'sec-play', selector: '[data-bind="playEntry.ageText"]' },
      play_age: { sectionId: 'sec-play', selector: '[data-bind="playEntry.ageText"]' },
      play_close: { sectionId: 'sec-play', selector: '#sec-play .acc-body' },
      play_strip: { sectionId: 'sec-play', selector: '#sec-play .acc-body' },
      module_1: { sectionId: 'sec-play', selector: '#sec-play .acc-body' },
      module_2: { sectionId: 'sec-nav', selector: '[data-bind="navModule.showGuideArrows"]' },
      user_avatar: { sectionId: 'sec-user', selector: '#btnRandStoreAvatar' },
      user_search_box: { sectionId: 'sec-user', selector: '[data-bind="userModule.searchQuery"]' },
      user_cancel_btn: { sectionId: 'sec-user', selector: '[data-bind="userModule.searchQuery"]' },
      user_nickname: { sectionId: 'sec-user', selector: '[data-bind="userModule.nickname"]' },
      user_age_badge: { sectionId: 'sec-user', selector: '[data-bind="userModule.age"]' },
      user_level_badge: { sectionId: 'sec-user', selector: '[data-bind="userModule.level"]' },
      user_bio_tag: { sectionId: 'sec-user', selector: '[data-bind="userModule.bioTag"]' },
      user_id_row: { sectionId: 'sec-user', selector: '[data-bind="userModule.userId"]' },
      user_region: { sectionId: 'sec-user', selector: '[data-bind="userModule.region"]' },
      user_distance: { sectionId: 'sec-user', selector: '[data-bind="userModule.distance"]' },
      module_3: { sectionId: 'sec-user', selector: '[data-bind="userModule.nickname"]' },
      module_4: { sectionId: 'sec-feed', selector: '#feedCardsEditorList' }
    };
    if (storeStaticMap[key]) return storeStaticMap[key];
    if (key.startsWith('top_tab_')) return { sectionId: 'sec-nav', selector: '#topTabsEditorList' };
    if (key.startsWith('bot_nav_')) return { sectionId: 'sec-nav', selector: '#bottomNavEditorList' };
    if (key.startsWith('nav_')) return { sectionId: 'sec-nav', selector: '[data-bind="navModule.showGuideArrows"]' };
    if (key.startsWith('user_')) return { sectionId: 'sec-user', selector: '[data-bind="userModule.nickname"]' };

    if (key.startsWith('feed_card_') || key.startsWith('card_')) {
      const cards = (state.feedModule && state.feedModule.cards) || [];
      const matchedCard = cards.find((c) => c && (key === `feed_card_${c.id}` || key.endsWith(`_${c.id}`)));
      if (matchedCard) {
        let field = '';
        if (key.startsWith('card_title_')) field = 'overlayTitle';
        else if (key.startsWith('card_sub_')) field = 'overlaySubtitle';
        else if (key.startsWith('card_ft_')) field = 'footerTitle';
        else if (key.startsWith('card_likes_')) field = 'likes';
        return {
          sectionId: 'sec-feed',
          selector: field
            ? `[data-card-id="${matchedCard.id}"] [data-field="${field}"]`
            : `[data-card-id="${matchedCard.id}"]`
        };
      }
      return { sectionId: 'sec-feed', selector: '#feedCardsEditorList' };
    }

    if (storeStaticMap[parentMod]) return storeStaticMap[parentMod];
    return null;
  }

  function syncRightPanelToCanvasHit(hit) {
    if (!hit || !hit.key) return;
    const now = Date.now();
    if (lastJumpKey === hit.key && now - lastJumpAt < 120) return;
    lastJumpKey = hit.key;
    lastJumpAt = now;

    const mapped = resolveRightPanelTargetForHit(hit);
    if (!mapped) return;

    const sec = mapped.sectionId ? document.getElementById(mapped.sectionId) : null;
    if (sec) {
      sec.classList.add('open');
      document.querySelectorAll('.panel-sticky-nav [data-jump-sec]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-jump-sec') === mapped.sectionId);
      });
    }

    const findHighlightContainer = (node) => {
      let cur = node;
      while (cur && cur !== document.body) {
        if (
          cur.classList &&
          (cur.classList.contains('field-group') ||
            cur.classList.contains('feed-card-editor') ||
            cur.classList.contains('custom-el-row') ||
            cur.classList.contains('inline-item-row') ||
            cur.classList.contains('upload-bar-row'))
        ) {
          return cur;
        }
        cur = cur.parentNode;
      }
      return null;
    };

    const targetNode = mapped.selector ? document.querySelector(mapped.selector) : null;
    const highlightBox = (targetNode && findHighlightContainer(targetNode)) || targetNode || sec;

    if (!highlightBox) return;

    document.querySelectorAll('.field-jump-highlight').forEach((oldEl) => {
      oldEl.classList.remove('field-jump-highlight');
    });
    void highlightBox.offsetWidth;
    highlightBox.classList.add('field-jump-highlight');
    setTimeout(() => highlightBox.classList.remove('field-jump-highlight'), 1650);

    setTimeout(() => {
      try {
        highlightBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) {}
    }, 60);
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

        // 同步绑定相同 data-bind 路径的其余控件（如顶条与右侧面板共用字段）
        document.querySelectorAll(`[data-bind="${path}"]`).forEach((otherEl) => {
          if (otherEl === el) return;
          if (otherEl.type === 'checkbox') otherEl.checked = Boolean(val);
          else otherEl.value = val;
        });

        if (path === 'layout.canvasTheme') {
          syncStageTransparencyClass();
        } else if (path === 'profileCenter.viewportMode') {
          syncProfileViewportUI();
          renderer.ensureCanvasDimensions(state);
          fitStageToViewport();
          updateExportModeHint();
        } else if (path === 'profileCenter.user.avatarCategory' || path === 'profileCenter.user.avatarIndex') {
          refreshProfileAvatarPreview();
        } else if (path === 'layout.globalFontScale') {
          syncGlobalFontScaleLabels();
          updateSelectedElementBar();
          refreshInlineFontBoxUI();
          renderPerTextFontList();
        } else if (path === 'steps.fontSize') {
          if (state.fontSizes) {
            delete state.fontSizes.step_title_1;
            delete state.fontSizes.step_title_2;
            delete state.fontSizes.step_title_3;
          }
          renderPerTextFontList();
        } else if (path === 'feedModule.titleFontSize') {
          if (state.fontSizes) {
            Object.keys(state.fontSizes).forEach((k) => {
              if (k.startsWith('card_title_')) delete state.fontSizes[k];
            });
          }
          renderPerTextFontList();
        } else if (path === 'feedModule.subtitleFontSize') {
          if (state.fontSizes) {
            Object.keys(state.fontSizes).forEach((k) => {
              if (k.startsWith('card_sub_')) delete state.fontSizes[k];
            });
          }
          renderPerTextFontList();
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

    // 所有字段旁边的「🎲 筛子随机」按钮统一点按委托（包含静态面板与动态卡片列表）
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.field-dice-btn') : null;
      if (!btn) return;
      btn.classList.remove('dice-spinning');
      void btn.offsetWidth;
      btn.classList.add('dice-spinning');
      setTimeout(() => btn.classList.remove('dice-spinning'), 460);

      const target = btn.getAttribute('data-dice-target');
      if (!target || !global.LayaDefaults || typeof global.LayaDefaults.rollRandomFieldValue !== 'function') {
        return;
      }

      if (target === 'globalSearchId') {
        const curId = state.userModule && state.userModule.userId;
        const nextId = global.LayaDefaults.rollRandomFieldValue('searchId', curId, state);
        if (nextId) {
          syncEveryIdEverywhere(nextId, null);
          persistState();
          requestStageRender();
        }
        return;
      }

      const pool = btn.getAttribute('data-dice-pool') || target.split('.').pop();
      const curVal = getByPath(state, target);
      let nextVal = global.LayaDefaults.rollRandomFieldValue(pool, curVal, state);
      if (nextVal === undefined || nextVal === null || nextVal === '') return;

      const boundEls = document.querySelectorAll(`[data-bind="${target}"]`);
      boundEls.forEach((el) => {
        if (el.type === 'range' || el.type === 'number') {
          nextVal = Number(nextVal);
        }
      });
      setByPath(state, target, nextVal);

      boundEls.forEach((el) => {
        el.value = nextVal;
      });
      document.querySelectorAll(`[data-val-for="${target}"]`).forEach((badge) => {
        badge.textContent = nextVal;
      });

      persistState();
      requestStageRender();
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
      showToast('已恢复默认应用图标');
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
      state.userModule.avatarCategory = 'beauties';
      state.userModule.avatarIndex = 9;
      persistState();
      showToast('已恢复默认用户头像');
    });

    const btnRandStoreAvatar = document.getElementById('btnRandStoreAvatar');
    if (btnRandStoreAvatar) {
      btnRandStoreAvatar.addEventListener('click', () => {
        const g = (state.userModule && state.userModule.gender) || 'female';
        const pref = g === 'male' ? 'male' : g === 'female' ? 'female' : 'any';
        const picked =
          global.LayaProfileCenter && global.LayaProfileCenter.pickRandomAvatarFromLibrary
            ? global.LayaProfileCenter.pickRandomAvatarFromLibrary(pref)
            : { category: pref === 'male' ? 'guys' : 'beauties', index: Math.floor(Math.random() * 60) };
        mediaRegistry.userAvatar = null;
        removePersistedMedia('userAvatar');
        state.userModule.avatarCategory = picked.category;
        state.userModule.avatarIndex = picked.index;
        if (state.hiddenElements) {
          delete state.hiddenElements.user_avatar;
          renderHiddenElementsManager();
        }
        persistState();
        showToast('🎲 已从头像库随机更换头像');
      });
    }

    const btnOpenStoreAvatarLib = document.getElementById('btnOpenStoreAvatarLib');
    if (btnOpenStoreAvatarLib) {
      btnOpenStoreAvatarLib.addEventListener('click', openAvatarLibraryForStoreUser);
    }

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
        overlayTitle: '',
        overlaySubtitle: '',
        footerTitle: conv(`热门分享卡片 #${nextIdx}`),
        likes: String(Math.floor(Math.random() * 2000 + 600)),
        mediaType: 'default',
        defaultVariant: nextIdx % 2 === 1 ? 'boy' : 'girl',
        mediaName: '原图封面',
        showPlayBadge: true
      };
      state.feedModule.cards.push(newCard);
      renderDynamicFeedCards();
      renderPerTextFontList();
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
      const canDel = state.navModule.topTabs.length > 1;

      row.innerHTML = `
        <button type="button" class="pill-radio ${isActive ? 'active' : ''}">
          ${isActive ? '★ 高亮' : '设高亮'}
        </button>
        <input type="text" class="ctrl-input" value="${escapeHtml(label)}" placeholder="标签文字" />
        <button type="button" class="mini-clear-btn" data-act="toggleVis" title="${isHid ? '恢复显示' : '隐藏此标签'}">
          ${isHid ? '显示' : '隐藏'}
        </button>
        ${canDel ? '<button type="button" class="btn-icon-danger" data-act="delTab" title="删除此标签">删</button>' : ''}
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

      row.querySelector('[data-act="toggleVis"]').addEventListener('click', () => {
        toggleElementVisibility(hidKey, `顶部标签：${label}`);
        renderDynamicNavControls();
      });

      const delBtn = row.querySelector('[data-act="delTab"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          state.navModule.topTabs.splice(idx, 1);
          if (state.navModule.activeTopIndex >= state.navModule.topTabs.length) {
            state.navModule.activeTopIndex = Math.max(0, state.navModule.topTabs.length - 1);
          }
          renderDynamicNavControls();
          renderPerTextFontList();
          persistState();
        });
      }

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
      const canDel = state.navModule.bottomTabs.length > 1;

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
        ${canDel ? '<button type="button" class="btn-icon-danger" data-act="delNav" title="删除此导航">删</button>' : ''}
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

      const delNavBtn = row.querySelector('[data-act="delNav"]');
      if (delNavBtn) {
        delNavBtn.addEventListener('click', () => {
          delete mediaRegistry.customNavIcons[item.id];
          removePersistedMedia(`navIcon:${item.id}`);
          state.navModule.bottomTabs.splice(idx, 1);
          if (state.navModule.activeBottomIndex >= state.navModule.bottomTabs.length) {
            state.navModule.activeBottomIndex = Math.max(0, state.navModule.bottomTabs.length - 1);
          }
          renderDynamicNavControls();
          renderPerTextFontList();
          persistState();
        });
      }

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
      box.setAttribute('data-card-id', card.id);

      box.innerHTML = `
        <div class="feed-card-editor-head">
          <span class="card-badge">卡片 ${idx + 1}（${idx % 2 === 0 ? '左列' : '右列'}）</span>
          <div class="card-head-actions">
            <span class="media-type-pill ${isVideo ? 'is-video' : ''}">
              ${isVideo ? '🎬 MP4 视频' : isImage ? '🖼️ 自定义图片' : '🎨 原图封面'}
            </span>
            <button type="button" class="btn-dark-sm" data-act="aiRecognize" title="根据当前图片或视频画面自动识别生成底部标题">🤖 识图写标题</button>
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

        <div class="grid-2-col">
          <div class="field-group">
            <label class="field-label"><span>卡片底部标题（上传自动识别）</span><button type="button" class="field-dice-btn" data-dice-card="footerTitle" title="随机标题">🎲</button></label>
            <input type="text" class="ctrl-input" data-field="footerTitle" value="${escapeHtml(
              card.footerTitle || ''
            )}" placeholder="上传图片/视频后自动识别生成" />
          </div>
          <div class="field-group">
            <label class="field-label"><span>♡ 点赞数</span><button type="button" class="field-dice-btn" data-dice-card="likes" title="随机赞数">🎲</button></label>
            <input type="text" class="ctrl-input" data-field="likes" value="${escapeHtml(card.likes)}" />
          </div>
        </div>

        <div class="field-group">
          <label class="field-label"><span>画面可选大字（默认留空无字幕）</span><button type="button" class="field-dice-btn" data-dice-card="overlayTitle" title="随机花字">🎲</button></label>
          <textarea class="ctrl-textarea" rows="2" data-field="overlayTitle" placeholder="默认留空不遮挡画面，如需可填（可用 *词* 标重点色）">${escapeHtml(
            card.overlayTitle || ''
          )}</textarea>
        </div>

        <div class="field-group">
          <label class="field-label"><span>画面可选下方字幕（默认留空）</span><button type="button" class="field-dice-btn" data-dice-card="overlaySubtitle" title="随机字幕">🎲</button></label>
          <input type="text" class="ctrl-input" data-field="overlaySubtitle" value="${escapeHtml(
            card.overlaySubtitle || ''
          )}" placeholder="默认不显示字幕，如需可手动填写" />
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

      box.querySelectorAll('[data-dice-card]').forEach((diceBtn) => {
        diceBtn.addEventListener('click', () => {
          const field = diceBtn.getAttribute('data-dice-card');
          if (!field || !global.LayaDefaults || !global.LayaDefaults.rollRandomFieldValue) return;
          const nextVal = global.LayaDefaults.rollRandomFieldValue(field, card[field], state);
          if (nextVal !== undefined && nextVal !== null) {
            card[field] = nextVal;
            const targetInp = box.querySelector(`[data-field="${field}"]`);
            if (targetInp) targetInp.value = nextVal;
            persistState();
            requestStageRender();
          }
        });
      });

      const aiRecBtn = box.querySelector('[data-act="aiRecognize"]');
      if (aiRecBtn) {
        aiRecBtn.addEventListener('click', () => {
          autoRecognizeStoreCardTitle(card, entry ? entry.el : null, card.mediaName || '');
        });
      }

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
          renderPerTextFontList();
          updateExportModeHint();
          persistState();
        });
      }

      container.appendChild(box);
    });
  }

  async function autoRecognizeStoreCardTitle(card, mediaEl, displayName, silent) {
    if (!card || !global.LayaAIExporter || typeof global.LayaAIExporter.recognizeSingleMediaTitleWithAI !== 'function') {
      return;
    }
    try {
      const res = await global.LayaAIExporter.recognizeSingleMediaTitleWithAI({
        mediaEl,
        fileName: displayName || card.mediaName || '',
        isTraditional: state.posterLang === 'zh-TW',
        aiConfig: state.aiConfig
      });
      if (res && res.footerTitle) {
        card.footerTitle = res.footerTitle;
        const cardInp = document.querySelector(`#feedCardsEditorList [data-card-id="${card.id}"] [data-field="footerTitle"]`);
        if (cardInp) cardInp.value = card.footerTitle;
        persistState();
        requestStageRender();
        if (!silent) {
          showToast(
            res.usedRemoteAI
              ? `🤖 AI 已识别画面并生成标题：「${card.footerTitle}」`
              : `✨ 已自动识别生成标题：「${card.footerTitle}」`
          );
        }
      }
    } catch (_) {}
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

      let recognizedOnce = false;
      const runVidRecognize = () => {
        if (!shouldSaveToDB || recognizedOnce) return;
        recognizedOnce = true;
        autoRecognizeStoreCardTitle(card, video, displayName);
      };

      video.addEventListener('loadeddata', () => {
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => {});
        });
        renderDynamicFeedCards();
        updateExportModeHint();
        requestStageRender();
        runVidRecognize();
      });

      if (shouldSaveToDB) {
        setTimeout(runVidRecognize, 650);
      }

      video.addEventListener('play', () => {
        renderDynamicFeedCards();
        requestStageRender();
      });
      video.addEventListener('pause', () => {
        renderDynamicFeedCards();
        requestStageRender();
      });

      mediaRegistry.cardMedia[card.id] = { type: 'video', el: video, url };
      card.mediaType = 'video';
      card.mediaName = displayName;
      requestStageRender();
      if (shouldSaveToDB) {
        persistMedia(`cardMedia:${card.id}`, blobOrFile, { fileName: displayName });
        persistState();
        showToast(`🎬 已载入视频「${displayName}」，正在自动识别标题…`);
      }
    } else {
      const img = new Image();
      img.onload = () => {
        mediaRegistry.cardMedia[card.id] = { type: 'image', el: img, url };
        card.mediaType = 'image';
        card.mediaName = displayName;
        renderDynamicFeedCards();
        updateExportModeHint();
        requestStageRender();
        if (shouldSaveToDB) {
          persistMedia(`cardMedia:${card.id}`, blobOrFile, { fileName: displayName });
          persistState();
          autoRecognizeStoreCardTitle(card, img, displayName);
        }
      };
      img.src = url;
    }
  }

  function handleCardMediaUpload(card, file) {
    mountCardMediaBlob(card, file, file.name || '上传媒体', true);
  }

  function toggleCardVideoPlayback(cardId) {
    const isProf = String(cardId).startsWith('prof:');
    const realId = isProf ? String(cardId).slice(5) : cardId;
    const entry = isProf ? mediaRegistry.profCardMedia[realId] : mediaRegistry.cardMedia[realId];
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
    if (isProf) renderProfilePostsEditor();
    else renderDynamicFeedCards();
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

  function disposeProfPostMedia(postId) {
    const entry = mediaRegistry.profCardMedia[postId];
    if (!entry) return;
    if (entry.type === 'video' && entry.el) {
      entry.el.pause();
      entry.el.removeAttribute('src');
      entry.el.load();
    }
    if (entry.url) {
      URL.revokeObjectURL(entry.url);
    }
    delete mediaRegistry.profCardMedia[postId];
  }

  function cleanupAllUploadedMedia() {
    mediaRegistry.appIcon = null;
    mediaRegistry.storeLogo = null;
    mediaRegistry.floatingLogo = null;
    mediaRegistry.playStrip = null;
    mediaRegistry.userAvatar = null;
    mediaRegistry.profileBg = null;
    mediaRegistry.profAvatar = null;
    mediaRegistry.customNavIcons = {};
    mediaRegistry.profCommentAvatars = {};
    Object.keys(mediaRegistry.cardMedia).forEach((cid) => disposeCardMedia(cid));
    Object.keys(mediaRegistry.profCardMedia).forEach((pid) => disposeProfPostMedia(pid));
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

    const fRange = document.getElementById('inlineFontRange');
    const fDown = document.getElementById('btnInlineFontDown');
    const fUp = document.getElementById('btnInlineFontUp');
    const fReset = document.getElementById('btnInlineFontReset');

    if (fRange) {
      fRange.addEventListener('input', () => {
        if (activeInlineFontKey) {
          setIndividualFontSize(activeInlineFontKey, Number(fRange.value));
        }
      });
    }
    if (fDown) {
      fDown.addEventListener('click', () => {
        if (!activeInlineFontKey) return;
        const meta = global.LayaDefaults.getTextElementMeta(state, activeInlineFontKey);
        if (!meta) return;
        const cur = global.LayaDefaults.getBaseFontSize(state, activeInlineFontKey, meta.defaultSize);
        setIndividualFontSize(activeInlineFontKey, cur - 2);
      });
    }
    if (fUp) {
      fUp.addEventListener('click', () => {
        if (!activeInlineFontKey) return;
        const meta = global.LayaDefaults.getTextElementMeta(state, activeInlineFontKey);
        if (!meta) return;
        const cur = global.LayaDefaults.getBaseFontSize(state, activeInlineFontKey, meta.defaultSize);
        setIndividualFontSize(activeInlineFontKey, cur + 2);
      });
    }
    if (fReset) {
      fReset.addEventListener('click', () => {
        if (activeInlineFontKey) {
          resetIndividualFontSize(activeInlineFontKey);
        }
      });
    }

    document.addEventListener('pointerdown', (e) => {
      if (!editor || editor.classList.contains('hidden')) return;
      if (editor.contains(e.target) || e.target.id === 'overlayCanvas') return;
      closeInlineEditor();
    });
  }

  function refreshInlineFontBoxUI() {
    const fBox = document.getElementById('inlineFontSizeBox');
    const fRange = document.getElementById('inlineFontRange');
    const fBadge = document.getElementById('inlineFontBadge');
    if (!fBox || !fRange || !fBadge) return;

    const meta = activeInlineFontKey
      ? global.LayaDefaults.getTextElementMeta(state, activeInlineFontKey)
      : null;
    if (!meta) {
      fBox.classList.add('hidden');
      return;
    }
    fBox.classList.remove('hidden');
    const basePx = global.LayaDefaults.getBaseFontSize(state, activeInlineFontKey, meta.defaultSize);
    const effPx = Math.round(
      global.LayaDefaults.getEffectiveFontSize(state, activeInlineFontKey, meta.defaultSize)
    );
    fRange.min = meta.min;
    fRange.max = meta.max;
    fRange.value = basePx;
    fBadge.textContent = `${effPx}px`;
  }

  function closeInlineEditor() {
    const editor = document.getElementById('canvasInlineEditor');
    if (editor) editor.classList.add('hidden');
    activeInlineHandler = null;
    activeInlineFontKey = null;
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

    refreshInlineFontBoxUI();

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
    if (hit) {
      syncRightPanelToCanvasHit(hit);
    }
    if (!hit || hit.kind === 'module') {
      closeInlineEditor();
      return;
    }
    const key = hit.key;
    activeInlineFontKey = key;

    if (key.startsWith('custom_el_')) {
      const elId = key.slice('custom_el_'.length);
      const customEl = (state.customElements || []).find((it) => it && it.id === elId);
      if (!customEl) return;

      if (customEl.type === 'image') {
        openInlineEditorPopover({
          title: '自定义图片贴纸控制',
          initialValue: null,
          clientX,
          clientY,
          extraButtons: [
            {
              text: '🖼️ 从图库换图',
              primary: true,
              onClick: () => {
                closeInlineEditor();
                openAvatarLibraryModal({
                  title: '🖼️ 为贴纸更换图库图片',
                  initialCat: customEl.libCategory || 'beauties',
                  initialIdx: customEl.libIndex || 0,
                  onSelect: (cat, idx) => {
                    delete mediaRegistry.customElementImages[customEl.id];
                    removePersistedMedia(`customElImg:${customEl.id}`);
                    customEl.libCategory = cat;
                    customEl.libIndex = idx;
                    renderCustomElementsList();
                    persistState();
                  },
                  onUploadFile: (file) => {
                    loadBlobAsImage(file, (img) => {
                      mediaRegistry.customElementImages[customEl.id] = img;
                      persistMedia(`customElImg:${customEl.id}`, file);
                      renderCustomElementsList();
                    });
                  }
                });
              }
            },
            {
              text: '📁 上传本地图片',
              onClick: () => {
                closeInlineEditor();
                triggerDirectFileUpload('image/*', (file) => {
                  loadBlobAsImage(file, (img) => {
                    mediaRegistry.customElementImages[customEl.id] = img;
                    persistMedia(`customElImg:${customEl.id}`, file);
                    renderCustomElementsList();
                  });
                });
              }
            },
            {
              text: '📐 切圆角/圆形',
              onClick: () => {
                cycleCustomElementStyle(customEl.id);
              }
            },
            {
              text: '📋 复制',
              onClick: () => duplicateCustomElement(customEl.id)
            },
            {
              text: '🗑️ 彻底移除',
              onClick: () => {
                closeInlineEditor();
                removeCustomElement(customEl.id);
              }
            }
          ]
        });
        return;
      }

      openInlineEditorPopover({
        title: '编辑自定义元素文字 / 样式',
        initialValue: customEl.text || '',
        multiline: customEl.type === 'text',
        clientX,
        clientY,
        onInput: (val) => {
          customEl.text = val;
          renderCustomElementsList();
          renderPerTextFontList();
        },
        extraButtons: [
          {
            text: '🎨 换样式',
            primary: true,
            onClick: () => cycleCustomElementStyle(customEl.id)
          },
          {
            text: '↻ 旋转45°',
            onClick: () => {
              customEl.rotation = ((Number(customEl.rotation) || 0) + 45) % 360;
              renderCustomElementsList();
              persistState();
            }
          },
          {
            text: '📋 复制',
            onClick: () => duplicateCustomElement(customEl.id)
          },
          {
            text: '🗑️ 彻底移除',
            onClick: () => {
              closeInlineEditor();
              removeCustomElement(customEl.id);
            }
          }
        ]
      });
      return;
    }

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
      openInlineEditorPopover({
        title: '个人同步头像（商店名片 + 卡片头像）',
        initialValue: null,
        clientX,
        clientY,
        extraButtons: [
          {
            text: '🖼️ 从 450+ 头像库挑选',
            primary: true,
            onClick: () => {
              closeInlineEditor();
              openAvatarLibraryForStoreUser();
            }
          },
          {
            text: '📁 上传本地图片',
            onClick: () => {
              closeInlineEditor();
              triggerDirectFileUpload('image/*', (file) => {
                saveAndApplyImageSlot('userAvatar', file, 'user_avatar', '👤 已更新并保存个人头像（下方卡片已同步）');
              });
            }
          }
        ]
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
      play_inapp: { path: 'playEntry.inAppText', title: '包含内购小字' },
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
              text: '🖼️ 从头像库挑选',
              primary: true,
              onClick: () => {
                closeInlineEditor();
                openAvatarLibraryForStoreUser();
              }
            },
            {
              text: '👤 上传替换头像',
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
      return;
    }

    // ==================== 个人中心画布直点编辑与交互 ====================
    if (handleProfileDirectCanvasClick(hit, clientX, clientY)) {
      return;
    }
  }

  function handleDirectCanvasFileDrop(hit, file) {
    if (!file) return;
    const key = hit ? hit.key : '';

    if (state.activeWorkspace === 'profile') {
      const pc = state.profileCenter;
      if (key === 'prof_bg_banner' && file.type.startsWith('image/')) {
        loadBlobAsImage(file, (img) => {
          mediaRegistry.profileBg = img;
          pc.header.bgStyle = 'custom';
          persistMedia('profileBg', file);
          syncStaticInputsFromState();
          persistState();
          showToast('🖼️ 已拖放替换个人主页背景图片');
        });
        return;
      }
      if (key === 'prof_avatar' && file.type.startsWith('image/')) {
        loadBlobAsImage(file, (img) => {
          mediaRegistry.profAvatar = img;
          persistMedia('profAvatar', file);
          refreshProfileAvatarPreview();
          showToast('👤 已拖放更新个人主页头像');
        });
        return;
      }
      if (key.startsWith('prof_cmt_avatar_') && file.type.startsWith('image/')) {
        const cmtId = key.replace('prof_cmt_avatar_', '');
        loadBlobAsImage(file, (img) => {
          mediaRegistry.profCommentAvatars[cmtId] = img;
          persistMedia(`profCmtAv:${cmtId}`, file);
          renderProfileCommentsEditor();
          showToast('👤 已替换评论头像');
        });
        return;
      }
      if (file.type.startsWith('video/') || file.type.startsWith('image/')) {
        let targetPost = pc.posts.find((p) => key && key.includes(p.id));
        if (!targetPost) {
          targetPost = createBlankProfPost(pc.posts.length + 1);
          pc.posts.unshift(targetPost);
        }
        handleProfPostMediaUpload(targetPost, file);
      }
      return;
    }

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
    const hintBadge = document.getElementById('exportModeBadge');
    const mp4Btn = document.getElementById('btnExportMP4');
    const pngBtn = document.getElementById('btnExportPNG');
    if (!hintBadge) return;

    if (state.activeWorkspace === 'profile') {
      const hasAnyProfVideo = Object.values(mediaRegistry.profCardMedia).some((m) => m && m.type === 'video');
      const isMobile = state.profileCenter && state.profileCenter.viewportMode === 'mobile';
      if (hasAnyProfVideo) {
        hintBadge.textContent = '🎬 个人中心动态模式（含视频）';
        hintBadge.classList.add('video-active');
        mp4Btn.classList.add('pulse-highlight');
        pngBtn.classList.remove('pulse-highlight');
      } else {
        hintBadge.textContent = isMobile ? '📱 个人中心（9:16 竖屏）' : '📜 个人中心（长图瀑布流）';
        hintBadge.classList.remove('video-active');
        mp4Btn.classList.remove('pulse-highlight');
      }
      return;
    }

    const hasAnyVideo = Object.values(mediaRegistry.cardMedia).some((m) => m && m.type === 'video');
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
    const withOverlay = Boolean(state.aiConfig && state.aiConfig.includeOverlayText);
    targetCards.forEach((card, i) => {
      const g = generatedList[i % generatedList.length];
      if (!g) return;
      if (withOverlay) {
        card.overlayTitle = g.overlayTitle || '';
        card.overlaySubtitle = g.overlaySubtitle || '';
      } else {
        card.overlayTitle = '';
        card.overlaySubtitle = '';
      }
      card.footerTitle = g.footerTitle || card.footerTitle;
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
    const includeOverlayText = Boolean(state.aiConfig && state.aiConfig.includeOverlayText);

    const resolvedAi =
      global.LayaProfileCenter && typeof global.LayaProfileCenter.resolveGeminiConfig === 'function'
        ? global.LayaProfileCenter.resolveGeminiConfig(state.aiConfig)
        : {
            apiKey: String((state.aiConfig && state.aiConfig.apiKey) || '').trim(),
            gasProxyUrl: String((state.aiConfig && state.aiConfig.gasProxyUrl) || '').trim()
          };

    if (!resolvedAi.apiKey && !resolvedAi.gasProxyUrl) {
      const generated = global.LayaAIExporter.generateLocalFallbackCopy(
        state.aiConfig.topicPrompt,
        targetCards.length,
        state.posterLang === 'zh-TW',
        includeOverlayText
      );
      applyGeneratedCopyToCards(targetCards, generated);
      showToast('✨ 已生成短视频底部标题（可在「高级 API 设置」填入密钥启用云端大模型）');
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
        isTraditional: state.posterLang === 'zh-TW',
        includeOverlayText
      });
      applyGeneratedCopyToCards(targetCards, generated);
      showToast(includeOverlayText ? '✨ Gemini AI 已自动生成卡片标题与字幕' : '✨ Gemini AI 已识图生成卡片底部标题');
    } catch (err) {
      const fallback = global.LayaAIExporter.generateLocalFallbackCopy(
        state.aiConfig.topicPrompt,
        targetCards.length,
        state.posterLang === 'zh-TW',
        includeOverlayText
      );
      applyGeneratedCopyToCards(targetCards, fallback);
      showToast(`AI 接口提示（${err.message}），已填入精选灵感标题`, true);
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

    const stageCanvas = document.getElementById('stageCanvas');
    const curW = (stageCanvas && stageCanvas.width) || 1920;
    const curH = (stageCanvas && stageCanvas.height) || 1080;

    modal.classList.remove('hidden');
    barFill.style.width = '2%';
    pctText.textContent = `准备合成 ${curW}×${curH} 画面与音轨... 0%`;

    currentExportAbort = {};
    try {
      const result = await global.LayaAIExporter.exportVideoMP4({
        stageCanvas,
        renderer,
        getState: () => state,
        mediaRegistry,
        customDurationSec: customSec,
        abortSignal: currentExportAbort,
        onProgress: (pct) => {
          barFill.style.width = `${pct}%`;
          pctText.textContent = `正在渲染导出 ${curW}×${curH} 视频... ${pct}%`;
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

  // ===========================================================================
  // 双栏工作台切换（商店截图生成器 ⇄ 个人中心）
  // ===========================================================================
  function applyWorkspaceMode(mode, skipSave) {
    const nextMode = mode === 'profile' ? 'profile' : 'store';
    state.activeWorkspace = nextMode;
    const isProfile = nextMode === 'profile';

    document.querySelectorAll('[data-workspace-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-workspace-mode') === nextMode);
    });

    const profTools = document.getElementById('profileBarTools');
    const storeSticky = document.getElementById('storeStickyNav');
    const profSticky = document.getElementById('profileStickyNav');
    const storeExtra = document.getElementById('storeSharedExtra');
    const storeSecs = document.getElementById('storeControlSections');
    const profSecs = document.getElementById('profileControlSections');
    const shell = document.getElementById('phoneStageShell');
    const dragScopeSel = document.getElementById('selDragScope');

    if (profTools) profTools.classList.toggle('hidden', !isProfile);
    if (storeSticky) storeSticky.classList.toggle('hidden', isProfile);
    if (profSticky) profSticky.classList.toggle('hidden', !isProfile);
    if (storeExtra) storeExtra.classList.toggle('hidden', isProfile);
    if (storeSecs) storeSecs.classList.toggle('hidden', isProfile);
    if (profSecs) profSecs.classList.toggle('hidden', !isProfile);
    if (shell) shell.classList.toggle('is-profile-mode', isProfile);

    if (dragScopeSel) {
      dragScopeSel.disabled = false;
      interaction.dragMode = dragScopeSel.value === 'module' ? 'module' : 'element';
    }

    if (interaction) {
      interaction.uiState.selectedBox = null;
      interaction.uiState.hoveredBox = null;
      interaction.uiState.guides = [];
    }
    closeInlineEditor();
    updateSelectedElementBar();
    syncProfileViewportUI();
    renderer.ensureCanvasDimensions(state);
    const sc = document.getElementById('stageCanvas');
    if (sc) {
      lastCanvasSize.w = sc.width;
      lastCanvasSize.h = sc.height;
    }
    zoomMode = 'fit';
    fitStageToViewport();
    renderCustomElementsList();
    renderPerTextFontList();
    updateExportModeHint();
    if (!skipSave) persistState();
  }

  function bindCustomElementEvents() {
    const pop = document.getElementById('quickAddPopover');
    const toggleBtn = document.getElementById('btnToggleQuickAdd');
    if (toggleBtn && pop) {
      toggleBtn.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        pop.classList.toggle('hidden');
      });
    }

    document.querySelectorAll('[data-add-el]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-add-el');
        if (pop) pop.classList.add('hidden');
        if (mode === 'image-upload') {
          triggerDirectFileUpload('image/*', (file) => addCustomElement('image', { file }));
        } else if (mode === 'image-lib') {
          openAvatarLibraryModal({
            title: '🖼️ 挑一张高清图片作为贴纸添加到当前画布',
            initialCat: 'beauties',
            initialIdx: 0,
            onSelect: (cat, idx) => addCustomElement('image', { libCategory: cat, libIndex: idx }),
            onUploadFile: (file) => addCustomElement('image', { file })
          });
        } else {
          addCustomElement(mode);
        }
      });
    });

    const quickRestoreBtn = document.getElementById('btnQuickRestoreTop');
    if (quickRestoreBtn) {
      quickRestoreBtn.addEventListener('click', () => {
        const keys = Object.keys(state.hiddenElements || {});
        if (!keys.length) {
          showToast('当前画布没有被删除/隐藏的元素');
          return;
        }
        const lastKey = keys[keys.length - 1];
        restoreElementByKey(lastKey);
      });
    }

    const getSelectedCustomEl = () => {
      const sel = interaction && interaction.uiState.selectedBox;
      if (!sel || !sel.key || !sel.key.startsWith('custom_el_')) return null;
      const elId = sel.key.slice('custom_el_'.length);
      return (state.customElements || []).find((it) => it && it.id === elId) || null;
    };

    const sDown = document.getElementById('btnCustomElScaleDown');
    if (sDown) {
      sDown.addEventListener('click', () => {
        const el = getSelectedCustomEl();
        if (!el) return;
        el.scale = Math.max(0.3, Math.round(((Number(el.scale) || 1) - 0.15) * 100) / 100);
        renderCustomElementsList();
        persistState();
      });
    }
    const sUp = document.getElementById('btnCustomElScaleUp');
    if (sUp) {
      sUp.addEventListener('click', () => {
        const el = getSelectedCustomEl();
        if (!el) return;
        el.scale = Math.min(3.5, Math.round(((Number(el.scale) || 1) + 0.15) * 100) / 100);
        renderCustomElementsList();
        persistState();
      });
    }
    const rBtn = document.getElementById('btnCustomElRotate');
    if (rBtn) {
      rBtn.addEventListener('click', () => {
        const el = getSelectedCustomEl();
        if (!el) return;
        el.rotation = ((Number(el.rotation) || 0) + 45) % 360;
        renderCustomElementsList();
        persistState();
      });
    }
    const stBtn = document.getElementById('btnCustomElCycleStyle');
    if (stBtn) {
      stBtn.addEventListener('click', () => {
        const el = getSelectedCustomEl();
        if (el) cycleCustomElementStyle(el.id);
      });
    }
    const dupBtn = document.getElementById('btnCustomElDuplicate');
    if (dupBtn) {
      dupBtn.addEventListener('click', () => {
        const el = getSelectedCustomEl();
        if (el) duplicateCustomElement(el.id);
      });
    }

    const addStoreTopBtn = document.getElementById('btnAddStoreTopTab');
    if (addStoreTopBtn) {
      addStoreTopBtn.addEventListener('click', () => {
        const isTrad = state.posterLang === 'zh-TW';
        state.navModule.topTabs.push(isTrad ? '精選' : '精选');
        renderDynamicNavControls();
        renderPerTextFontList();
        persistState();
        showToast('＋ 已新增顶部内容标签');
      });
    }
    const addStoreBotBtn = document.getElementById('btnAddStoreBotTab');
    if (addStoreBotBtn) {
      addStoreBotBtn.addEventListener('click', () => {
        const isTrad = state.posterLang === 'zh-TW';
        state.navModule.bottomTabs.push({
          id: `b_${Date.now()}`,
          label: isTrad ? '頻道' : '频道',
          iconKey: 'bot_discover',
          customIconKey: null
        });
        renderDynamicNavControls();
        renderPerTextFontList();
        persistState();
        showToast('＋ 已新增底部导航项');
      });
    }
  }

  function addCustomElement(type, opts) {
    if (!Array.isArray(state.customElements)) state.customElements = [];
    const ws = state.activeWorkspace === 'profile' ? 'profile' : 'store';
    const isTrad = state.posterLang === 'zh-TW';
    const conv = (s) => (isTrad && global.LayaPosterLang ? global.LayaPosterLang.convertString(s, true) : s);
    const sameCount = state.customElements.filter((it) => (it.workspace || 'store') === ws).length;

    let baseX = 960 + ((sameCount % 5) - 2) * 38;
    let baseY = 520 + (sameCount % 4) * 34;
    if (ws === 'profile') {
      const sy =
        state.profileCenter && state.profileCenter.viewportMode === 'mobile'
          ? Number(state.profileCenter.scrollY) || 0
          : 0;
      baseX = 540 + ((sameCount % 5) - 2) * 30;
      baseY = sy + 560 + (sameCount % 4) * 34;
    }

    const extra = opts || {};
    const templates = {
      text: { text: conv('✨ 点击修改自由文字'), color: '#ffffff', bgStyle: 'glass', w: 280, h: 68 },
      badge: { text: conv('🎙️ 在线连麦中'), color: '#ffffff', bgStyle: 'purple', w: 220, h: 52 },
      arrow: { text: conv('看这里'), color: '#fb7185', bgStyle: 'red', rotation: -35, w: 160, h: 64 },
      box: { text: conv('重点圈选'), color: '#ffffff', bgStyle: 'red', w: 280, h: 110 },
      image: {
        text: '',
        shape: 'round',
        w: 180,
        h: 180,
        libCategory: extra.libCategory || 'beauties',
        libIndex: extra.libIndex || 0
      }
    };
    const tpl = templates[type] || templates.text;
    const newEl = Object.assign(
      {
        id: `ce_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        workspace: ws,
        type: type || 'text',
        x: baseX,
        y: baseY,
        scale: 1,
        rotation: 0,
        color: '#ffffff',
        bgStyle: 'purple',
        shape: 'round'
      },
      tpl
    );

    state.customElements.push(newEl);
    if (extra.file) {
      loadBlobAsImage(extra.file, (img) => {
        mediaRegistry.customElementImages[newEl.id] = img;
        persistMedia(`customElImg:${newEl.id}`, extra.file);
        renderCustomElementsList();
      });
    }
    renderCustomElementsList();
    renderPerTextFontList();
    persistState();
    showToast(`➕ 已添加自定义${type === 'image' ? '贴纸' : type === 'arrow' ? '指引箭头' : type === 'box' ? '高亮框' : type === 'badge' ? '胶囊标签' : '文字'}（可直接在画布拖动）`);
    return newEl;
  }

  function removeCustomElement(elId) {
    if (!Array.isArray(state.customElements)) return;
    const idx = state.customElements.findIndex((it) => it && it.id === elId);
    if (idx === -1) return;
    state.customElements.splice(idx, 1);
    delete mediaRegistry.customElementImages[elId];
    removePersistedMedia(`customElImg:${elId}`);
    const key = `custom_el_${elId}`;
    if (state.offsets) delete state.offsets[key];
    if (state.fontSizes) delete state.fontSizes[key];
    if (state.hiddenElements) delete state.hiddenElements[key];
    if (interaction && interaction.uiState.selectedBox && interaction.uiState.selectedBox.key === key) {
      interaction.uiState.selectedBox = null;
    }
    updateSelectedElementBar();
    renderHiddenElementsManager();
    renderCustomElementsList();
    renderPerTextFontList();
    persistState();
    showToast('🗑️ 已彻底移除自定义元素');
  }

  function duplicateCustomElement(elId) {
    const src = (state.customElements || []).find((it) => it && it.id === elId);
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = `ce_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    copy.x = (Number(src.x) || 400) + 38;
    copy.y = (Number(src.y) || 300) + 38;
    if (mediaRegistry.customElementImages[src.id]) {
      mediaRegistry.customElementImages[copy.id] = mediaRegistry.customElementImages[src.id];
    }
    state.customElements.push(copy);
    renderCustomElementsList();
    renderPerTextFontList();
    persistState();
    showToast('📋 已复制同款自定义元素');
  }

  function cycleCustomElementStyle(elId) {
    const el = (state.customElements || []).find((it) => it && it.id === elId);
    if (!el) return;
    if (el.type === 'image') {
      const shapes = ['round', 'circle', 'raw'];
      el.shape = shapes[(shapes.indexOf(el.shape || 'round') + 1) % shapes.length];
    } else if (el.type === 'arrow') {
      const cols = ['#fb7185', '#c084fc', '#38bdf8', '#34d399', '#facc15'];
      el.color = cols[(cols.indexOf(el.color || '#fb7185') + 1) % cols.length];
    } else if (el.type === 'box') {
      const bgs = ['red', 'purple', 'pink', 'green'];
      el.bgStyle = bgs[(bgs.indexOf(el.bgStyle || 'red') + 1) % bgs.length];
    } else if (el.type === 'badge') {
      const bgs = ['purple', 'pink', 'green', 'red', 'glass'];
      el.bgStyle = bgs[(bgs.indexOf(el.bgStyle || 'purple') + 1) % bgs.length];
    } else {
      const bgs = ['glass', 'purple', 'pink', 'red', 'none'];
      el.bgStyle = bgs[(bgs.indexOf(el.bgStyle || 'glass') + 1) % bgs.length];
    }
    renderCustomElementsList();
    persistState();
  }

  function renderCustomElementsList() {
    const container = document.getElementById('customElementsEditorList');
    if (!container) return;
    container.innerHTML = '';
    const ws = state.activeWorkspace === 'profile' ? 'profile' : 'store';
    const items = (state.customElements || []).filter((it) => it && (it.workspace || 'store') === ws);
    if (!items.length) {
      const empty = document.createElement('div');
      empty.style.fontSize = '11px';
      empty.style.color = 'rgba(203, 194, 232, 0.6)';
      empty.textContent = '暂无自由添加元素，点上方「＋ 文字/胶囊/箭头/高亮框/贴图」即可加入画布自由摆放';
      container.appendChild(empty);
      return;
    }

    const typeBadges = { text: '📝 文字', badge: '🏷️ 胶囊', arrow: '↗️ 箭头', box: '⭕ 高亮框', image: '🖼️ 贴图' };
    items.forEach((el) => {
      const key = `custom_el_${el.id}`;
      const isHid = Boolean(state.hiddenElements && state.hiddenElements[key]);
      const row = document.createElement('div');
      row.className = 'custom-el-row';
      row.setAttribute('data-ce-id', el.id);
      row.innerHTML = `
        <div class="custom-el-row-top">
          <span class="card-badge">${typeBadges[el.type] || '🧩 元素'} · ${Math.round((Number(el.scale) || 1) * 100)}%</span>
          <div class="custom-el-row-actions">
            <button type="button" class="btn-dark-sm" data-ce="style">样式</button>
            <button type="button" class="btn-dark-sm" data-ce="rot">旋转</button>
            <button type="button" class="btn-dark-sm" data-ce="dup">复制</button>
            <button type="button" class="mini-clear-btn" data-ce="vis">${isHid ? '显示' : '隐藏'}</button>
            <button type="button" class="btn-icon-danger" data-ce="del">删除</button>
          </div>
        </div>
        ${
          el.type !== 'image'
            ? `<input type="text" class="ctrl-input" data-ce="text" value="${escapeHtml(el.text || '')}" placeholder="输入显示文字（留空即不显示）" />`
            : ''
        }
      `;
      const txtInp = row.querySelector('[data-ce="text"]');
      if (txtInp) {
        txtInp.addEventListener('input', () => {
          el.text = txtInp.value;
          persistState();
        });
      }
      row.querySelector('[data-ce="style"]').addEventListener('click', () => cycleCustomElementStyle(el.id));
      row.querySelector('[data-ce="rot"]').addEventListener('click', () => {
        el.rotation = ((Number(el.rotation) || 0) + 45) % 360;
        renderCustomElementsList();
        persistState();
      });
      row.querySelector('[data-ce="dup"]').addEventListener('click', () => duplicateCustomElement(el.id));
      row.querySelector('[data-ce="vis"]').addEventListener('click', () => {
        toggleElementVisibility(key, `${typeBadges[el.type] || '自定义元素'}${el.text ? `「${el.text.slice(0, 8)}」` : ''}`);
        renderCustomElementsList();
      });
      row.querySelector('[data-ce="del"]').addEventListener('click', () => removeCustomElement(el.id));
      container.appendChild(row);
    });
  }

  function syncProfileViewportUI() {
    const isMobile = Boolean(state.profileCenter && state.profileCenter.viewportMode === 'mobile');
    const box = document.getElementById('profScrollControlBox');
    if (box) box.classList.toggle('hidden', !isMobile);
  }

  function bindWorkspaceModeBarEvents() {
    document.querySelectorAll('[data-workspace-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-workspace-mode');
        applyWorkspaceMode(m);
        showToast(m === 'profile' ? '👤 已切换至「个人中心」工作台' : '🏪 已切换至「商店截图生成器」');
      });
    });

    const bPickAv = document.getElementById('btnBarPickAvatar');
    if (bPickAv) bPickAv.addEventListener('click', () => openAvatarLibraryForProfileUser());
    const bAiBg = document.getElementById('btnBarAiBg');
    if (bAiBg) bAiBg.addEventListener('click', handleProfileAiBg);
    const bAiPer = document.getElementById('btnBarAiPersona');
    if (bAiPer) bAiPer.addEventListener('click', handleProfileAiPersona);
    const bAiFeed = document.getElementById('btnBarAiFeedComments');
    if (bAiFeed) bAiFeed.addEventListener('click', () => handleProfileAiFeedComments());
  }

  // ===========================================================================
  // 450+ 离线高清头像库可视化选择弹窗
  // ===========================================================================
  const AVATAR_CAT_META = [
    { key: 'beauties', label: '👩 女生真人' },
    { key: 'guys', label: '👨 男生真人' },
    { key: 'pets', label: '🐾 萌宠' },
    { key: 'vibes', label: '🌄 氛围图' },
    { key: 'anime', label: '🌸 二次元' },
    { key: 'cartoons', label: '🎨 卡通' },
    { key: 'memes', label: '😄 趣味' }
  ];

  let avatarModalCtx = {
    activeCat: 'beauties',
    selectedIdx: 0,
    onSelect: null,
    onUploadFile: null
  };

  function bindAvatarLibraryModal() {
    const modal = document.getElementById('avatarLibraryModal');
    const closeBtn = document.getElementById('btnCloseAvatarLib');
    const randBtn = document.getElementById('btnAvatarLibRandom');
    const upInp = document.getElementById('fileAvatarLibUpload');

    if (closeBtn) closeBtn.addEventListener('click', closeAvatarLibraryModal);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAvatarLibraryModal();
      });
    }
    if (randBtn) {
      randBtn.addEventListener('click', () => {
        const db = global.LAYA_ASIAN_AVATARS || {};
        const arr = db[avatarModalCtx.activeCat] || [];
        if (!arr.length) return;
        const rIdx = Math.floor(Math.random() * arr.length);
        if (typeof avatarModalCtx.onSelect === 'function') {
          avatarModalCtx.onSelect(avatarModalCtx.activeCat, rIdx, arr[rIdx]);
        }
        closeAvatarLibraryModal();
      });
    }
    if (upInp) {
      upInp.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file && typeof avatarModalCtx.onUploadFile === 'function') {
          avatarModalCtx.onUploadFile(file);
        }
        e.target.value = '';
        closeAvatarLibraryModal();
      });
    }
  }

  function closeAvatarLibraryModal() {
    const modal = document.getElementById('avatarLibraryModal');
    if (modal) modal.classList.add('hidden');
  }

  function renderAvatarLibraryModalContent() {
    const catBar = document.getElementById('avatarLibCategoryBar');
    const grid = document.getElementById('avatarLibGrid');
    const db = global.LAYA_ASIAN_AVATARS || {};
    if (!catBar || !grid) return;

    catBar.innerHTML = '';
    AVATAR_CAT_META.forEach((c) => {
      const list = db[c.key] || [];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `pill-radio ${avatarModalCtx.activeCat === c.key ? 'active' : ''}`;
      btn.textContent = `${c.label} (${list.length})`;
      btn.addEventListener('click', () => {
        avatarModalCtx.activeCat = c.key;
        renderAvatarLibraryModalContent();
      });
      catBar.appendChild(btn);
    });

    grid.innerHTML = '';
    const list = db[avatarModalCtx.activeCat] || [];
    list.forEach((src, idx) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `avatar-lib-item ${idx === avatarModalCtx.selectedIdx ? 'active' : ''}`;
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = src;
      img.alt = `${avatarModalCtx.activeCat}_${idx}`;
      item.appendChild(img);
      item.addEventListener('click', () => {
        if (typeof avatarModalCtx.onSelect === 'function') {
          avatarModalCtx.onSelect(avatarModalCtx.activeCat, idx, src);
        }
        closeAvatarLibraryModal();
      });
      grid.appendChild(item);
    });
  }

  function openAvatarLibraryModal(cfg) {
    const modal = document.getElementById('avatarLibraryModal');
    const titleEl = document.getElementById('avatarLibModalTitle');
    if (!modal) return;
    avatarModalCtx.activeCat = cfg.initialCat || 'beauties';
    avatarModalCtx.selectedIdx = Number(cfg.initialIdx) || 0;
    avatarModalCtx.onSelect = cfg.onSelect;
    avatarModalCtx.onUploadFile = cfg.onUploadFile;
    if (titleEl && cfg.title) titleEl.textContent = cfg.title;
    renderAvatarLibraryModalContent();
    modal.classList.remove('hidden');
  }

  function openAvatarLibraryForStoreUser() {
    openAvatarLibraryModal({
      title: '🖼️ 为商店个人名片挑选头像（450+ 离线高清头像库）',
      initialCat: 'beauties',
      initialIdx: 0,
      onSelect: (cat, idx) => {
        const db = global.LAYA_ASIAN_AVATARS || {};
        const arr = db[cat] || db.beauties || [];
        if (!arr.length) return;
        const dataUrl = arr[((Number(idx) || 0) % arr.length + arr.length) % arr.length];
        const blob = dataUrlToBlob(dataUrl);
        if (blob) {
          saveAndApplyImageSlot('userAvatar', blob, 'user_avatar', '👤 已从头像库更新并保存商店同步头像');
        } else {
          const img = new Image();
          img.onload = () => {
            mediaRegistry.userAvatar = img;
            if (state.hiddenElements) {
              delete state.hiddenElements.user_avatar;
              renderHiddenElementsManager();
            }
            persistState();
            showToast('👤 已从头像库更新商店同步头像');
          };
          img.src = dataUrl;
        }
      },
      onUploadFile: (file) => {
        saveAndApplyImageSlot('userAvatar', file, 'user_avatar', '👤 已上传并保存个人同步头像');
      }
    });
  }

  function openAvatarLibraryForProfileUser() {
    const u = state.profileCenter.user;
    openAvatarLibraryModal({
      title: '🖼️ 为个人中心挑选头像（450+ 离线高清头像库）',
      initialCat: u.avatarCategory || 'beauties',
      initialIdx: u.avatarIndex || 0,
      onSelect: (cat, idx) => {
        mediaRegistry.profAvatar = null;
        removePersistedMedia('profAvatar');
        u.avatarCategory = cat;
        u.avatarIndex = idx;
        refreshProfileAvatarPreview();
        persistState();
        showToast('👤 已从头像库更新个人中心头像');
      },
      onUploadFile: (file) => {
        loadBlobAsImage(file, (img) => {
          mediaRegistry.profAvatar = img;
          persistMedia('profAvatar', file);
          refreshProfileAvatarPreview();
          showToast('👤 已上传并保存自定义头像');
        });
      }
    });
  }

  function refreshProfileAvatarPreview() {
    const prev = document.getElementById('profAvatarPreviewImg');
    if (!prev || !state.profileCenter) return;
    if (mediaRegistry.profAvatar && mediaRegistry.profAvatar.src) {
      prev.src = mediaRegistry.profAvatar.src;
      return;
    }
    const db = global.LAYA_ASIAN_AVATARS || {};
    const u = state.profileCenter.user || {};
    const arr = db[u.avatarCategory] || db.beauties || [];
    if (arr.length) {
      const idx = ((Number(u.avatarIndex) || 0) % arr.length + arr.length) % arr.length;
      prev.src = arr[idx];
    }
  }

  // ===========================================================================
  // 个人中心面板控制与事件绑定
  // ===========================================================================
  function bindProfileControlEvents() {
    const btnOpenLib = document.getElementById('btnOpenAvatarLibMain');
    if (btnOpenLib) btnOpenLib.addEventListener('click', openAvatarLibraryForProfileUser);

    const btnRandAv = document.getElementById('btnRandProfAvatar');
    if (btnRandAv) {
      btnRandAv.addEventListener('click', () => {
        const picked = global.LayaProfileCenter.pickRandomAvatarFromLibrary(state.profileCenter.aiGenderPref || 'any');
        mediaRegistry.profAvatar = null;
        removePersistedMedia('profAvatar');
        state.profileCenter.user.avatarCategory = picked.category;
        state.profileCenter.user.avatarIndex = picked.index;
        refreshProfileAvatarPreview();
        persistState();
        showToast('🎲 已从头像库随机更换头像');
      });
    }

    const fileProfAv = document.getElementById('fileProfAvatar');
    if (fileProfAv) {
      fileProfAv.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        loadBlobAsImage(file, (img) => {
          mediaRegistry.profAvatar = img;
          persistMedia('profAvatar', file);
          refreshProfileAvatarPreview();
          showToast('👤 已上传并保存个人中心头像');
        });
        e.target.value = '';
      });
    }

    const btnResetAv = document.getElementById('btnResetProfAvatar');
    if (btnResetAv) {
      btnResetAv.addEventListener('click', () => {
        mediaRegistry.profAvatar = null;
        removePersistedMedia('profAvatar');
        refreshProfileAvatarPreview();
        showToast('已切换回头像库头像');
      });
    }

    const fileProfBg = document.getElementById('fileProfBg');
    if (fileProfBg) {
      fileProfBg.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        loadBlobAsImage(file, (img) => {
          mediaRegistry.profileBg = img;
          state.profileCenter.header.bgStyle = 'custom';
          persistMedia('profileBg', file);
          syncStaticInputsFromState();
          persistState();
          showToast('🖼️ 已上传并保存个人主页背景图');
        });
        e.target.value = '';
      });
    }

    const btnNextVibe = document.getElementById('btnNextProfVibe');
    if (btnNextVibe) {
      btnNextVibe.addEventListener('click', () => {
        mediaRegistry.profileBg = null;
        removePersistedMedia('profileBg');
        const vibes = (global.LAYA_ASIAN_AVATARS && global.LAYA_ASIAN_AVATARS.vibes) || [];
        const cur = Number(state.profileCenter.header.vibeIndex) || 0;
        state.profileCenter.header.vibeIndex = vibes.length ? (cur + 1) % vibes.length : 0;
        state.profileCenter.header.bgStyle = 'vibe-photo';
        syncStaticInputsFromState();
        persistState();
        showToast('🌄 已切换内置氛围背景图');
      });
    }

    const btnResetBg = document.getElementById('btnResetProfBg');
    if (btnResetBg) {
      btnResetBg.addEventListener('click', () => {
        mediaRegistry.profileBg = null;
        removePersistedMedia('profileBg');
        state.profileCenter.header.bgStyle = 'portrait-glow';
        syncStaticInputsFromState();
        persistState();
        showToast('已恢复默认柔光虚化背景');
      });
    }

    const btnAiBg = document.getElementById('btnProfAiBg');
    if (btnAiBg) btnAiBg.addEventListener('click', handleProfileAiBg);

    const btnAiPersona = document.getElementById('btnProfAiPersona');
    if (btnAiPersona) btnAiPersona.addEventListener('click', handleProfileAiPersona);

    const btnAiFeed = document.getElementById('btnProfAiFeedComments');
    if (btnAiFeed) btnAiFeed.addEventListener('click', () => handleProfileAiFeedComments());

    const batchInput = document.getElementById('fileProfBatchMedia');
    if (batchInput) {
      batchInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length) handleBatchProfMediaUpload(files);
        e.target.value = '';
      });
    }

    const btnAddPost = document.getElementById('btnAddProfPost');
    if (btnAddPost) {
      btnAddPost.addEventListener('click', () => {
        const pc = state.profileCenter;
        const p = createBlankProfPost(pc.posts.length + 1);
        pc.posts.push(p);
        renderProfilePostsEditor();
        renderPerTextFontList();
        persistState();
        showToast(`＋ 已新增作品卡片 ${pc.posts.length}`);
      });
    }

    const btnAddCmt = document.getElementById('btnAddProfComment');
    if (btnAddCmt) {
      btnAddCmt.addEventListener('click', () => {
        const pc = state.profileCenter;
        const av = global.LayaProfileCenter.pickRandomAvatarFromLibrary('male');
        const locStr =
          global.LayaDefaults && typeof global.LayaDefaults.rollRandomFieldValue === 'function'
            ? global.LayaDefaults.rollRandomFieldValue('commentMeta', '', state) || '刚刚 · 台北'
            : '刚刚 · 台北';
        pc.commentSection.items.push({
          id: `c_${Date.now()}`,
          nickname: '热心网友',
          avatarCategory: av.category,
          avatarIndex: av.index,
          text: '刚看完你的新动态，这氛围感也太棒了吧！',
          timeLoc: locStr,
          likes: String(Math.floor(Math.random() * 90 + 12)),
          authorReply: ''
        });
        renderProfileCommentsEditor();
        renderPerTextFontList();
        persistState();
        showToast('＋ 已新增一条互动评论');
      });
    }

    const btnAddExtraBadge = document.getElementById('btnAddProfExtraBadge');
    if (btnAddExtraBadge) {
      btnAddExtraBadge.addEventListener('click', () => {
        const u = state.profileCenter.user;
        if (!Array.isArray(u.extraBadges)) u.extraBadges = [];
        const isTrad = state.posterLang === 'zh-TW';
        u.extraBadges.push({
          id: `eb_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          text: isTrad ? '✨ 聲音認證' : '✨ 声音认证',
          style: 'purple'
        });
        renderProfileExtraBadgesEditor();
        renderPerTextFontList();
        persistState();
        showToast('＋ 已新增个性身份徽章');
      });
    }

    const btnAddStat = document.getElementById('btnAddProfStat');
    if (btnAddStat) {
      btnAddStat.addEventListener('click', () => {
        const list = state.profileCenter.stats.items;
        const isTrad = state.posterLang === 'zh-TW';
        list.push({
          id: `st_${Date.now()}`,
          num: '999',
          label: isTrad ? '人氣值' : '人气值'
        });
        renderProfileStatsEditor();
        renderPerTextFontList();
        persistState();
        showToast('＋ 已新增统计数据项');
      });
    }

    const btnAddProfTab = document.getElementById('btnAddProfTab');
    if (btnAddProfTab) {
      btnAddProfTab.addEventListener('click', () => {
        const isTrad = state.posterLang === 'zh-TW';
        state.profileCenter.contentTabs.tabs.push(isTrad ? '精選' : '精选');
        renderProfileTabsEditor();
        renderPerTextFontList();
        persistState();
        showToast('＋ 已新增内容分区标签');
      });
    }

    const btnAddProfBotTab = document.getElementById('btnAddProfBotTab');
    if (btnAddProfBotTab) {
      btnAddProfBotTab.addEventListener('click', () => {
        const isTrad = state.posterLang === 'zh-TW';
        state.profileCenter.bottomNav.tabs.push({
          id: `pbn_${Date.now()}`,
          label: isTrad ? '頻道' : '频道',
          assetActive: 'tab_1',
          assetInactive: 'tab_1-1',
          badge: ''
        });
        renderProfileBottomNavEditor();
        renderPerTextFontList();
        persistState();
        showToast('＋ 已新增底部导航项');
      });
    }
  }

  function createBlankProfPost(numIdx) {
    const isTrad = state.posterLang === 'zh-TW';
    const conv = (s) => (isTrad && global.LayaPosterLang ? global.LayaPosterLang.convertString(s, true) : s);
    const ratios = ['3:4', '4:5', '1:1'];
    return {
      id: `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      mediaType: 'default',
      defaultVibeIndex: numIdx % 22,
      aspectRatio: ratios[numIdx % ratios.length],
      pinBadge: '',
      showPlayIcon: false,
      overlayTitle: '',
      watchedTag: '',
      title: conv(`今日份动态分享 #${numIdx} ✨`),
      hotComment: conv('💬 网友热评：这状态直接拉满！'),
      publishTime: conv('刚刚'),
      likes: String(Math.floor(Math.random() * 400 + 40)),
      mediaName: '内置氛围封面'
    };
  }

  function renderProfilePanelEditors() {
    if (!state.profileCenter) return;
    refreshProfileAvatarPreview();
    renderProfileExtraBadgesEditor();
    renderProfileStatsEditor();
    renderProfileTabsEditor();
    renderProfilePostsEditor();
    renderProfileCommentsEditor();
    renderProfileBottomNavEditor();
  }

  function renderProfileExtraBadgesEditor() {
    const container = document.getElementById('profExtraBadgesList');
    if (!container || !state.profileCenter || !state.profileCenter.user) return;
    container.innerHTML = '';
    const list = state.profileCenter.user.extraBadges || [];
    list.forEach((b, idx) => {
      if (!b || !b.id) return;
      const hidKey = `prof_extra_badge_${b.id}`;
      const isHid = Boolean(state.hiddenElements && state.hiddenElements[hidKey]);
      const row = document.createElement('div');
      row.className = 'inline-item-row';
      row.innerHTML = `
        <input type="text" class="ctrl-input" data-part="text" value="${escapeHtml(b.text || '')}" placeholder="徽章文字" />
        <select class="ctrl-select" data-part="style" style="width:74px;flex:0 0 74px;padding:4px 6px;font-size:11px;">
          <option value="purple" ${b.style === 'purple' ? 'selected' : ''}>紫标</option>
          <option value="pink" ${b.style === 'pink' ? 'selected' : ''}>粉标</option>
          <option value="blue" ${b.style === 'blue' ? 'selected' : ''}>蓝标</option>
          <option value="glass" ${b.style === 'glass' ? 'selected' : ''}>玻璃</option>
        </select>
        <button type="button" class="mini-clear-btn" data-act="vis">${isHid ? '显示' : '隐藏'}</button>
        <button type="button" class="btn-icon-danger" data-act="del">删</button>
      `;
      row.querySelector('[data-part="text"]').addEventListener('input', (e) => {
        b.text = e.target.value;
        persistState();
      });
      row.querySelector('[data-part="style"]').addEventListener('change', (e) => {
        b.style = e.target.value;
        persistState();
      });
      row.querySelector('[data-act="vis"]').addEventListener('click', () => {
        toggleElementVisibility(hidKey, `个性徽章：${b.text || idx + 1}`);
        renderProfileExtraBadgesEditor();
      });
      row.querySelector('[data-act="del"]').addEventListener('click', () => {
        list.splice(idx, 1);
        if (state.hiddenElements) delete state.hiddenElements[hidKey];
        if (state.offsets) delete state.offsets[hidKey];
        renderHiddenElementsManager();
        renderProfileExtraBadgesEditor();
        renderPerTextFontList();
        persistState();
      });
      container.appendChild(row);
    });
  }

  function renderProfileStatsEditor() {
    const container = document.getElementById('profStatsEditorList');
    if (!container || !state.profileCenter) return;
    container.innerHTML = '';
    const items = (state.profileCenter.stats && state.profileCenter.stats.items) || [];
    items.forEach((st, idx) => {
      const canDel = items.length > 1;
      const row = document.createElement('div');
      row.className = 'inline-item-row';
      row.setAttribute('data-stat-idx', String(idx));
      row.innerHTML = `
        <input type="text" class="ctrl-input" data-part="num" value="${escapeHtml(st.num)}" placeholder="数值" style="max-width:96px;font-weight:700;" />
        <button type="button" class="field-dice-btn" data-dice-stat="num" title="随机数值" style="margin-left:0;">🎲</button>
        <input type="text" class="ctrl-input" data-part="label" value="${escapeHtml(st.label)}" placeholder="标签词" />
        ${canDel ? '<button type="button" class="btn-icon-danger" data-act="delStat">删</button>' : ''}
      `;
      row.querySelector('[data-part="num"]').addEventListener('input', (e) => {
        st.num = e.target.value;
        persistState();
      });
      row.querySelector('[data-dice-stat="num"]').addEventListener('click', () => {
        if (!global.LayaDefaults || !global.LayaDefaults.rollRandomFieldValue) return;
        const nv = global.LayaDefaults.rollRandomFieldValue('likes', st.num, state);
        st.num = nv;
        row.querySelector('[data-part="num"]').value = nv;
        persistState();
        requestStageRender();
      });
      row.querySelector('[data-part="label"]').addEventListener('input', (e) => {
        st.label = e.target.value;
        persistState();
      });
      const delBtn = row.querySelector('[data-act="delStat"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          items.splice(idx, 1);
          renderProfileStatsEditor();
          renderPerTextFontList();
          persistState();
        });
      }
      container.appendChild(row);
    });
  }

  function renderProfileTabsEditor() {
    const container = document.getElementById('profTabsEditorList');
    if (!container || !state.profileCenter) return;
    container.innerHTML = '';
    const ct = state.profileCenter.contentTabs;
    (ct.tabs || []).forEach((lbl, idx) => {
      const isAct = idx === Number(ct.activeIndex);
      const hidKey = `prof_tab_${idx}`;
      const isHid = Boolean(state.hiddenElements && state.hiddenElements[hidKey]);
      const canDel = ct.tabs.length > 1;
      const row = document.createElement('div');
      row.className = 'inline-item-row';
      row.innerHTML = `
        <button type="button" class="pill-radio ${isAct ? 'active' : ''}">${isAct ? '★ 高亮' : '设高亮'}</button>
        <input type="text" class="ctrl-input" value="${escapeHtml(lbl)}" />
        <button type="button" class="mini-clear-btn">${isHid ? '显示' : '隐藏'}</button>
        ${canDel ? '<button type="button" class="btn-icon-danger" data-act="delProfTab">删</button>' : ''}
      `;
      row.querySelector('.pill-radio').addEventListener('click', () => {
        ct.activeIndex = idx;
        renderProfileTabsEditor();
        persistState();
      });
      row.querySelector('input').addEventListener('input', (e) => {
        ct.tabs[idx] = e.target.value;
        persistState();
      });
      row.querySelector('.mini-clear-btn').addEventListener('click', () => {
        toggleElementVisibility(hidKey, `分区标签：${lbl}`);
      });
      const delBtn = row.querySelector('[data-act="delProfTab"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          ct.tabs.splice(idx, 1);
          if (ct.activeIndex >= ct.tabs.length) {
            ct.activeIndex = Math.max(0, ct.tabs.length - 1);
          }
          renderProfileTabsEditor();
          renderPerTextFontList();
          persistState();
        });
      }
      container.appendChild(row);
    });
  }

  function renderProfilePostsEditor() {
    const container = document.getElementById('profPostsEditorList');
    if (!container || !state.profileCenter) return;
    container.innerHTML = '';
    const posts = state.profileCenter.posts || [];
    const hid = state.hiddenElements || {};

    posts.forEach((post, idx) => {
      const entry = mediaRegistry.profCardMedia[post.id];
      const isVideo = entry && entry.type === 'video';
      const isImage = entry && entry.type === 'image';
      const hasLibCover = Boolean(!entry && post.coverCategory);
      const isHidden = Boolean(hid[`prof_post_${post.id}`]);

      const box = document.createElement('div');
      box.className = 'feed-card-editor';
      box.setAttribute('data-post-id', post.id);
      box.innerHTML = `
        <div class="feed-card-editor-head">
          <span class="card-badge">作品 ${idx + 1}</span>
          <div class="card-head-actions">
            <span class="media-type-pill ${isVideo ? 'is-video' : ''}">
              ${isVideo ? '🎬 视频' : isImage ? '🖼️ 图片' : hasLibCover ? '🖼️ 图库图' : '🌄 氛围图'}
            </span>
            <button type="button" class="btn-dark-sm" data-act="moveUp" ${idx === 0 ? 'disabled' : ''} title="上移顺序">↑</button>
            <button type="button" class="btn-dark-sm" data-act="moveDown" ${idx === posts.length - 1 ? 'disabled' : ''} title="下移顺序">↓</button>
            <button type="button" class="btn-dark-sm" data-act="aiOne" title="让 AI 根据当前画面重生成标题和评论">🤖 AI写词</button>
            <button type="button" class="btn-icon-danger" data-act="hide">${isHidden ? '恢复' : '隐藏'}</button>
            ${posts.length > 1 ? '<button type="button" class="btn-icon-danger" data-act="del">删除</button>' : ''}
          </div>
        </div>

        <div class="upload-bar-row">
          <label class="btn-purple-outline full-upload-label">
            📁 上传视频或图片
            <input type="file" accept="video/mp4,video/webm,video/quicktime,image/*" hidden data-act="upload" />
          </label>
          <button type="button" class="btn-dark-sm" data-act="pickLibCover" title="从 450+ 离线高清图片库挑选封面">🖼️ 图库</button>
          <select class="ctrl-select" data-field="aspectRatio" style="width:auto;font-size:11px;padding:4px 8px;">
            <option value="auto" ${post.aspectRatio === 'auto' ? 'selected' : ''}>原片比例</option>
            <option value="3:4" ${post.aspectRatio === '3:4' ? 'selected' : ''}>3:4 竖图</option>
            <option value="4:5" ${post.aspectRatio === '4:5' ? 'selected' : ''}>4:5 竖图</option>
            <option value="1:1" ${post.aspectRatio === '1:1' ? 'selected' : ''}>1:1 方图</option>
            <option value="9:16" ${post.aspectRatio === '9:16' ? 'selected' : ''}>9:16 长竖</option>
            <option value="4:3" ${post.aspectRatio === '4:3' ? 'selected' : ''}>4:3 横图</option>
          </select>
          ${entry || hasLibCover ? '<button type="button" class="btn-dark-sm" data-act="clearMedia">默认图</button>' : ''}
        </div>

        ${
          isVideo
            ? `<div class="video-mini-controls">
                 <button type="button" class="btn-dark-sm" data-act="playPause">${entry.el.paused ? '▶ 播放' : '⏸ 暂停'}</button>
                 <button type="button" class="btn-dark-sm" data-act="muteToggle">${entry.el.muted ? '🔇 静音' : '🔊 原声'}</button>
                 <span class="video-file-hint" title="${escapeHtml(post.mediaName)}">${escapeHtml(post.mediaName)}</span>
               </div>`
            : ''
        }

        <div class="field-group">
          <label class="field-label"><span>作品标题文案（可由 AI 识别画面生成）</span><button type="button" class="field-dice-btn" data-dice-post="title" data-pool="footerTitle" title="随机标题">🎲</button></label>
          <textarea class="ctrl-textarea" rows="2" data-field="title">${escapeHtml(post.title || '')}</textarea>
        </div>

        <div class="field-group">
          <label class="field-label"><span>卡片下方热评摘要</span><button type="button" class="field-dice-btn" data-dice-post="hotComment" data-pool="commentText" title="随机热评">🎲</button></label>
          <input type="text" class="ctrl-input" data-field="hotComment" value="${escapeHtml(post.hotComment || '')}" />
        </div>

        <div class="grid-3-col">
          <div class="field-group">
            <label class="field-label"><span>左上角标</span><button type="button" class="field-dice-btn" data-dice-post="pinBadge" data-pool="pinBadge" title="随机角标">🎲</button></label>
            <input type="text" class="ctrl-input" data-field="pinBadge" value="${escapeHtml(post.pinBadge || '')}" placeholder="如：置顶" />
          </div>
          <div class="field-group">
            <label class="field-label"><span>发布时间</span><button type="button" class="field-dice-btn" data-dice-post="publishTime" data-pool="publishTime" title="随机时间">🎲</button></label>
            <input type="text" class="ctrl-input" data-field="publishTime" value="${escapeHtml(post.publishTime || '')}" />
          </div>
          <div class="field-group">
            <label class="field-label"><span>♡ 点赞数</span><button type="button" class="field-dice-btn" data-dice-post="likes" data-pool="likes" title="随机赞数">🎲</button></label>
            <input type="text" class="ctrl-input" data-field="likes" value="${escapeHtml(post.likes || '')}" />
          </div>
        </div>

        <div class="grid-2-col">
          <div class="field-group">
            <label class="field-label"><span>画面可选花字</span><button type="button" class="field-dice-btn" data-dice-post="overlayTitle" data-pool="overlayTitle" title="随机花字">🎲</button></label>
            <input type="text" class="ctrl-input" data-field="overlayTitle" value="${escapeHtml(post.overlayTitle || '')}" placeholder="留空更干净" />
          </div>
          <div class="field-group">
            <label class="field-label"><span>底栏状态标签</span><button type="button" class="field-dice-btn" data-dice-post="watchedTag" data-pool="watchedTag" title="随机状态">🎲</button></label>
            <input type="text" class="ctrl-input" data-field="watchedTag" value="${escapeHtml(post.watchedTag || '')}" placeholder="如：刚刚看过" />
          </div>
        </div>

        <div class="field-group">
          <label class="field-label"><span>卡片作者名（关闭同步后生效）</span><button type="button" class="field-dice-btn" data-dice-post="customAuthor" data-pool="nickname" title="随机作者名">🎲</button></label>
          <input type="text" class="ctrl-input" data-field="customAuthor" value="${escapeHtml(post.customAuthor || '')}" placeholder="留空或同步时跟随主页昵称" />
        </div>

        <label class="chk-pill" style="padding:5px 8px;font-size:11px;">
          <input type="checkbox" data-check="showPlayIcon" ${post.showPlayIcon ? 'checked' : ''} />
          右上角显示 ▶ 视频角标（上传视频自动勾选）
        </label>
      `;

      box.querySelectorAll('[data-field]').forEach((el) => {
        const f = el.getAttribute('data-field');
        const evt = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evt, () => {
          post[f] = el.value;
          persistState();
        });
      });

      box.querySelectorAll('[data-dice-post]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const f = btn.getAttribute('data-dice-post');
          const pool = btn.getAttribute('data-pool') || f;
          if (!global.LayaDefaults || !global.LayaDefaults.rollRandomFieldValue) return;
          let nv = global.LayaDefaults.rollRandomFieldValue(pool, post[f], state);
          if (f === 'hotComment' && nv && !nv.startsWith('💬')) {
            nv = `💬 热评：${nv}`;
          }
          post[f] = nv;
          const inp = box.querySelector(`[data-field="${f}"]`);
          if (inp) inp.value = nv;
          persistState();
          requestStageRender();
        });
      });

      const playChk = box.querySelector('[data-check="showPlayIcon"]');
      if (playChk) {
        playChk.addEventListener('change', () => {
          post.showPlayIcon = playChk.checked;
          persistState();
        });
      }

      box.querySelector('[data-act="upload"]').addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (f) {
          delete post.coverCategory;
          delete post.coverIndex;
          handleProfPostMediaUpload(post, f);
        }
        e.target.value = '';
      });

      box.querySelector('[data-act="pickLibCover"]').addEventListener('click', () => {
        openAvatarLibraryModal({
          title: `🖼️ 为作品 ${idx + 1} 挑选图库封面（450+ 人像库）`,
          initialCat: post.coverCategory || 'beauties',
          initialIdx: post.coverIndex || 0,
          onSelect: (cat, libIdx) => {
            disposeProfPostMedia(post.id);
            removePersistedMedia(`profCardMedia:${post.id}`);
            post.coverCategory = cat;
            post.coverIndex = libIdx;
            post.mediaType = 'image';
            post.mediaName = `图库精选_${Number(libIdx) + 1}`;
            post.showPlayIcon = false;
            renderProfilePostsEditor();
            updateExportModeHint();
            persistState();
            showToast(`🖼️ 已为作品 ${idx + 1} 更换图库封面`);
          },
          onUploadFile: (file) => {
            delete post.coverCategory;
            delete post.coverIndex;
            handleProfPostMediaUpload(post, file);
          }
        });
      });

      box.querySelector('[data-act="moveUp"]').addEventListener('click', () => {
        if (idx <= 0) return;
        const tmp = posts[idx - 1];
        posts[idx - 1] = posts[idx];
        posts[idx] = tmp;
        renderProfilePostsEditor();
        renderPerTextFontList();
        persistState();
      });

      box.querySelector('[data-act="moveDown"]').addEventListener('click', () => {
        if (idx >= posts.length - 1) return;
        const tmp = posts[idx + 1];
        posts[idx + 1] = posts[idx];
        posts[idx] = tmp;
        renderProfilePostsEditor();
        renderPerTextFontList();
        persistState();
      });

      const clrBtn = box.querySelector('[data-act="clearMedia"]');
      if (clrBtn) {
        clrBtn.addEventListener('click', () => {
          disposeProfPostMedia(post.id);
          removePersistedMedia(`profCardMedia:${post.id}`);
          delete post.coverCategory;
          delete post.coverIndex;
          post.mediaType = 'default';
          post.mediaName = '内置氛围封面';
          post.showPlayIcon = false;
          renderProfilePostsEditor();
          updateExportModeHint();
          persistState();
        });
      }

      const ppBtn = box.querySelector('[data-act="playPause"]');
      if (ppBtn) ppBtn.addEventListener('click', () => toggleCardVideoPlayback(`prof:${post.id}`));

      const mtBtn = box.querySelector('[data-act="muteToggle"]');
      if (mtBtn && isVideo) {
        mtBtn.addEventListener('click', () => {
          entry.el.muted = !entry.el.muted;
          renderProfilePostsEditor();
        });
      }

      box.querySelector('[data-act="aiOne"]').addEventListener('click', () => {
        handleProfileAiFeedComments([post.id]);
      });

      box.querySelector('[data-act="hide"]').addEventListener('click', () => {
        toggleElementVisibility(`prof_post_${post.id}`, `作品卡片 ${idx + 1}`);
      });

      const delBtn = box.querySelector('[data-act="del"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          disposeProfPostMedia(post.id);
          removePersistedMedia(`profCardMedia:${post.id}`);
          posts.splice(idx, 1);
          renderProfilePostsEditor();
          renderPerTextFontList();
          updateExportModeHint();
          persistState();
        });
      }

      container.appendChild(box);
    });
  }

  function renderProfileCommentsEditor() {
    const container = document.getElementById('profCommentsEditorList');
    if (!container || !state.profileCenter) return;
    container.innerHTML = '';
    const items = (state.profileCenter.commentSection && state.profileCenter.commentSection.items) || [];
    const db = global.LAYA_ASIAN_AVATARS || {};

    items.forEach((cm, idx) => {
      const customAv = mediaRegistry.profCommentAvatars[cm.id];
      const arr = db[cm.avatarCategory] || db.guys || db.beauties || [];
      const libSrc = arr.length ? arr[((Number(cm.avatarIndex) || 0) % arr.length + arr.length) % arr.length] : '';
      const avSrc = (customAv && customAv.src) || libSrc;

      const box = document.createElement('div');
      box.className = 'feed-card-editor';
      box.setAttribute('data-cmt-id', cm.id);
      box.innerHTML = `
        <div class="feed-card-editor-head">
          <div style="display:flex;align-items:center;gap:8px;">
            <img src="${avSrc}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid #c084fc;" alt="" />
            <span class="card-badge">评论 ${idx + 1}</span>
          </div>
          <div class="card-head-actions">
            <button type="button" class="btn-dark-sm" data-act="pickAv">🖼️ 选头像</button>
            <button type="button" class="btn-icon-danger" data-act="del">删除</button>
          </div>
        </div>
        <div class="grid-3-col">
          <div class="field-group">
            <label class="field-label"><span>昵称</span><button type="button" class="field-dice-btn" data-dice-cmt="nickname" data-pool="nickname" title="随机昵称">🎲</button></label>
            <input type="text" class="ctrl-input" data-field="nickname" value="${escapeHtml(cm.nickname || '')}" />
          </div>
          <div class="field-group">
            <label class="field-label"><span>时间属地</span><button type="button" class="field-dice-btn" data-dice-cmt="timeLoc" data-pool="commentMeta" title="随机时间属地">🎲</button></label>
            <input type="text" class="ctrl-input" data-field="timeLoc" value="${escapeHtml(cm.timeLoc || '')}" />
          </div>
          <div class="field-group">
            <label class="field-label"><span>赞数</span><button type="button" class="field-dice-btn" data-dice-cmt="likes" data-pool="likes" title="随机赞数">🎲</button></label>
            <input type="text" class="ctrl-input" data-field="likes" value="${escapeHtml(cm.likes || '')}" />
          </div>
        </div>
        <div class="field-group">
          <label class="field-label"><span>评论正文</span><button type="button" class="field-dice-btn" data-dice-cmt="text" data-pool="commentText" title="随机评论">🎲</button></label>
          <textarea class="ctrl-textarea" rows="2" data-field="text">${escapeHtml(cm.text || '')}</textarea>
        </div>
        <div class="field-group">
          <label class="field-label"><span>作者回复（留空不显示）</span><button type="button" class="field-dice-btn" data-dice-cmt="authorReply" data-pool="commentReply" title="随机回复">🎲</button></label>
          <input type="text" class="ctrl-input" data-field="authorReply" value="${escapeHtml(cm.authorReply || '')}" placeholder="输入作者回复..." />
        </div>
      `;

      box.querySelectorAll('[data-field]').forEach((el) => {
        const f = el.getAttribute('data-field');
        el.addEventListener('input', () => {
          cm[f] = el.value;
          persistState();
        });
      });

      box.querySelectorAll('[data-dice-cmt]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const f = btn.getAttribute('data-dice-cmt');
          const pool = btn.getAttribute('data-pool') || f;
          if (!global.LayaDefaults || !global.LayaDefaults.rollRandomFieldValue) return;
          const nv = global.LayaDefaults.rollRandomFieldValue(pool, cm[f], state);
          cm[f] = nv;
          const inp = box.querySelector(`[data-field="${f}"]`);
          if (inp) inp.value = nv;
          persistState();
          requestStageRender();
        });
      });

      box.querySelector('[data-act="pickAv"]').addEventListener('click', () => {
        openAvatarLibraryModal({
          title: `🖼️ 为评论 ${idx + 1} 挑选头像`,
          initialCat: cm.avatarCategory || 'guys',
          initialIdx: cm.avatarIndex || 0,
          onSelect: (cat, avIdx) => {
            delete mediaRegistry.profCommentAvatars[cm.id];
            removePersistedMedia(`profCmtAv:${cm.id}`);
            cm.avatarCategory = cat;
            cm.avatarIndex = avIdx;
            renderProfileCommentsEditor();
            persistState();
          },
          onUploadFile: (file) => {
            loadBlobAsImage(file, (img) => {
              mediaRegistry.profCommentAvatars[cm.id] = img;
              persistMedia(`profCmtAv:${cm.id}`, file);
              renderProfileCommentsEditor();
            });
          }
        });
      });

      box.querySelector('[data-act="del"]').addEventListener('click', () => {
        delete mediaRegistry.profCommentAvatars[cm.id];
        removePersistedMedia(`profCmtAv:${cm.id}`);
        items.splice(idx, 1);
        renderProfileCommentsEditor();
        renderPerTextFontList();
        persistState();
      });

      container.appendChild(box);
    });
  }

  function renderProfileBottomNavEditor() {
    const container = document.getElementById('profBottomNavEditorList');
    if (!container || !state.profileCenter) return;
    container.innerHTML = '';
    const bNav = state.profileCenter.bottomNav || {};
    (bNav.tabs || []).forEach((tab, idx) => {
      const isAct = idx === Number(bNav.activeIndex);
      const canDel = bNav.tabs.length > 1;
      const row = document.createElement('div');
      row.className = 'inline-item-row';
      row.innerHTML = `
        <button type="button" class="pill-radio ${isAct ? 'active' : ''}">${isAct ? '★ 高亮' : '设高亮'}</button>
        <input type="text" class="ctrl-input" data-role="label" value="${escapeHtml(tab.label || '')}" placeholder="标签名" />
        <input type="text" class="ctrl-input" data-role="badge" value="${escapeHtml(tab.badge || '')}" placeholder="角标(如99+)" style="width:76px;flex:0 0 76px;" />
        ${canDel ? '<button type="button" class="btn-icon-danger" data-act="delBotTab">删</button>' : ''}
      `;
      row.querySelector('.pill-radio').addEventListener('click', () => {
        bNav.activeIndex = idx;
        renderProfileBottomNavEditor();
        persistState();
      });
      row.querySelector('[data-role="label"]').addEventListener('input', (e) => {
        tab.label = e.target.value;
        persistState();
      });
      row.querySelector('[data-role="badge"]').addEventListener('input', (e) => {
        tab.badge = e.target.value;
        persistState();
      });
      const delBtn = row.querySelector('[data-act="delBotTab"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          bNav.tabs.splice(idx, 1);
          if (bNav.activeIndex >= bNav.tabs.length) {
            bNav.activeIndex = Math.max(0, bNav.tabs.length - 1);
          }
          renderProfileBottomNavEditor();
          renderPerTextFontList();
          persistState();
        });
      }
      container.appendChild(row);
    });
  }

  function mountProfPostMediaBlob(post, blobOrFile, displayName, shouldSaveToDB) {
    disposeProfPostMedia(post.id);
    const url = URL.createObjectURL(blobOrFile);
    const mime = blobOrFile.type || '';

    return new Promise((resolve) => {
      if (mime.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = url;
        video.playsInline = true;
        video.loop = true;
        video.muted = false;
        video.preload = 'auto';

        const onReady = () => {
          video.play().catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
          renderProfilePostsEditor();
          updateExportModeHint();
          requestStageRender();
          resolve(post.id);
        };
        video.addEventListener('loadeddata', onReady, { once: true });
        video.addEventListener('error', () => resolve(post.id), { once: true });
        video.addEventListener('play', () => {
          renderProfilePostsEditor();
          requestStageRender();
        });
        video.addEventListener('pause', () => {
          renderProfilePostsEditor();
          requestStageRender();
        });

        mediaRegistry.profCardMedia[post.id] = { type: 'video', el: video, url };
        post.mediaType = 'video';
        post.mediaName = displayName;
        post.showPlayIcon = true;
        post.aspectRatio = 'auto';
        if (shouldSaveToDB) {
          persistMedia(`profCardMedia:${post.id}`, blobOrFile, { fileName: displayName });
          persistState();
          showToast(`🎬 已载入视频「${displayName}」`);
        }
      } else {
        const img = new Image();
        img.onload = () => {
          mediaRegistry.profCardMedia[post.id] = { type: 'image', el: img, url };
          post.mediaType = 'image';
          post.mediaName = displayName;
          post.showPlayIcon = false;
          post.aspectRatio = 'auto';
          renderProfilePostsEditor();
          updateExportModeHint();
          requestStageRender();
          if (shouldSaveToDB) {
            persistMedia(`profCardMedia:${post.id}`, blobOrFile, { fileName: displayName });
            persistState();
            showToast(`🖼️ 已载入图片「${displayName}」`);
          }
          resolve(post.id);
        };
        img.onerror = () => resolve(post.id);
        img.src = url;
      }
    });
  }

  function handleProfPostMediaUpload(post, file) {
    mountProfPostMediaBlob(post, file, file.name || '上传媒体', true).then((pid) => {
      if (state.profileCenter && state.profileCenter.autoAiOnUpload) {
        scheduleAutoAiForUploadedPosts([pid]);
      }
    });
  }

  async function handleBatchProfMediaUpload(files) {
    const pc = state.profileCenter;
    const valid = files.filter((f) => f.type.startsWith('video/') || f.type.startsWith('image/'));
    if (!valid.length) return;

    const uploadedIds = [];
    const promises = [];

    valid.forEach((file, idx) => {
      // 优先填充还未上传真实媒体的预设卡片，不够则自动新建卡片
      let targetPost = pc.posts.find((p) => p.mediaType === 'default' && !uploadedIds.includes(p.id));
      if (!targetPost) {
        targetPost = createBlankProfPost(pc.posts.length + 1);
        pc.posts.push(targetPost);
      }
      uploadedIds.push(targetPost.id);
      promises.push(mountProfPostMediaBlob(targetPost, file, file.name || `作品_${idx + 1}`, true));
    });

    await Promise.all(promises);
    renderProfilePostsEditor();
    renderPerTextFontList();
    persistState();

    if (pc.autoAiOnUpload) {
      await handleProfileAiFeedComments(uploadedIds);
    }
  }

  function scheduleAutoAiForUploadedPosts(postIds) {
    (postIds || []).forEach((id) => pendingAutoAiPostIds.add(id));
    clearTimeout(autoAiBatchTimer);
    autoAiBatchTimer = setTimeout(() => {
      const ids = Array.from(pendingAutoAiPostIds);
      pendingAutoAiPostIds.clear();
      if (ids.length) handleProfileAiFeedComments(ids);
    }, 350);
  }

  async function handleProfileAiBg() {
    const btn1 = document.getElementById('btnProfAiBg');
    const btn2 = document.getElementById('btnBarAiBg');
    if (btn1) btn1.disabled = true;
    if (btn2) btn2.disabled = true;
    const orig = btn1 ? btn1.textContent : '';
    if (btn1) btn1.textContent = '⏳ 生成背景中...';

    try {
      const res = await global.LayaProfileCenter.generateProfileBgWithAI(state, mediaRegistry);
      if (res && res.blob) {
        await new Promise((resolve) => {
          loadBlobAsImage(res.blob, (img) => {
            mediaRegistry.profileBg = img;
            state.profileCenter.header.bgStyle = 'custom';
            persistMedia('profileBg', res.blob, { fileName: 'ai_profile_bg.png' });
            syncStaticInputsFromState();
            persistState();
            resolve();
          });
        });
        showToast(res.source === 'gemini-image' ? '🎨 Gemini AI 已生成全新主页背景图！' : '🎨 AI 已合成并保存氛围主页背景图！');
      }
    } catch (err) {
      showToast(`生成背景失败：${err.message}`, true);
    } finally {
      if (btn1) {
        btn1.disabled = false;
        btn1.textContent = orig || '🎨 AI 一键生成背景图';
      }
      if (btn2) btn2.disabled = false;
    }
  }

  async function handleProfileAiPersona() {
    const btn1 = document.getElementById('btnProfAiPersona');
    const btn2 = document.getElementById('btnBarAiPersona');
    if (btn1) btn1.disabled = true;
    if (btn2) btn2.disabled = true;
    const orig = btn1 ? btn1.textContent : '';
    if (btn1) btn1.textContent = '⏳ AI 构思资料中...';

    try {
      const res = await global.LayaProfileCenter.generateProfilePersonaWithAI(state);
      const pc = state.profileCenter;
      mediaRegistry.profAvatar = null;
      removePersistedMedia('profAvatar');
      pc.user.avatarCategory = res.avatarCategory;
      pc.user.avatarIndex = res.avatarIndex;
      pc.user.nickname = res.nickname;
      pc.user.userId = res.userId;
      pc.user.ipText = res.ipText;
      pc.user.gender = res.gender;
      pc.user.age = res.age;
      pc.user.level = res.level;
      pc.user.voiceTag = res.voiceTag;
      pc.header.vibeIndex = res.vibeIndex;
      pc.header.onlineBadgeText = res.onlineBadgeText;
      if (pc.stats && Array.isArray(pc.stats.items) && pc.stats.items.length >= 3) {
        pc.stats.items[0].num = res.following;
        pc.stats.items[1].num = res.fans;
        pc.stats.items[2].num = res.likes;
      }
      pc.bio.text = res.bioText;
      pc.momentBar.descText = res.momentDesc;

      syncStaticInputsFromState();
      renderProfilePanelEditors();
      persistState();
      showToast(res.usedRemoteAI ? '✨ AI 已生成头像库头像、昵称与整套个人资料！' : '✨ 已智能生成人设昵称、资料并匹配头像库头像！');
    } catch (err) {
      showToast(`生成资料失败：${err.message}`, true);
    } finally {
      if (btn1) {
        btn1.disabled = false;
        btn1.textContent = orig || '✨ AI 生成资料+头像';
      }
      if (btn2) btn2.disabled = false;
    }
  }

  async function handleProfileAiFeedComments(targetPostIds) {
    const btn1 = document.getElementById('btnProfAiFeedComments');
    const btn2 = document.getElementById('btnBarAiFeedComments');
    if (btn1) btn1.disabled = true;
    if (btn2) btn2.disabled = true;
    const orig = btn1 ? btn1.textContent : '';
    if (btn1) btn1.textContent = '⏳ AI 识别画面写标题与评论中...';

    try {
      const res = await global.LayaProfileCenter.generateProfileFeedAndCommentsWithAI(
        state,
        mediaRegistry,
        targetPostIds
      );
      const pc = state.profileCenter;
      if (Array.isArray(res.posts)) {
        res.posts.forEach((gen) => {
          const target = pc.posts.find((p) => p.id === gen.id);
          if (target) {
            target.title = gen.title;
            target.hotComment = gen.hotComment;
            target.likes = gen.likes;
          }
        });
      }
      if (Array.isArray(res.comments) && res.comments.length > 0) {
        mediaRegistry.profCommentAvatars = {};
        pc.commentSection.items = res.comments;
      }
      renderProfilePanelEditors();
      renderPerTextFontList();
      persistState();
      showToast(
        res.usedRemoteAI
          ? '🤖 Gemini Vision 已根据上传视频/图片生成标题与底部评论！'
          : '🤖 已根据上传作品生成对应标题与互动评论（填入 Gemini Key 可看图精准创作）'
      );
    } catch (err) {
      showToast(`AI 生成标题评论提示：${err.message}`, true);
    } finally {
      if (btn1) {
        btn1.disabled = false;
        btn1.textContent = orig || '🤖 让 AI 根据当前视频/图片写标题与底部评论';
      }
      if (btn2) btn2.disabled = false;
    }
  }

  function handleProfileDirectCanvasClick(hit, clientX, clientY) {
    if (!hit || !state.profileCenter) return false;
    const key = hit.key;
    if (!key.startsWith('prof_')) return false;

    const pc = state.profileCenter;
    activeInlineFontKey = key;

    if (key === 'prof_bg_banner') {
      openInlineEditorPopover({
        title: '个人主页背景图片',
        initialValue: null,
        clientX,
        clientY,
        extraButtons: [
          {
            text: '📁 上传背景图片',
            primary: true,
            onClick: () => {
              closeInlineEditor();
              triggerDirectFileUpload('image/*', (file) => {
                loadBlobAsImage(file, (img) => {
                  mediaRegistry.profileBg = img;
                  pc.header.bgStyle = 'custom';
                  persistMedia('profileBg', file);
                  syncStaticInputsFromState();
                  persistState();
                  showToast('🖼️ 已更新个人主页背景图');
                });
              });
            }
          },
          {
            text: '🎨 AI 生成背景',
            onClick: () => {
              closeInlineEditor();
              handleProfileAiBg();
            }
          },
          {
            text: '🎲 换氛围底图',
            onClick: () => {
              closeInlineEditor();
              document.getElementById('btnNextProfVibe').click();
            }
          }
        ]
      });
      return true;
    }

    if (key === 'prof_avatar') {
      openInlineEditorPopover({
        title: '个人主页头像',
        initialValue: null,
        clientX,
        clientY,
        extraButtons: [
          {
            text: '🖼️ 从头像库挑选 (450+)',
            primary: true,
            onClick: () => {
              closeInlineEditor();
              openAvatarLibraryForProfileUser();
            }
          },
          {
            text: '📁 上传本地头像',
            onClick: () => {
              closeInlineEditor();
              triggerDirectFileUpload('image/*', (file) => {
                loadBlobAsImage(file, (img) => {
                  mediaRegistry.profAvatar = img;
                  persistMedia('profAvatar', file);
                  refreshProfileAvatarPreview();
                  showToast('👤 已上传个人头像');
                });
              });
            }
          },
          {
            text: '🎲 随机头像',
            onClick: () => {
              closeInlineEditor();
              document.getElementById('btnRandProfAvatar').click();
            }
          }
        ]
      });
      return true;
    }

    if (key.startsWith('prof_cmt_avatar_')) {
      const cmtId = key.replace('prof_cmt_avatar_', '');
      const cm = (pc.commentSection.items || []).find((c) => c.id === cmtId);
      if (!cm) return true;
      closeInlineEditor();
      openAvatarLibraryModal({
        title: '🖼️ 为该条评论选择头像',
        initialCat: cm.avatarCategory || 'guys',
        initialIdx: cm.avatarIndex || 0,
        onSelect: (cat, avIdx) => {
          delete mediaRegistry.profCommentAvatars[cm.id];
          removePersistedMedia(`profCmtAv:${cm.id}`);
          cm.avatarCategory = cat;
          cm.avatarIndex = avIdx;
          renderProfileCommentsEditor();
          persistState();
        },
        onUploadFile: (file) => {
          loadBlobAsImage(file, (img) => {
            mediaRegistry.profCommentAvatars[cm.id] = img;
            persistMedia(`profCmtAv:${cm.id}`, file);
            renderProfileCommentsEditor();
          });
        }
      });
      return true;
    }

    if (key.startsWith('prof_post_play_')) {
      const postId = key.replace('prof_post_play_', '');
      const entry = mediaRegistry.profCardMedia[postId];
      if (entry && entry.type === 'video') {
        toggleCardVideoPlayback(`prof:${postId}`);
        return true;
      }
      const post = pc.posts.find((p) => p.id === postId);
      if (post) {
        closeInlineEditor();
        triggerDirectFileUpload('video/mp4,video/webm,video/quicktime,image/*', (file) => {
          handleProfPostMediaUpload(post, file);
        });
      }
      return true;
    }

    if (key === 'prof_id_row') {
      const curPref = pc.user.idPrefix !== undefined ? pc.user.idPrefix : '账号 ID：';
      const curId = pc.user.userId !== undefined ? pc.user.userId : '';
      openInlineEditorPopover({
        title: '账号 ID 整行文案（可改前缀或纯 ID）',
        initialValue: `${curPref}${curId}`,
        clientX,
        clientY,
        onInput: (val) => {
          const m = String(val).match(/^(.*?)([：:])(.*)$/);
          if (m) {
            pc.user.idPrefix = m[1] + m[2];
            pc.user.userId = m[3];
          } else {
            pc.user.idPrefix = '';
            pc.user.userId = val;
          }
          syncStaticInputsFromState();
        }
      });
      return true;
    }

    const profFieldMap = {
      prof_sb_time: { path: 'profileCenter.header.time', title: '顶部状态栏时间' },
      prof_online_badge: { path: 'profileCenter.header.onlineBadgeText', title: '在线状态胶囊' },
      prof_nickname: { path: 'profileCenter.user.nickname', title: '个人主页昵称' },
      prof_ip_text: { path: 'profileCenter.user.ipText', title: 'IP 属地文字' },
      prof_age_badge: { path: 'profileCenter.user.age', title: '年龄文字' },
      prof_level_badge: { path: 'profileCenter.user.level', title: '等级徽章' },
      prof_voice_tag: { path: 'profileCenter.user.voiceTag', title: '声音个性标签' },
      prof_bio_text: { path: 'profileCenter.bio.text', title: '多行个性签名', multiline: true },
      prof_moment_icon: { path: 'profileCenter.momentBar.iconText', title: '瞬间栏左侧文字' },
      prof_moment_desc: { path: 'profileCenter.momentBar.descText', title: '瞬间栏右侧说明' },
      prof_btn_follow: { path: 'profileCenter.actions.followText', title: '关注按钮文字' },
      prof_btn_msg: { path: 'profileCenter.actions.msgText', title: '发私信按钮文字' },
      prof_comments_header: { path: 'profileCenter.commentSection.headerTitle', title: '评论区标题' },
      prof_comments_placeholder: { path: 'profileCenter.commentSection.inputPlaceholder', title: '评论输入框提示词' }
    };

    if (profFieldMap[key]) {
      const info = profFieldMap[key];
      const rawVal = getByPath(state, info.path);
      openInlineEditorPopover({
        title: info.title,
        initialValue: rawVal == null ? '' : String(rawVal),
        multiline: Boolean(info.multiline),
        clientX,
        clientY,
        onInput: (val) => {
          setByPath(state, info.path, val);
          syncStaticInputsFromState();
        }
      });
      return true;
    }

    if (key.startsWith('prof_stat_num_') || key.startsWith('prof_stat_lbl_')) {
      const isNum = key.startsWith('prof_stat_num_');
      const idx = Number(key.replace(isNum ? 'prof_stat_num_' : 'prof_stat_lbl_', ''));
      const item = pc.stats && pc.stats.items && pc.stats.items[idx];
      if (!item) return true;
      openInlineEditorPopover({
        title: isNum ? `统计数字：${item.label}` : '统计标签词',
        initialValue: isNum ? item.num : item.label,
        clientX,
        clientY,
        onInput: (val) => {
          if (isNum) item.num = val;
          else item.label = val;
          renderProfileStatsEditor();
        }
      });
      return true;
    }

    if (key.startsWith('prof_tab_')) {
      const idx = Number(key.replace('prof_tab_', ''));
      openInlineEditorPopover({
        title: `内容分区标签 ${idx + 1}`,
        initialValue: pc.contentTabs.tabs[idx] || '',
        clientX,
        clientY,
        onInput: (val) => {
          pc.contentTabs.tabs[idx] = val;
          renderProfileTabsEditor();
        },
        extraButtons: [
          {
            text: '★ 设为当前高亮分区',
            primary: true,
            onClick: () => {
              pc.contentTabs.activeIndex = idx;
              renderProfileTabsEditor();
              persistState();
            }
          }
        ]
      });
      return true;
    }

    if (key.startsWith('prof_bot_badge_')) {
      const idx = Number(key.replace('prof_bot_badge_', ''));
      const tab = pc.bottomNav && pc.bottomNav.tabs && pc.bottomNav.tabs[idx];
      if (!tab) return true;
      openInlineEditorPopover({
        title: `底栏「${tab.label || idx + 1}」红点角标（留空隐藏）`,
        initialValue: tab.badge || '',
        clientX,
        clientY,
        onInput: (val) => {
          tab.badge = val;
          renderProfileBottomNavEditor();
        }
      });
      return true;
    }

    if (key.startsWith('prof_bot_nav_')) {
      const idx = Number(key.replace('prof_bot_nav_', ''));
      const tab = pc.bottomNav && pc.bottomNav.tabs && pc.bottomNav.tabs[idx];
      if (!tab) return true;
      openInlineEditorPopover({
        title: `底部导航：${tab.label}`,
        initialValue: tab.label,
        clientX,
        clientY,
        onInput: (val) => {
          tab.label = val;
          renderProfileBottomNavEditor();
        },
        extraButtons: [
          {
            text: '★ 设为高亮',
            primary: true,
            onClick: () => {
              pc.bottomNav.activeIndex = idx;
              renderProfileBottomNavEditor();
              persistState();
            }
          }
        ]
      });
      return true;
    }

    const postTextMatch = key.match(/^prof_post_(pin|overlay|watched|title|hotcmt|author|time|likes)_(.+)$/);
    if (postTextMatch) {
      const kind = postTextMatch[1];
      const postId = postTextMatch[2];
      const post = pc.posts.find((p) => p.id === postId);
      if (!post) return true;
      if (kind === 'author') {
        const isSync = !pc.feedSettings || pc.feedSettings.syncAuthorFromProfile !== false;
        if (isSync) {
          openInlineEditorPopover({
            title: '个人主页昵称（全作品同步）',
            initialValue: pc.user.nickname || '',
            clientX,
            clientY,
            onInput: (val) => {
              pc.user.nickname = val;
              syncStaticInputsFromState();
            }
          });
        } else {
          openInlineEditorPopover({
            title: '当前作品独立作者名',
            initialValue: post.customAuthor !== undefined && post.customAuthor !== '' ? post.customAuthor : pc.user.nickname || '',
            clientX,
            clientY,
            onInput: (val) => {
              post.customAuthor = val;
              renderProfilePostsEditor();
            }
          });
        }
        return true;
      }
      const fieldMap = {
        pin: { f: 'pinBadge', t: '作品置顶角标' },
        overlay: { f: 'overlayTitle', t: '画面花字（可换行）', ml: true },
        watched: { f: 'watchedTag', t: '底栏状态标签' },
        title: { f: 'title', t: '作品标题文案', ml: true },
        hotcmt: { f: 'hotComment', t: '卡片热评摘要', ml: true },
        time: { f: 'publishTime', t: '发布时间文字' },
        likes: { f: 'likes', t: '作品点赞数字' }
      };
      const cfg = fieldMap[kind];
      openInlineEditorPopover({
        title: cfg.t,
        initialValue: post[cfg.f] || '',
        multiline: Boolean(cfg.ml),
        clientX,
        clientY,
        onInput: (val) => {
          post[cfg.f] = val;
          renderProfilePostsEditor();
        }
      });
      return true;
    }

    const cmtTextMatch = key.match(/^prof_cmt_(nick|text|reply|meta|likes)_(.+)$/);
    if (cmtTextMatch) {
      const kind = cmtTextMatch[1];
      const cmtId = cmtTextMatch[2];
      const cm = (pc.commentSection.items || []).find((c) => c.id === cmtId);
      if (!cm) return true;
      const map = {
        nick: { f: 'nickname', t: '评论者昵称' },
        text: { f: 'text', t: '评论正文内容', ml: true },
        reply: { f: 'authorReply', t: '作者回复内容', ml: true },
        meta: { f: 'timeLoc', t: '时间与 IP 属地' },
        likes: { f: 'likes', t: '评论点赞数' }
      };
      const cfg = map[kind];
      openInlineEditorPopover({
        title: cfg.t,
        initialValue: cm[cfg.f] || '',
        multiline: Boolean(cfg.ml),
        clientX,
        clientY,
        onInput: (val) => {
          cm[cfg.f] = val;
          renderProfileCommentsEditor();
        }
      });
      return true;
    }

    if (key.startsWith('prof_extra_badge_')) {
      const bId = key.slice('prof_extra_badge_'.length);
      const list = (pc.user && pc.user.extraBadges) || [];
      const bItem = list.find((b) => b && b.id === bId);
      if (!bItem) return true;
      openInlineEditorPopover({
        title: '自定义身份徽章文字',
        initialValue: bItem.text || '',
        clientX,
        clientY,
        onInput: (val) => {
          bItem.text = val;
          renderProfileExtraBadgesEditor();
        },
        extraButtons: [
          {
            text: '🎨 切换配色',
            primary: true,
            onClick: () => {
              const styles = ['purple', 'pink', 'blue', 'glass'];
              bItem.style = styles[(styles.indexOf(bItem.style || 'purple') + 1) % styles.length];
              renderProfileExtraBadgesEditor();
              persistState();
            }
          }
        ]
      });
      return true;
    }

    if (key.startsWith('prof_post_')) {
      const postId = key.replace('prof_post_', '');
      const post = pc.posts.find((p) => p.id === postId);
      if (!post) return true;
      const entry = mediaRegistry.profCardMedia[postId];
      if (!entry || entry.type !== 'video') {
        closeInlineEditor();
        triggerDirectFileUpload('video/mp4,video/webm,video/quicktime,image/*', (file) => {
          handleProfPostMediaUpload(post, file);
        });
      } else {
        openInlineEditorPopover({
          title: `${hit.label} 媒体控制`,
          initialValue: null,
          clientX,
          clientY,
          extraButtons: [
            {
              text: '📁 替换视频/图片',
              primary: true,
              onClick: () => {
                closeInlineEditor();
                triggerDirectFileUpload('video/mp4,video/webm,video/quicktime,image/*', (file) => {
                  handleProfPostMediaUpload(post, file);
                });
              }
            },
            {
              text: entry.el.paused ? '▶ 播放' : '⏸ 暂停',
              onClick: () => {
                toggleCardVideoPlayback(`prof:${postId}`);
                closeInlineEditor();
              }
            },
            {
              text: '🤖 AI 写标题评论',
              onClick: () => {
                closeInlineEditor();
                handleProfileAiFeedComments([postId]);
              }
            }
          ]
        });
      }
      return true;
    }

    return true;
  }

  function dataUrlToBlob(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.includes(',')) return null;
    try {
      const parts = dataUrl.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = (mimeMatch && mimeMatch[1]) || 'image/jpeg';
      const bstr = atob(parts[1]);
      const u8 = new Uint8Array(bstr.length);
      for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
      return new Blob([u8], { type: mime });
    } catch (_) {
      return null;
    }
  }

  function loadBlobAsImage(blobOrFile, callback) {
    const url = URL.createObjectURL(blobOrFile);
    const img = new Image();
    img.onload = () => {
      callback(img);
      requestStageRender();
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
