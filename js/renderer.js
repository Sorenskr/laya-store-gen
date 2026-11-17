/**
 * Laya App 商店截圖生成器 - 1920×1080 全元素可隱藏/可移動/透明背景渲染引擎
 */
(function (global) {
  'use strict';

  const FONT_SANS = '"Noto Sans SC", "Noto Sans TC", "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif';

  class StageRenderer {
    constructor(stageCanvas, overlayCanvas, mediaRegistry) {
      this.stageCanvas = stageCanvas;
      this.overlayCanvas = overlayCanvas;
      // 開啟 alpha: true 以支持導出 32 位真透明背景 PNG / 透明圖層
      this.ctx = stageCanvas.getContext('2d', { alpha: true });
      this.octx = overlayCanvas.getContext('2d');
      this.media = mediaRegistry;
      this.hitBoxes = [];
      this.playButtons = [];
      this.deleteActionBox = null;
      this._tintCanvas = document.createElement('canvas');
    }

    get W() {
      return this.stageCanvas.width || 1920;
    }

    get H() {
      return this.stageCanvas.height || 1080;
    }

    isVisible(state, key) {
      return !(state.hiddenElements && state.hiddenElements[key]);
    }

    getOffset(state, key) {
      const off = state.offsets && state.offsets[key];
      return off ? { x: off.x || 0, y: off.y || 0 } : { x: 0, y: 0 };
    }

    getFontPx(state, key, fallbackPx) {
      if (global.LayaDefaults && typeof global.LayaDefaults.getEffectiveFontSize === 'function') {
        return global.LayaDefaults.getEffectiveFontSize(state, key, fallbackPx);
      }
      return fallbackPx;
    }

    registerHit(key, label, kind, x, y, w, h, parentModule) {
      this.hitBoxes.push({
        key,
        label,
        kind,
        parentModule: parentModule || key,
        x,
        y,
        w,
        h,
        cx: x + w / 2,
        cy: y + h / 2,
        right: x + w,
        bottom: y + h
      });
    }

    render(state, forceStaticFrame) {
      const ctx = this.ctx;
      const W = this.W;
      const H = this.H;
      this.hitBoxes = [];
      this.playButtons = [];

      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.animTime =
        !forceStaticFrame && state.layout.enableAnim !== false
          ? nowMs / 1000
          : 0;

      const theme = state.layout.canvasTheme || 'dark';
      const isLight = theme === 'light';
      const isOuterTrans = theme === 'transparent' || theme === 'full-transparent';
      const isFullTrans = theme === 'full-transparent';

      // 先徹底清空畫布為全透明像素 RGBA(0,0,0,0)
      ctx.clearRect(0, 0, W, H);

      if (!isOuterTrans) {
        this.drawStageBackdrop(ctx, W, H, isLight, state.layout.bgColor, this.animTime);
      }

      const outerX = Number(state.layout.outerPadX) || 48;
      const outerY = Number(state.layout.outerPadY) || 24;
      const colGap = Number(state.layout.colGap) || 44;
      const colW = Math.floor((W - outerX * 2 - colGap) / 2);

      const leftColX = outerX;
      const rightColX = outerX + colW + colGap;

      // 中軸分割光線（也可單獨隱藏）
      if (!isFullTrans && this.isVisible(state, 'center_divider')) {
        const divOff = this.getOffset(state, 'center_divider');
        const midX = outerX + colW + colGap / 2 + divOff.x;
        ctx.save();
        const midLineGrad = ctx.createLinearGradient(midX, outerY + 20, midX, H - outerY - 20);
        midLineGrad.addColorStop(0, 'rgba(168, 85, 247, 0)');
        midLineGrad.addColorStop(0.25, isLight ? 'rgba(147, 51, 234, 0.16)' : 'rgba(192, 132, 252, 0.18)');
        midLineGrad.addColorStop(0.75, isLight ? 'rgba(147, 51, 234, 0.16)' : 'rgba(192, 132, 252, 0.18)');
        midLineGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = midLineGrad;
        ctx.fillRect(midX - 0.75, outerY + 20 + divOff.y, 1.5, H - outerY * 2 - 40);
        ctx.restore();
      }

      const baseStepFont = Number(state.steps.fontSize) || 40;
      const stepRowH = Math.max(58, Math.round(baseStepFont * 1.45));
      const step1Font = this.getFontPx(state, 'step_title_1', baseStepFont);
      const step2Font = this.getFontPx(state, 'step_title_2', baseStepFont);
      const step3Font = this.getFontPx(state, 'step_title_3', baseStepFont);

      // ==================== 左栏上半部：步骤 1 + 模块 1 ====================
      if (this.isVisible(state, 'step_title_1')) {
        this.renderStepHeading(
          ctx,
          state,
          'step_title_1',
          '步骤 1 标题',
          state.steps.step1,
          '01',
          leftColX,
          outerY,
          colW,
          stepRowH,
          step1Font,
          isLight,
          isOuterTrans
        );
      }

      const m1BaseY = outerY + stepRowH + 8;
      const m1H = 500;
      if (this.isVisible(state, 'module_1')) {
        const m1Off = this.getOffset(state, 'module_1');
        const m1X = leftColX + m1Off.x;
        const m1Y = m1BaseY + m1Off.y;
        this.renderModule1(ctx, state, m1X, m1Y, colW, m1H, isFullTrans);
        this.registerHit('module_1', '模块 1：Google Play 商店卡', 'module', m1X, m1Y, colW, m1H, 'module_1');
      }

      // ==================== 左栏下半部：步骤 2 + 模块 2 ====================
      const step2BaseY = m1BaseY + m1H + 20;
      if (this.isVisible(state, 'step_title_2')) {
        this.renderStepHeading(
          ctx,
          state,
          'step_title_2',
          '步骤 2 标题',
          state.steps.step2,
          '02',
          leftColX,
          step2BaseY,
          colW,
          stepRowH,
          step2Font,
          isLight,
          isOuterTrans
        );
      }

      const m2BaseY = step2BaseY + stepRowH + 8;
      const m2H = Math.max(220, H - outerY - m2BaseY);
      if (this.isVisible(state, 'module_2')) {
        const m2Off = this.getOffset(state, 'module_2');
        const m2X = leftColX + m2Off.x;
        const m2Y = m2BaseY + m2Off.y;
        this.renderModule2(ctx, state, m2X, m2Y, colW, m2H, isFullTrans);
        this.registerHit('module_2', '模块 2：标签栏与底部导航', 'module', m2X, m2Y, colW, m2H, 'module_2');
      }

      // ==================== 右栏上半部：步骤 3 + 模块 3 ====================
      if (this.isVisible(state, 'step_title_3')) {
        this.renderStepHeading(
          ctx,
          state,
          'step_title_3',
          '步骤 3 标题',
          state.steps.step3,
          '03',
          rightColX,
          outerY,
          colW,
          stepRowH,
          step3Font,
          isLight,
          isOuterTrans
        );
      }

      const m3BaseY = outerY + stepRowH + 8;
      const m3H = 310;
      if (this.isVisible(state, 'module_3')) {
        const m3Off = this.getOffset(state, 'module_3');
        const m3X = rightColX + m3Off.x;
        const m3Y = m3BaseY + m3Off.y;
        this.renderModule3(ctx, state, m3X, m3Y, colW, m3H, isFullTrans);
        this.registerHit('module_3', '模块 3：搜索与个人信息卡片', 'module', m3X, m3Y, colW, m3H, 'module_3');
      }

      // ==================== 右栏下半部：模块 4 (双列视频卡片流) ====================
      const m4BaseY = m3BaseY + m3H + 14;
      const availM4H = Math.max(460, H - outerY - m4BaseY);
      if (this.isVisible(state, 'module_4')) {
        const m4Off = this.getOffset(state, 'module_4');
        const m4X = rightColX + m4Off.x;
        const m4Y = m4BaseY + m4Off.y;
        const m4H = this.renderModule4(ctx, state, m4X, m4Y, colW, availM4H, isFullTrans);
        this.registerHit('module_4', '模块 4：双列视频卡片流', 'module', m4X, m4Y, colW, m4H, 'module_4');
      }

      // ==================== 独立上传的浮动品牌 Logo 贴纸（可拖动、可隐藏） ====================
      if (this.media.floatingLogo && this.isVisible(state, 'floating_brand_logo')) {
        const flOff = this.getOffset(state, 'floating_brand_logo');
        const flW = 128;
        const flH = 128;
        const flX = W - outerX - flW - 12 + flOff.x;
        const flY = outerY + flOff.y;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 14;
        this.drawContainImage(ctx, this.media.floatingLogo, flX, flY, flW, flH);
        ctx.restore();
        this.registerHit('floating_brand_logo', '独立浮动 Logo', 'element', flX, flY, flW, flH, 'floating_brand_logo');
      }
    }

    drawStageBackdrop(ctx, W, H, isLight, customDarkBg, t) {
      ctx.save();
      if (isLight) {
        const lg = ctx.createLinearGradient(0, 0, W, H);
        lg.addColorStop(0, '#faf8ff');
        lg.addColorStop(0.5, '#f5f2fc');
        lg.addColorStop(1, '#faf9fe');
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, W, H);

        const softAura = ctx.createRadialGradient(W * 0.75, H * 0.3, 40, W * 0.75, H * 0.3, 620);
        softAura.addColorStop(0, 'rgba(168, 85, 247, 0.08)');
        softAura.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = softAura;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        return;
      }

      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, customDarkBg || '#080611');
      bg.addColorStop(0.5, '#0d091b');
      bg.addColorStop(1, '#07050f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const driftX = t ? Math.sin(t * 0.8) * 36 : 0;
      const driftY = t ? Math.cos(t * 0.65) * 28 : 0;
      const breath = t ? 1 + Math.sin(t * 1.8) * 0.14 : 1;

      const g1 = ctx.createRadialGradient(280 + driftX, 220 + driftY, 30, 280 + driftX, 220 + driftY, 680);
      g1.addColorStop(0, `rgba(147, 51, 234, ${(0.17 * breath).toFixed(3)})`);
      g1.addColorStop(0.6, 'rgba(88, 28, 135, 0.06)');
      g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, W, H);

      const g2 = ctx.createRadialGradient(W - 380 - driftX, 340 - driftY, 40, W - 380 - driftX, 340 - driftY, 740);
      g2.addColorStop(0, `rgba(192, 38, 211, ${(0.15 * breath).toFixed(3)})`);
      g2.addColorStop(0.55, 'rgba(109, 40, 217, 0.06)');
      g2.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = 'rgba(216, 180, 254, 0.035)';
      for (let gx = 36; gx < W; gx += 48) {
        for (let gy = 36; gy < H; gy += 48) {
          ctx.fillRect(gx, gy, 1.5, 1.5);
        }
      }

      if (t > 0) {
        for (let i = 0; i < 18; i++) {
          const seed = i * 137.5;
          const px = (seed * 19) % W;
          const py = (((seed * 31 - t * (14 + (i % 5) * 4)) % H) + H) % H;
          const alpha = 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(t * 2.2 + i));
          const r = 1.2 + (i % 3) * 0.7;
          ctx.fillStyle =
            i % 2 === 0
              ? `rgba(232, 121, 249, ${alpha.toFixed(3)})`
              : `rgba(196, 181, 253, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    renderStepHeading(ctx, state, key, hitLabel, rawText, fallbackNum, x, y, colW, rowH, fontSize, isLight, isOuterTrans) {
      if (!rawText) return;
      const off = this.getOffset(state, key);
      const startX = x + off.x;
      const centerY = y + rowH / 2 + off.y;

      let badgeNum = fallbackNum;
      let bodyText = String(rawText).trim();
      const m = bodyText.match(/^(\d+)\s*[、.．:：-]\s*(.*)$/);
      if (m) {
        badgeNum = `STEP 0${m[1]}`;
        bodyText = m[2];
      }

      ctx.save();
      let curX = startX;

      // 步驟膠囊徽章（可單獨隱藏）
      const badgeKey = `${key}_badge`;
      if (this.isVisible(state, badgeKey)) {
        const badgeFont = Math.max(17, Math.round(fontSize * 0.45));
        ctx.font = `800 ${badgeFont}px ${FONT_SANS}`;
        const btW = ctx.measureText(badgeNum).width;
        const pillW = btW + 26;
        const pillH = Math.round(fontSize * 0.82);
        const pillY = centerY - pillH / 2;

        ctx.save();
        ctx.shadowColor = 'rgba(192, 38, 211, 0.45)';
        ctx.shadowBlur = 14;
        const pGrad = ctx.createLinearGradient(curX, pillY, curX + pillW, pillY + pillH);
        pGrad.addColorStop(0, '#9333ea');
        pGrad.addColorStop(1, '#db2777');
        ctx.fillStyle = pGrad;
        this.roundRect(ctx, curX, pillY, pillW, pillH, pillH / 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(245, 208, 254, 0.55)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeNum, curX + pillW / 2, centerY + 1);
        curX += pillW + 16;
      }

      ctx.font = `800 ${fontSize}px ${FONT_SANS}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      const mainColor = isLight ? '#141122' : '#ffffff';
      const highlightColor = isLight ? '#7e22ce' : '#f0abfc';
      const syncedTerm = String(state.userModule.searchQuery || '').trim();

      // 構建動態高亮正則（包含同步搜索詞，無論是中文、字母還是數字都能高亮）
      const escTerm = syncedTerm ? syncedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
      const hiRegex = escTerm
        ? new RegExp(`(${escTerm}|Laya|laya|娱乐|娛樂|\\d{4,})`, 'g')
        : /(Laya|laya|娱乐|娛樂|\d{4,})/g;

      const emojiParts = bodyText.split('🔍');
      emojiParts.forEach((part, pIdx) => {
        if (part) {
          const tokens = part.split(hiRegex);
          tokens.forEach((tk) => {
            if (!tk) return;
            const isHi =
              (syncedTerm && tk === syncedTerm) || /^(Laya|laya|娱乐|娛樂|\d{4,})$/.test(tk);
            ctx.save();
            if (isOuterTrans) {
              // 透明背景下加柔和深色描邊與投影，確保貼在任何底圖上都清晰可讀
              ctx.strokeStyle = 'rgba(8, 6, 17, 0.85)';
              ctx.lineWidth = 6;
              ctx.lineJoin = 'round';
              ctx.strokeText(tk, curX, centerY);
            } else if (isHi && !isLight) {
              ctx.shadowColor = 'rgba(232, 121, 249, 0.6)';
              ctx.shadowBlur = 14;
            }
            ctx.fillStyle = isHi ? highlightColor : mainColor;
            ctx.fillText(tk, curX, centerY);
            curX += ctx.measureText(tk).width;
            ctx.restore();
          });
        }
        if (pIdx < emojiParts.length - 1) {
          this.drawColorSearchEmoji(ctx, curX + fontSize * 0.54, centerY + 1, fontSize * 0.42);
          curX += fontSize * 1.08;
        }
      });

      const lineStartX = curX + 18;
      const lineEndX = x + colW - 6;
      if (!isOuterTrans && lineEndX - lineStartX > 40) {
        const tailGrad = ctx.createLinearGradient(lineStartX, centerY, lineEndX, centerY);
        tailGrad.addColorStop(0, isLight ? 'rgba(147, 51, 234, 0.35)' : 'rgba(192, 132, 252, 0.42)');
        tailGrad.addColorStop(1, 'rgba(147, 51, 234, 0)');
        ctx.fillStyle = tailGrad;
        ctx.fillRect(lineStartX, centerY - 1, lineEndX - lineStartX, 2);
      }

      this.registerHit(key, hitLabel, 'element', startX - 4, centerY - rowH * 0.46, Math.min(colW, curX - startX + 14), rowH * 0.92, key);
      ctx.restore();
    }

    drawColorSearchEmoji(ctx, cx, cy, r) {
      ctx.save();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = Math.max(5, r * 0.34);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.44, cy + r * 0.44);
      ctx.lineTo(cx + r * 1.12, cy + r * 1.12);
      ctx.stroke();

      const g = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.08, cx, cy, r * 0.8);
      g.addColorStop(0, '#f0f9ff');
      g.addColorStop(0.6, '#bae6fd');
      g.addColorStop(1, '#c084fc');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx - r * 0.1, cy - r * 0.1, r * 0.72, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#f5d0fe';
      ctx.lineWidth = Math.max(2.4, r * 0.16);
      ctx.stroke();
      ctx.restore();
    }

    drawGlassCardRim(ctx, x, y, w, h, radius) {
      ctx.save();
      this.roundRect(ctx, x, y, w, h, radius);
      const rim = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
      rim.addColorStop(0, 'rgba(216, 180, 254, 0.36)');
      rim.addColorStop(0.45, 'rgba(139, 92, 246, 0.16)');
      rim.addColorStop(1, 'rgba(88, 28, 135, 0.26)');
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }

    // ---------------------------------------------------------------------------
    // 模組 1：Google Play 商店卡片（所有子元素均可單獨隱藏、移動、替換 Logo）
    // ---------------------------------------------------------------------------
    renderModule1(ctx, state, x, y, w, h, isFullTrans) {
      const sb = state.statusBar;
      const pe = state.playEntry;
      const raw = this.media.raw || {};
      const radius = Number(state.layout.cardRadius) || 20;

      if (!isFullTrans) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 8;
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.fillStyle = '#12111a';
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      this.roundRect(ctx, x, y, w, h, radius);
      ctx.clip();

      if (!isFullTrans) {
        const cardBg = ctx.createLinearGradient(x, y, x, y + h);
        cardBg.addColorStop(0, '#161520');
        cardBg.addColorStop(1, '#100f17');
        ctx.fillStyle = cardBg;
        ctx.fillRect(x, y, w, h);
      }

      let curY = y;
      if (sb.enabled && this.isVisible(state, 'status_bar_row')) {
        const sbH = Number(sb.height) || 48;
        this.renderCompactStatusBar(ctx, state, x, curY, w, sbH, isFullTrans);
        curY += sbH;
      }

      const padX = Number(pe.paddingX) || 34;
      const remainH = h - (curY - y);
      const vScale = remainH / 500;

      // 1) 頂部商店 Logo + Google Play 標題 + 右上角 ✕
      const hdrY = curY + Math.round(42 * vScale);
      if (this.isVisible(state, 'play_store_logo')) {
        const slOff = this.getOffset(state, 'play_store_logo');
        const slX = x + padX + 14 + slOff.x;
        const slY = hdrY + slOff.y;
        if (this.media.storeLogo) {
          this.drawContainImage(ctx, this.media.storeLogo, slX - 18, slY - 18, 36, 36);
        } else {
          this.drawGooglePlayLogo(ctx, slX, slY, 15);
        }
        this.registerHit('play_store_logo', '商店左上小标 Logo', 'element', slX - 20, slY - 20, 40, 40, 'module_1');
      }

      if (this.isVisible(state, 'play_header')) {
        const hdrOff = this.getOffset(state, 'play_header');
        const hdrX = x + padX + 40 + hdrOff.x;
        const hy = hdrY + 1 + hdrOff.y;
        const hdrFs = this.getFontPx(state, 'play_header', 30);
        ctx.font = `600 ${hdrFs}px ${FONT_SANS}`;
        this.fillReadableText(ctx, pe.storeHeader || 'Google Play', hdrX, hy, '#ececf4', isFullTrans);
        const hw = ctx.measureText(pe.storeHeader || 'Google Play').width;
        this.registerHit('play_header', 'Google Play 标题', 'element', hdrX - 4, hy - hdrFs * 0.65, hw + 12, Math.max(36, hdrFs * 1.3), 'module_1');
      }

      if (pe.showCloseBtn && this.isVisible(state, 'play_close')) {
        const clOff = this.getOffset(state, 'play_close');
        const closeX = x + w - padX - 14 + clOff.x;
        const closeY = hdrY + clOff.y;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.arc(closeX, closeY, 20, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(closeX - 8, closeY - 8);
        ctx.lineTo(closeX + 8, closeY + 8);
        ctx.moveTo(closeX + 8, closeY - 8);
        ctx.lineTo(closeX - 8, closeY + 8);
        ctx.stroke();
        this.registerHit('play_close', '商店右上关闭钮', 'element', closeX - 22, closeY - 22, 44, 44, 'module_1');
      }

      if (!isFullTrans) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.fillRect(x + padX, curY + Math.round(78 * vScale), w - padX * 2, 1);
      }

      // 2) 应用主 Logo（支持单独上传替换、移动、隐藏）
      const appRowY = curY + Math.round(102 * vScale);
      const iconSize = Math.round(118 * vScale);
      if (this.isVisible(state, 'play_icon')) {
        const iconOff = this.getOffset(state, 'play_icon');
        const iconX = x + padX + iconOff.x;
        const iconY = appRowY + iconOff.y;
        const iconRad = Number(pe.iconRadius) || 26;

        ctx.save();
        ctx.shadowColor = 'rgba(217, 70, 239, 0.36)';
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 6;
        this.roundRect(ctx, iconX, iconY, iconSize, iconSize, iconRad);
        ctx.fillStyle = '#1b0926';
        ctx.fill();
        ctx.clip();
        const iconSource = this.media.appIcon || raw.laya_icon;
        if (iconSource) {
          this.drawCoverImage(ctx, iconSource, iconX, iconY, iconSize, iconSize);
        }
        ctx.restore();

        ctx.save();
        this.roundRect(ctx, iconX, iconY, iconSize, iconSize, iconRad);
        ctx.strokeStyle = 'rgba(232, 121, 249, 0.35)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
        this.registerHit('play_icon', '应用主 Logo 图标', 'element', iconX, iconY, iconSize, iconSize, 'module_1');
      }

      // 右侧「安装」按钮与「包含内购商品」小字
      const instFs = this.getFontPx(state, 'play_install', 26);
      ctx.font = `600 ${instFs}px ${FONT_SANS}`;
      const instLabel = pe.installText || '安装';
      const btnW = Math.max(148, Math.round(ctx.measureText(instLabel).width + 52));
      const btnH = Math.max(54, Math.round(instFs * 2.2));
      const btnBaseX = x + w - padX - btnW;
      if (this.isVisible(state, 'play_install')) {
        const instOff = this.getOffset(state, 'play_install');
        const btnX = btnBaseX + instOff.x;
        const btnY = appRowY + 14 + instOff.y;

        ctx.save();
        const btnBg = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
        btnBg.addColorStop(0, 'rgba(96, 165, 250, 0.18)');
        btnBg.addColorStop(1, 'rgba(168, 85, 247, 0.18)');
        ctx.fillStyle = btnBg;
        this.roundRect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.fill();
        ctx.strokeStyle = '#7cb3fc';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        ctx.font = `600 ${instFs}px ${FONT_SANS}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this.fillReadableText(ctx, instLabel, btnX + btnW / 2, btnY + btnH / 2 + 1, '#a8c7fa', isFullTrans);
        this.registerHit('play_install', '安装按钮', 'element', btnX, btnY, btnW, btnH, 'module_1');

        if (pe.inAppText && this.isVisible(state, 'play_inapp')) {
          const inOff = this.getOffset(state, 'play_inapp');
          const inFs = this.getFontPx(state, 'play_inapp', 16);
          const inX = btnX + btnW / 2 + inOff.x;
          const inY = btnY + btnH + Math.max(18, Math.round(inFs * 1.15)) + inOff.y;
          ctx.font = `400 ${inFs}px ${FONT_SANS}`;
          this.fillReadableText(ctx, pe.inAppText, inX, inY, '#949ab0', isFullTrans);
          const inW = ctx.measureText(pe.inAppText).width + 14;
          this.registerHit('play_inapp', '包含内购小字', 'element', inX - inW / 2, inY - inFs * 0.7, inW, Math.max(24, inFs * 1.4), 'module_1');
        }
      }

      // 中间应用名称与公司名称
      const textX = x + padX + iconSize + 26;
      const maxTW = Math.max(160, btnBaseX - 24 - textX);

      if (this.isVisible(state, 'play_title')) {
        const titleOff = this.getOffset(state, 'play_title');
        const tX = textX + titleOff.x;
        const tY = appRowY + 34 + titleOff.y;
        const titleFs = this.getFontPx(state, 'play_title', 28);
        ctx.font = `700 ${titleFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const renderedName = this.truncateText(ctx, pe.appName || '', maxTW);
        this.fillReadableText(ctx, renderedName, tX, tY, '#f8fafc', isFullTrans);
        this.registerHit('play_title', '应用名称', 'element', tX, tY - titleFs * 0.65, maxTW, Math.max(34, titleFs * 1.3), 'module_1');
      }

      if (this.isVisible(state, 'play_meta')) {
        const metaOff = this.getOffset(state, 'play_meta');
        const mX = textX + metaOff.x;
        const mY = appRowY + 78 + metaOff.y;
        const metaFs = this.getFontPx(state, 'play_meta', 22);
        ctx.font = `500 ${metaFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const renderedComp = this.truncateText(ctx, pe.company || '', maxTW);
        this.fillReadableText(ctx, renderedComp, mX, mY, '#9ca3b8', isFullTrans);
        this.registerHit('play_meta', '公司名称', 'element', mX, mY - metaFs * 0.65, maxTW, Math.max(28, metaFs * 1.3), 'module_1');
      }

      // 3) 三栏数据指标面板
      if (this.isVisible(state, 'play_stats')) {
        const stOff = this.getOffset(state, 'play_stats');
        const panelY = curY + Math.round(252 * vScale) + stOff.y;
        const panelH = Math.round(96 * vScale);
        const panelX = x + padX + stOff.x;
        const panelW = w - padX * 2;
        const statNumFs = this.getFontPx(state, 'play_stats_num', 26);
        const statSubFs = this.getFontPx(state, 'play_stats', 19);

        if (!isFullTrans) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
          this.roundRect(ctx, panelX, panelY, panelW, panelH, 14);
          ctx.fill();
        }

        const statsTopY = panelY + Math.round(panelH * 0.34);
        const statsBotY = panelY + Math.round(panelH * 0.74);
        const thirdW = panelW / 3;

        const c1X = panelX + thirdW * 0.5;
        ctx.font = `700 ${statNumFs}px ${FONT_SANS}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const rStr = String(pe.rating || '4.8');
        const rW = ctx.measureText(rStr).width;
        this.fillReadableText(ctx, rStr, c1X - 12, statsTopY, '#f1f5f9', isFullTrans);
        this.drawStar(ctx, c1X + rW / 2 + 5, statsTopY - 1, Math.max(8, statNumFs * 0.36), '#60a5fa');

        ctx.font = `400 ${statSubFs}px ${FONT_SANS}`;
        this.fillReadableText(ctx, pe.reviews || '18万 条评价 ⓘ', c1X, statsBotY, '#9499ad', isFullTrans);

        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(panelX + thirdW, panelY + 20, 1, panelH - 40);

        const c2X = panelX + thirdW * 1.5;
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2.2;
        this.roundRect(ctx, c2X - 13, statsTopY - 13, 26, 26, 5);
        ctx.stroke();
        this.drawDownloadTrayIcon(ctx, c2X, statsTopY, '#e2e8f0', 0.82);

        ctx.font = `400 ${statSubFs}px ${FONT_SANS}`;
        this.fillReadableText(ctx, pe.appSize || '133 MB', c2X, statsBotY, '#9499ad', isFullTrans);

        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(panelX + thirdW * 2, panelY + 20, 1, panelH - 40);

        const c3X = panelX + thirdW * 2.5;
        ctx.save();
        ctx.translate(c3X, statsTopY);
        ctx.rotate(-0.08);
        ctx.fillStyle = '#f1f5f9';
        this.roundRect(ctx, -14, -14, 28, 28, 4);
        ctx.fill();
        ctx.font = `900 ${Math.min(24, Math.round(statNumFs * 0.74))}px ${FONT_SANS}`;
        ctx.fillStyle = '#12111a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pe.ageBadge || 'M', 0, 1);
        ctx.restore();

        ctx.font = `400 ${statSubFs}px ${FONT_SANS}`;
        ctx.textAlign = 'center';
        this.fillReadableText(ctx, this.truncateText(ctx, pe.ageText || '', thirdW - 18), c3X, statsBotY, '#9499ad', isFullTrans);

        this.registerHit('play_stats', '评分与大小栏', 'element', panelX, panelY, panelW, panelH, 'module_1');
      }

      // 4) 底部紫色预览海报横条（支持直接点击上传替换）
      const stripSource = this.media.playStrip || raw.play_strip;
      if (
        pe.showPreviewStrip &&
        this.isVisible(state, 'play_strip') &&
        stripSource &&
        (stripSource.complete === undefined || stripSource.complete) &&
        (stripSource.naturalWidth || stripSource.width)
      ) {
        const stripOff = this.getOffset(state, 'play_strip');
        const stripH = Math.round(108 * vScale);
        const stripY = y + h - stripH - 12 + stripOff.y;
        const stripX = x + padX + stripOff.x;
        const stripW = w - padX * 2;

        ctx.save();
        this.roundRect(ctx, stripX, stripY, stripW, stripH, 12);
        ctx.clip();
        this.drawCoverImage(ctx, stripSource, stripX, stripY, stripW, stripH);
        ctx.restore();

        this.registerHit('play_strip', '底部预览海报条', 'element', stripX, stripY, stripW, stripH, 'module_1');
      }

      ctx.restore();
      if (!isFullTrans) {
        this.drawGlassCardRim(ctx, x, y, w, h, radius);
      }
    }

    drawGooglePlayLogo(ctx, cx, cy, r) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.85);
      ctx.lineTo(r * 0.25, 0);
      ctx.lineTo(-r * 0.7, r * 0.85);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.85);
      ctx.lineTo(r * 0.5, -r * 0.25);
      ctx.lineTo(r * 0.1, 0.1);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(r * 0.1, -r * 0.2);
      ctx.lineTo(r * 0.85, 0);
      ctx.lineTo(r * 0.1, r * 0.2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, r * 0.85);
      ctx.lineTo(r * 0.1, -0.05);
      ctx.lineTo(r * 0.5, r * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    renderCompactStatusBar(ctx, state, x, y, w, h, isFullTrans) {
      const sb = state.statusBar;
      const raw = this.media.raw || {};
      const padX = Number(sb.paddingX) || 28;
      const cy = y + h / 2 + 1;

      ctx.save();
      if (!isFullTrans) {
        ctx.fillStyle = '#0c0b13';
        ctx.fillRect(x, y, w, h);
      }

      if (this.isVisible(state, 'sb_time')) {
        const timeOff = this.getOffset(state, 'sb_time');
        const timeFs = this.getFontPx(state, 'sb_time', 22);
        ctx.font = `600 ${timeFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const timeStr = sb.time || '11:39';
        const tx = x + padX + timeOff.x;
        const ty = cy + timeOff.y;
        this.fillReadableText(ctx, timeStr, tx, ty, '#f1f3f4', isFullTrans);
        const tw = ctx.measureText(timeStr).width;
        this.registerHit('sb_time', '状态栏时间', 'element', tx - 4, ty - timeFs * 0.65, tw + 8, Math.max(26, timeFs * 1.3), 'module_1');

        if (this.isVisible(state, 'sb_notifs')) {
          let nx = tx + tw + 14;
          const sbSprite = raw.sb_notifs;
          if (sb.notifChat && sbSprite && sbSprite.complete && sbSprite.naturalWidth) {
            ctx.drawImage(sbSprite, 0, 0, 16, 20, nx, cy - 13, 21, 26);
            nx += 28;
          }
          if (sb.notifSocial && sbSprite && sbSprite.complete && sbSprite.naturalWidth) {
            ctx.drawImage(sbSprite, 17, 0, 17, 20, nx, cy - 13, 22, 26);
            nx += 28;
          }
          if (sb.notifNews && sbSprite && sbSprite.complete && sbSprite.naturalWidth) {
            ctx.drawImage(sbSprite, 35, 0, 17, 20, nx, cy - 13, 22, 26);
            nx += 28;
          }
          if (nx > tx + tw + 14) {
            this.registerHit('sb_notifs', '状态栏通知图标', 'element', tx + tw + 10, cy - 14, nx - (tx + tw + 10), 28, 'module_1');
          }
        }
      }

      if (this.isVisible(state, 'sb_system')) {
        const sysOff = this.getOffset(state, 'sb_system');
        let rx = x + w - padX + sysOff.x;
        const ry = cy + sysOff.y;
        const rightStart = rx;
        rx -= 48;
        this.drawBatteryIcon(ctx, rx, ry - 11, 46, 22, sb.battery, sb.charging);
        rx -= 10;

        if (sb.dualSim) {
          rx -= 42;
          this.drawSignalIcon(ctx, rx, ry - 12, sb.signal2, sb.networkType, 0.82);
          rx -= 8;
        }
        rx -= 42;
        this.drawSignalIcon(ctx, rx, ry - 12, sb.signal1, sb.networkType, 0.82);
        rx -= 10;

        if (sb.wifi) {
          rx -= 24;
          this.drawWifiIcon(ctx, rx + 12, ry + 7);
          rx -= 10;
        }
        if (sb.vpn) {
          rx -= 42;
          ctx.fillStyle = '#e8eaed';
          this.roundRect(ctx, rx, ry - 10, 42, 20, 5);
          ctx.fill();
          ctx.font = `800 12px ${FONT_SANS}`;
          ctx.fillStyle = '#0c0b13';
          ctx.textAlign = 'center';
          ctx.fillText('VPN', rx + 21, ry + 0.5);
          rx -= 10;
        }
        if (sb.bluetooth) {
          rx -= 18;
          this.drawBluetoothIcon(ctx, rx + 9, ry);
          rx -= 10;
        }
        if (sb.alarm) {
          rx -= 22;
          this.drawAlarmIcon(ctx, rx + 11, ry + 1);
        }
        this.registerHit('sb_system', '状态栏右侧系统群', 'element', rx - 6, ry - 14, rightStart - rx + 8, 28, 'module_1');
      }

      ctx.restore();
    }

    // ---------------------------------------------------------------------------
    // 模組 2：Laya 內容標籤欄 + 底部導航 + 指引箭頭（全元素可單獨隱藏/移動）
    // ---------------------------------------------------------------------------
    renderModule2(ctx, state, x, y, w, h, isFullTrans) {
      const nav = state.navModule;
      const raw = this.media.raw || {};
      const radius = Number(state.layout.cardRadius) || 20;
      const padX = Number(nav.paddingX) || 38;
      const padY = Number(nav.paddingY) || 20;

      if (!isFullTrans) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 8;
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.fillStyle = '#0b0a12';
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      this.roundRect(ctx, x, y, w, h, radius);
      ctx.clip();

      if (!isFullTrans) {
        const navBg = ctx.createLinearGradient(x, y, x, y + h);
        navBg.addColorStop(0, '#0f0d18');
        navBg.addColorStop(1, '#090810');
        ctx.fillStyle = navBg;
        ctx.fillRect(x, y, w, h);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(x + padX, y + Math.round(h * 0.44), w - padX * 2, 1);
      }

      const topCenterY = y + padY + 34;
      let tabX = x + padX;

      (nav.topTabs || []).forEach((tabLabel, idx) => {
        const key = `top_tab_${idx}`;
        if (!this.isVisible(state, key)) return;

        const isActive = idx === Number(nav.activeTopIndex);
        const tOff = this.getOffset(state, key);
        const drawX = tabX + tOff.x;
        const drawY = topCenterY + tOff.y;
        const tabFs = this.getFontPx(state, key, isActive ? 40 : 33);

        ctx.save();
        if (isActive) {
          ctx.font = `900 ${tabFs}px ${FONT_SANS}`;
          const tw = ctx.measureText(tabLabel).width;

          if (raw.nav_glow && raw.nav_glow.complete && raw.nav_glow.naturalWidth) {
            ctx.drawImage(raw.nav_glow, drawX - 14, drawY - 8, tw + 48, Math.max(54, Math.round(tabFs * 1.55)));
          }

          ctx.shadowColor = 'rgba(217, 70, 239, 0.65)';
          ctx.shadowBlur = 14;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          this.fillReadableText(ctx, tabLabel, drawX, drawY, '#ffffff', isFullTrans);

          this.registerHit(key, `顶部标签：${tabLabel}`, 'element', drawX - 6, drawY - tabFs * 0.65, tw + 32, Math.max(48, tabFs * 1.4), 'module_2');
          tabX += tw + 46;
        } else {
          ctx.font = `500 ${tabFs}px ${FONT_SANS}`;
          const tw = ctx.measureText(tabLabel).width;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          this.fillReadableText(ctx, tabLabel, drawX, drawY + 2, '#8b899e', isFullTrans);

          this.registerHit(key, `顶部标签：${tabLabel}`, 'element', drawX - 6, drawY - tabFs * 0.62, tw + 12, Math.max(38, tabFs * 1.3), 'module_2');
          tabX += tw + 44;
        }
        ctx.restore();
      });

      let searchIconCX = x + w - padX - 22;
      let searchIconCY = topCenterY;

      if (nav.showSearchIcon && this.isVisible(state, 'nav_top_search')) {
        const sOff = this.getOffset(state, 'nav_top_search');
        searchIconCX = x + w - padX - 22 + sOff.x;
        searchIconCY = topCenterY + sOff.y;

        ctx.fillStyle = 'rgba(168, 85, 247, 0.16)';
        ctx.beginPath();
        ctx.arc(searchIconCX, searchIconCY, 26, 0, Math.PI * 2);
        ctx.fill();

        const customSearch = this.media.customNavIcons['top_search'];
        if (customSearch) {
          this.drawCoverImage(ctx, customSearch, searchIconCX - 22, searchIconCY - 22, 44, 44);
        } else {
          this.drawMagnifier(ctx, searchIconCX, searchIconCY, 14, '#ffffff', 4.2);
        }
        this.registerHit('nav_top_search', '标签栏搜索图标', 'element', searchIconCX - 26, searchIconCY - 26, 52, 52, 'module_2');
      }

      if (nav.showTrophy && this.isVisible(state, 'nav_top_trophy')) {
        const trOff = this.getOffset(state, 'nav_top_trophy');
        const cx = x + w - padX - 108 + trOff.x;
        const cy = topCenterY + 2 + trOff.y;
        const customTrophy = this.media.customNavIcons['top_trophy'];
        if (customTrophy) {
          this.drawCoverImage(ctx, customTrophy, cx - 24, cy - 24, 48, 48);
        } else if (raw.nav_trophy && raw.nav_trophy.complete && raw.nav_trophy.naturalWidth) {
          ctx.drawImage(raw.nav_trophy, cx - 25, cy - 28, 50, 58);
        }
        this.registerHit('nav_top_trophy', '标签栏奖杯图标', 'element', cx - 26, cy - 28, 52, 56, 'module_2');
      }

      const botBaseY = y + h - padY - 72;
      const items = nav.bottomTabs || [];
      const itemSpan = (w - padX * 2) / Math.max(1, items.length);
      let funIconCX = x + w / 2;
      let funIconCY = botBaseY + 10;

      items.forEach((item, idx) => {
        const key = `bot_nav_${idx}`;
        const isActive = idx === Number(nav.activeBottomIndex);
        const bOff = this.getOffset(state, key);
        const cx = x + padX + itemSpan * (idx + 0.5) + bOff.x;
        const iconCY = botBaseY + 10 + bOff.y;
        const labelY = botBaseY + 62 + bOff.y;

        if (isActive) {
          funIconCX = cx;
          funIconCY = iconCY;
        }
        if (!this.isVisible(state, key)) return;

        if (isActive) {
          const spot = ctx.createRadialGradient(cx, iconCY + 8, 4, cx, iconCY + 8, 56);
          spot.addColorStop(0, 'rgba(236, 72, 153, 0.22)');
          spot.addColorStop(1, 'rgba(236, 72, 153, 0)');
          ctx.fillStyle = spot;
          ctx.beginPath();
          ctx.arc(cx, iconCY + 8, 56, 0, Math.PI * 2);
          ctx.fill();
        }

        const customImg = this.media.customNavIcons[item.id];
        const rawSprite = raw[item.iconKey];

        if (customImg) {
          ctx.save();
          this.roundRect(ctx, cx - 25, iconCY - 25, 50, 50, 12);
          ctx.clip();
          this.drawCoverImage(ctx, customImg, cx - 25, iconCY - 25, 50, 50);
          ctx.restore();
        } else if (rawSprite && rawSprite.complete && rawSprite.naturalWidth) {
          const sw = 60;
          const sh = 76;
          const dx = cx - sw / 2;
          const dy = iconCY - sh / 2 + 2;
          if ((idx === 2 && isActive) || (idx !== 2 && !isActive)) {
            ctx.drawImage(rawSprite, dx, dy, sw, sh);
          } else {
            this.drawTintedSprite(ctx, rawSprite, dx, dy, sw, sh, isActive);
          }
        }

        const botFs = this.getFontPx(state, key, 22);
        ctx.font = `${isActive ? '700' : '500'} ${botFs}px ${FONT_SANS}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this.fillReadableText(ctx, item.label, cx, labelY, isActive ? '#f0abfc' : '#7c7a91', isFullTrans);

        this.registerHit(key, `底部导航：${item.label}`, 'element', cx - 46, iconCY - 34, 92, 108, 'module_2');
      });

      if (nav.showGuideArrows !== false) {
        const t = this.animTime || 0;
        const bob1 = t > 0 ? Math.sin(t * 4.2) * 7 : 0;
        const bob2 = t > 0 ? Math.sin(t * 4.2 + 1.1) * 7 : 0;

        if (this.isVisible(state, 'nav_arrow_fun')) {
          if (t > 0) {
            const rip1 = (t * 0.9) % 1;
            ctx.save();
            ctx.strokeStyle = `rgba(244, 114, 182, ${(0.55 * (1 - rip1)).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(funIconCX, funIconCY + 6, 22 + rip1 * 28, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          const afOff = this.getOffset(state, 'nav_arrow_fun');
          const a1TipX = funIconCX + 34 + bob1 + afOff.x;
          const a1TipY = funIconCY + 8 + afOff.y;
          this.drawSleekPointerArrow(ctx, a1TipX + 108, a1TipY + 6, a1TipX, a1TipY);
          this.registerHit('nav_arrow_fun', '娱乐指引箭头', 'element', funIconCX + 34 + afOff.x, a1TipY - 24, 114, 52, 'module_2');
        }

        if (nav.showSearchIcon && this.isVisible(state, 'nav_arrow_search')) {
          if (t > 0) {
            const rip2 = ((t * 0.9) + 0.45) % 1;
            ctx.save();
            ctx.strokeStyle = `rgba(192, 132, 252, ${(0.55 * (1 - rip2)).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(searchIconCX, searchIconCY, 20 + rip2 * 24, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          const asOff = this.getOffset(state, 'nav_arrow_search');
          const a2TipX = searchIconCX + asOff.x;
          const a2TipY = searchIconCY + 32 + bob2 + asOff.y;
          this.drawSleekPointerArrow(ctx, a2TipX + 2, a2TipY + 114, a2TipX, a2TipY);
          this.registerHit('nav_arrow_search', '搜索指引箭头', 'element', a2TipX - 26, searchIconCY + 32 + asOff.y, 52, 120, 'module_2');
        }
      }

      ctx.restore();
      if (!isFullTrans) {
        this.drawGlassCardRim(ctx, x, y, w, h, radius);
      }
    }

    drawSleekPointerArrow(ctx, fromX, fromY, toX, toY) {
      ctx.save();
      const angle = Math.atan2(toY - fromY, toX - fromX);
      const len = Math.hypot(toX - fromX, toY - fromY);

      ctx.translate(toX, toY);
      ctx.rotate(angle);

      ctx.shadowColor = 'rgba(244, 63, 94, 0.55)';
      ctx.shadowBlur = 16;

      const grad = ctx.createLinearGradient(-len, 0, 0, 0);
      grad.addColorStop(0, 'rgba(244, 63, 94, 0.25)');
      grad.addColorStop(0.45, '#f43f5e');
      grad.addColorStop(1, '#fb7185');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-30, -17);
      ctx.lineTo(-23, -6);
      ctx.lineTo(-len, -2.5);
      ctx.arc(-len, 0, 2.5, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineTo(-23, 6);
      ctx.lineTo(-30, 17);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 228, 230, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    drawTintedSprite(ctx, sprite, dx, dy, dw, dh, makeActivePink) {
      const tc = this._tintCanvas;
      tc.width = dw;
      tc.height = dh;
      const tctx = tc.getContext('2d');
      tctx.clearRect(0, 0, dw, dh);
      tctx.drawImage(sprite, 0, 0, dw, dh);
      tctx.globalCompositeOperation = 'source-in';
      if (makeActivePink) {
        const g = tctx.createLinearGradient(0, 0, 0, dh);
        g.addColorStop(0, '#ff47b6');
        g.addColorStop(0.6, '#f498e8');
        g.addColorStop(1, '#f8e6ff');
        tctx.fillStyle = g;
      } else {
        tctx.fillStyle = '#4a4859';
      }
      tctx.fillRect(0, 0, dw, dh);
      tctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(tc, dx, dy);
    }

    // ---------------------------------------------------------------------------
    // 模組 3：搜索框 + 豐富個人信息膠囊卡片（年齡、等級、地區、位置距離、聲音標籤）
    // ---------------------------------------------------------------------------
    renderModule3(ctx, state, x, y, w, h, isFullTrans) {
      const um = state.userModule;
      const raw = this.media.raw || {};
      const radius = Number(state.layout.cardRadius) || 20;
      const padX = Number(um.paddingX) || 26;
      const padY = Number(um.paddingY) || 16;
      const gap = Number(um.itemGap) || 12;

      if (!isFullTrans) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 8;
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.fillStyle = '#0e0c18';
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      this.roundRect(ctx, x, y, w, h, radius);
      ctx.clip();

      if (!isFullTrans) {
        const m3Bg = ctx.createLinearGradient(x, y, x, y + h);
        m3Bg.addColorStop(0, '#131020');
        m3Bg.addColorStop(1, '#0c0a14');
        ctx.fillStyle = m3Bg;
        ctx.fillRect(x, y, w, h);
      }

      const searchBarH = 74;
      const sectionTitleH = 30;
      const userCardH = 152;

      const cancelStr = um.cancelText || '取消';
      const cancelFs = this.getFontPx(state, 'user_cancel_btn', 27);
      ctx.font = `600 ${cancelFs}px ${FONT_SANS}`;
      const cancelW = this.isVisible(state, 'user_cancel_btn') ? ctx.measureText(cancelStr).width : 0;

      // 1) 搜索输入框
      const boxY = y + padY;
      const boxCY = boxY + searchBarH / 2;
      if (this.isVisible(state, 'user_search_box')) {
        const sbOff = this.getOffset(state, 'user_search_box');
        const boxX = x + padX + sbOff.x;
        const drawBoxY = boxY + sbOff.y;
        const drawCY = drawBoxY + searchBarH / 2;
        const boxW = w - padX * 2 - (cancelW ? cancelW + 24 : 0);

        ctx.save();
        this.roundRect(ctx, boxX, drawBoxY, boxW, searchBarH, searchBarH / 2);
        ctx.fillStyle = isFullTrans ? 'rgba(14, 11, 24, 0.72)' : '#0a0912';
        ctx.fill();
        ctx.clip();

        const sbGlow = ctx.createRadialGradient(
          boxX + boxW * 0.42,
          drawBoxY + searchBarH + 8,
          12,
          boxX + boxW * 0.42,
          drawBoxY + searchBarH,
          boxW * 0.55
        );
        sbGlow.addColorStop(0, 'rgba(217, 70, 239, 0.42)');
        sbGlow.addColorStop(0.55, 'rgba(147, 51, 234, 0.16)');
        sbGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = sbGlow;
        ctx.fillRect(boxX, drawBoxY, boxW, searchBarH);
        ctx.restore();

        ctx.save();
        this.roundRect(ctx, boxX, drawBoxY, boxW, searchBarH, searchBarH / 2);
        const sbRim = ctx.createLinearGradient(boxX, drawBoxY, boxX + boxW, drawBoxY + searchBarH);
        sbRim.addColorStop(0, 'rgba(192, 132, 252, 0.68)');
        sbRim.addColorStop(0.55, 'rgba(234, 179, 8, 0.42)');
        sbRim.addColorStop(1, 'rgba(217, 70, 239, 0.75)');
        ctx.strokeStyle = sbRim;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        this.drawMagnifier(ctx, boxX + 38, drawCY, 12, '#e2e8f0', 3.5);

        const qStr = String(um.searchQuery || '');
        const searchFs = this.getFontPx(state, 'user_search_box', 30);
        ctx.font = `700 ${searchFs}px ${FONT_SANS}`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const textStartX = boxX + 66;
        ctx.fillText(qStr, textStartX, drawCY + 1);

        if (um.showCursor) {
          const t = this.animTime || 0;
          const cursorAlpha = t > 0 ? 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 5.6)) : 1;
          const qw = ctx.measureText(qStr).width;
          const curH = Math.max(22, Math.round(searchFs * 1.12));
          ctx.fillStyle = `rgba(96, 165, 250, ${cursorAlpha.toFixed(3)})`;
          ctx.fillRect(textStartX + qw + 4, drawCY - curH / 2, 3.2, curH);
        }

        if (um.showClearBtn) {
          const clX = boxX + boxW - 36;
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.beginPath();
          ctx.arc(clX, drawCY, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 2.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(clX - 5.5, drawCY - 5.5);
          ctx.lineTo(clX + 5.5, drawCY + 5.5);
          ctx.moveTo(clX + 5.5, drawCY - 5.5);
          ctx.lineTo(clX - 5.5, drawCY + 5.5);
          ctx.stroke();
        }
        this.registerHit('user_search_box', '搜索输入框', 'element', boxX, drawBoxY, boxW, searchBarH, 'module_3');
      }

      if (this.isVisible(state, 'user_cancel_btn')) {
        const cancelOff = this.getOffset(state, 'user_cancel_btn');
        const cancelX = x + w - padX - cancelW + cancelOff.x;
        const cancelY = boxCY + cancelOff.y;
        ctx.font = `600 ${cancelFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        this.fillReadableText(ctx, cancelStr, cancelX, cancelY, '#e2e8f0', isFullTrans);
        this.registerHit('user_cancel_btn', '取消按钮文字', 'element', cancelX - 6, cancelY - cancelFs * 0.65, cancelW + 12, Math.max(32, cancelFs * 1.3), 'module_3');
      }

      // 2) 「用户」小标题
      if (this.isVisible(state, 'user_section_label')) {
        const secOff = this.getOffset(state, 'user_section_label');
        const secX = x + padX + 4 + secOff.x;
        const secY = y + padY + searchBarH + gap + sectionTitleH / 2 + secOff.y;
        const secText = um.sectionTitle || '用户';
        const secFs = this.getFontPx(state, 'user_section_label', 23);
        ctx.font = `700 ${secFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        this.fillReadableText(ctx, secText, secX, secY, '#cbd5e1', isFullTrans);
        this.registerHit('user_section_label', '用户分组标题', 'element', secX - 4, secY - secFs * 0.65, ctx.measureText(secText).width + 12, Math.max(28, secFs * 1.3), 'module_3');
      }

      // 3) 丰富个人信息胶囊卡片（含头像、昵称、年龄徽章、等级徽章、声音标签、ID、地区城市、距离在线状态）
      if (this.isVisible(state, 'user_capsule_card')) {
        const cardOff = this.getOffset(state, 'user_capsule_card');
        const cardX = x + padX + cardOff.x;
        const cardY = y + padY + searchBarH + gap + sectionTitleH + Math.round(gap * 0.6) + cardOff.y;
        const cardW = w - padX * 2;
        const cardR = 32;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        this.roundRect(ctx, cardX, cardY, cardW, userCardH, cardR);
        const capGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + userCardH);
        capGrad.addColorStop(0, isFullTrans ? 'rgba(54, 33, 76, 0.85)' : '#36214c');
        capGrad.addColorStop(0.48, isFullTrans ? 'rgba(34, 22, 52, 0.85)' : '#221634');
        capGrad.addColorStop(1, isFullTrans ? 'rgba(88, 28, 104, 0.85)' : '#581c68');
        ctx.fillStyle = capGrad;
        ctx.fill();
        ctx.clip();

        const peachGlow = ctx.createRadialGradient(cardX + 58, cardY + userCardH, 8, cardX + 58, cardY + userCardH, 140);
        peachGlow.addColorStop(0, 'rgba(251, 146, 160, 0.45)');
        peachGlow.addColorStop(0.55, 'rgba(217, 70, 239, 0.18)');
        peachGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = peachGlow;
        ctx.fillRect(cardX, cardY, 240, userCardH);
        ctx.restore();

        ctx.save();
        this.roundRect(ctx, cardX, cardY, cardW, userCardH, cardR);
        const capRim = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + userCardH);
        capRim.addColorStop(0, 'rgba(249, 168, 212, 0.55)');
        capRim.addColorStop(0.5, 'rgba(168, 85, 247, 0.28)');
        capRim.addColorStop(1, 'rgba(232, 121, 249, 0.5)');
        ctx.strokeStyle = capRim;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.restore();

        this.registerHit('user_capsule_card', '个人信息胶囊卡', 'element', cardX, cardY, cardW, userCardH, 'module_3');

        // 圆形头像
        const avSize = 112;
        const baseInfoX = cardX + 20 + avSize + 22;
        if (this.isVisible(state, 'user_avatar')) {
          const avOff = this.getOffset(state, 'user_avatar');
          const avX = cardX + 20 + avOff.x;
          const avY = cardY + (userCardH - avSize) / 2 + avOff.y;
          const avatarSrc = this.media.userAvatar || raw.user_avatar;

          if (avatarSrc) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
            ctx.clip();
            this.drawCoverImage(ctx, avatarSrc, avX, avY, avSize, avSize);
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(245, 208, 254, 0.6)';
            ctx.lineWidth = 2.4;
            ctx.stroke();
            ctx.restore();
          }
          this.registerHit('user_avatar', '用户圆形头像', 'element', avX, avY, avSize, avSize, 'module_3');
        }

        // 第一行：昵称 + 年龄性别徽章 + 等级徽章 + 声音标签
        let row1CurX = baseInfoX;
        const row1Y = cardY + 38;

        if (this.isVisible(state, 'user_nickname')) {
          const nickOff = this.getOffset(state, 'user_nickname');
          const nx = row1CurX + nickOff.x;
          const ny = row1Y + nickOff.y;
          const nickStr = um.nickname || '小猫/花泽类';
          const nickFs = this.getFontPx(state, 'user_nickname', 29);
          ctx.font = `700 ${nickFs}px ${FONT_SANS}`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(nickStr, nx, ny);
          const nw = ctx.measureText(nickStr).width;
          this.registerHit('user_nickname', '用户昵称', 'element', nx - 4, ny - nickFs * 0.65, nw + 8, Math.max(32, nickFs * 1.3), 'module_3');
          row1CurX += nw + 12;
        }

        // 性别 + 年龄徽章（例如 ♀ 22岁）
        if (um.age && this.isVisible(state, 'user_age_badge')) {
          const ageOff = this.getOffset(state, 'user_age_badge');
          const ageFs = this.getFontPx(state, 'user_age_badge', 17);
          const genderSym = um.gender === 'female' ? '♀' : um.gender === 'male' ? '♂' : '';
          const ageStr = `${genderSym} ${um.age}`.trim();
          const ph = Math.max(24, Math.round(ageFs * 1.52));
          const pw = this.drawTagPill(
            ctx,
            ageStr,
            row1CurX + ageOff.x,
            row1Y + ageOff.y,
            um.gender === 'male' ? '#2563eb' : '#db2777',
            um.gender === 'male' ? '#0ea5e9' : '#ec4899',
            '#ffffff',
            ageFs
          );
          this.registerHit('user_age_badge', '年龄性别徽章', 'element', row1CurX + ageOff.x, row1Y - ph / 2 + ageOff.y, pw, ph + 2, 'module_3');
          row1CurX += pw + 8;
        }

        // 等级徽章（例如 Lv.22）
        if (um.level && this.isVisible(state, 'user_level_badge')) {
          const lvOff = this.getOffset(state, 'user_level_badge');
          const lvFs = this.getFontPx(state, 'user_level_badge', 17);
          const ph = Math.max(24, Math.round(lvFs * 1.52));
          const pw = this.drawTagPill(
            ctx,
            String(um.level),
            row1CurX + lvOff.x,
            row1Y + lvOff.y,
            '#7e22ce',
            '#a855f7',
            '#fae8ff',
            lvFs
          );
          this.registerHit('user_level_badge', '等级徽章', 'element', row1CurX + lvOff.x, row1Y - ph / 2 + lvOff.y, pw, ph + 2, 'module_3');
          row1CurX += pw + 8;
        }

        // 声音/个性标签（例如 🎧 温柔甜妹音）
        if (um.bioTag && this.isVisible(state, 'user_bio_tag')) {
          const bioOff = this.getOffset(state, 'user_bio_tag');
          const bioFs = this.getFontPx(state, 'user_bio_tag', 17);
          const ph = Math.max(24, Math.round(bioFs * 1.52));
          const pw = this.drawSubtleGlassPill(
            ctx,
            um.bioTag,
            row1CurX + bioOff.x,
            row1Y + bioOff.y,
            'rgba(216, 180, 254, 0.16)',
            '#f3e8ff',
            bioFs
          );
          this.registerHit('user_bio_tag', '声音个性标签', 'element', row1CurX + bioOff.x, row1Y - ph / 2 + bioOff.y, pw, ph + 2, 'module_3');
        }

        // 第二行：同步 ID
        const row2Y = cardY + 80;
        if (this.isVisible(state, 'user_id_row')) {
          const idOff = this.getOffset(state, 'user_id_row');
          const idX = baseInfoX + idOff.x;
          const idY = row2Y + idOff.y;
          const idFullText = `ID: ${um.userId || ''}`;
          const idFs = this.getFontPx(state, 'user_id_row', 22);
          ctx.font = `600 ${idFs}px ${FONT_SANS}`;
          ctx.fillStyle = '#c4b5fd';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(idFullText, idX, idY);
          this.registerHit('user_id_row', '个人卡片 ID', 'element', idX - 4, idY - idFs * 0.65, ctx.measureText(idFullText).width + 10, Math.max(28, idFs * 1.3), 'module_3');
        }

        // 第三行：地区位置 + 距离与在线状态
        let row3CurX = baseInfoX;
        const row3Y = cardY + 118;

        if (um.region && this.isVisible(state, 'user_region')) {
          const regOff = this.getOffset(state, 'user_region');
          const regFs = this.getFontPx(state, 'user_region', 17);
          const ph = Math.max(24, Math.round(regFs * 1.52));
          const regStr = `📍 ${um.region}`;
          const pw = this.drawSubtleGlassPill(
            ctx,
            regStr,
            row3CurX + regOff.x,
            row3Y + regOff.y,
            'rgba(255, 255, 255, 0.09)',
            '#e2e8f0',
            regFs
          );
          this.registerHit('user_region', '地区位置标签', 'element', row3CurX + regOff.x, row3Y - ph / 2 + regOff.y, pw, ph + 2, 'module_3');
          row3CurX += pw + 10;
        }

        if (um.distance && this.isVisible(state, 'user_distance')) {
          const distOff = this.getOffset(state, 'user_distance');
          const distFs = this.getFontPx(state, 'user_distance', 17);
          const ph = Math.max(24, Math.round(distFs * 1.52));
          const dx = row3CurX + distOff.x;
          const dy = row3Y + distOff.y;
          const pw = this.drawOnlineDistancePill(ctx, um.distance, dx, dy, distFs);
          this.registerHit('user_distance', '距离与在线状态', 'element', dx, dy - ph / 2, pw, ph + 2, 'module_3');
        }

        // 右侧进入箭头圆钮
        if (this.isVisible(state, 'user_go_arrow')) {
          const goOff = this.getOffset(state, 'user_go_arrow');
          const goX = cardX + cardW - 42 + goOff.x;
          const goY = cardY + userCardH / 2 + goOff.y;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.beginPath();
          ctx.arc(goX, goY, 20, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#e9d5ff';
          ctx.lineWidth = 2.6;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(goX - 3, goY - 7);
          ctx.lineTo(goX + 5, goY);
          ctx.lineTo(goX - 3, goY + 7);
          ctx.stroke();
          this.registerHit('user_go_arrow', '卡片右侧箭头钮', 'element', goX - 22, goY - 22, 44, 44, 'module_3');
        }
      }

      ctx.restore();
      if (!isFullTrans) {
        this.drawGlassCardRim(ctx, x, y, w, h, radius);
      }
    }

    drawTagPill(ctx, text, x, centerY, c1, c2, textColor, fontSize) {
      const fs = fontSize || 17;
      ctx.save();
      ctx.font = `700 ${fs}px ${FONT_SANS}`;
      const tw = ctx.measureText(text).width;
      const padH = Math.max(16, Math.round(fs * 1.15));
      const pw = tw + padH;
      const ph = Math.max(24, Math.round(fs * 1.52));
      const py = centerY - ph / 2;
      const g = ctx.createLinearGradient(x, py, x + pw, py + ph);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      this.roundRect(ctx, x, py, pw, ph, ph / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.38)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + pw / 2, centerY + 1);
      ctx.restore();
      return pw;
    }

    drawSubtleGlassPill(ctx, text, x, centerY, bgRgba, textColor, fontSize) {
      const fs = fontSize || 17;
      ctx.save();
      ctx.font = `500 ${fs}px ${FONT_SANS}`;
      const tw = ctx.measureText(text).width;
      const padX = Math.max(10, Math.round(fs * 0.58));
      const pw = tw + padX * 2;
      const ph = Math.max(24, Math.round(fs * 1.52));
      const py = centerY - ph / 2;
      ctx.fillStyle = bgRgba;
      this.roundRect(ctx, x, py, pw, ph, ph / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(216, 180, 254, 0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + padX, centerY + 1);
      ctx.restore();
      return pw;
    }

    drawOnlineDistancePill(ctx, text, x, centerY, fontSize) {
      const fs = fontSize || 17;
      ctx.save();
      ctx.font = `500 ${fs}px ${FONT_SANS}`;
      const tw = ctx.measureText(text).width;
      const dotR = Math.max(3.6, fs * 0.24);
      const leadX = Math.round(dotR * 2 + 15);
      const pw = tw + leadX + Math.max(10, Math.round(fs * 0.55));
      const ph = Math.max(24, Math.round(fs * 1.52));
      const py = centerY - ph / 2;
      ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
      this.roundRect(ctx, x, py, pw, ph, ph / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 翠绿在线呼吸小圆点
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(x + Math.round(leadX * 0.52), centerY, dotR, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#d1fae5';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + leadX, centerY + 1);
      ctx.restore();
      return pw;
    }

    // ---------------------------------------------------------------------------
    // 模組 4：雙列視頻卡片流（底部自動同步上方用戶頭像與暱稱，全子元素可隱藏/刪除/移動）
    // ---------------------------------------------------------------------------
    renderModule4(ctx, state, x, y, w, availH, isFullTrans) {
      const fm = state.feedModule;
      const um = state.userModule;
      const raw = this.media.raw || {};
      const padX = Number(fm.paddingX) || 0;
      const padY = Number(fm.paddingY) || 0;
      const gap = Number(fm.cardGap) || 16;
      const radius = Number(state.layout.cardRadius) || 20;
      const visibleCards = (fm.cards || []).filter((c) => this.isVisible(state, `feed_card_${c.id}`));

      const colW = (w - padX * 2 - gap) / 2;
      const footerH = Number(fm.footerHeight) || 92;
      const mediaH = Math.max(360, availH - footerH - padY * 2);
      const cardH = mediaH + footerH;

      const rows = Math.max(1, Math.ceil(visibleCards.length / 2));
      const totalH = padY * 2 + rows * cardH + (rows - 1) * gap;

      // 獲取上方用戶卡片同步過來的頭像與暱稱
      const syncedAvatar = this.media.userAvatar || raw.user_avatar;
      const syncedNickname = um.nickname || '小猫/花泽类';

      ctx.save();
      (fm.cards || []).forEach((card, idx) => {
        const cardHitKey = `feed_card_${card.id}`;
        if (!this.isVisible(state, cardHitKey)) return;

        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cOff = this.getOffset(state, cardHitKey);
        const cx = x + padX + col * (colW + gap) + cOff.x;
        const cy = y + padY + row * (cardH + gap) + cOff.y;

        if (!isFullTrans) {
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
          ctx.shadowBlur = 26;
          ctx.shadowOffsetY = 8;
          this.roundRect(ctx, cx, cy, colW, cardH, radius);
          ctx.fillStyle = '#141122';
          ctx.fill();
          ctx.restore();
        }

        ctx.save();
        this.roundRect(ctx, cx, cy, colW, cardH, radius);
        ctx.clip();

        const mediaEntry = this.media.cardMedia[card.id];
        const useUneditedOrig = !mediaEntry && global.LayaDefaults.isCardUneditedDefault(state, card);

        let mediaSource = null;
        let isVideo = false;
        let isVideoPaused = true;

        if (mediaEntry && mediaEntry.el) {
          mediaSource = mediaEntry.el;
          isVideo = mediaEntry.type === 'video';
          if (isVideo) isVideoPaused = mediaSource.paused;
        } else if (useUneditedOrig) {
          mediaSource = card.defaultVariant === 'girl' ? raw.card_girl_orig : raw.card_boy_orig;
        } else {
          mediaSource = card.defaultVariant === 'girl' ? raw.card_girl_clean : raw.card_boy_clean;
        }

        if (mediaSource && this.isVisible(state, `card_cover_${card.id}`)) {
          this.drawCoverImage(ctx, mediaSource, cx, cy, colW, mediaH);
        }

        // 右上角播放角標（可單獨隱藏/移動）
        const badgeKey = `card_badge_${card.id}`;
        if (card.showPlayBadge !== false && this.isVisible(state, badgeKey)) {
          const bOff = this.getOffset(state, badgeKey);
          const pbX = cx + colW - 34 + bOff.x;
          const pbY = cy + 32 + bOff.y;
          if (!useUneditedOrig) {
            ctx.fillStyle = 'rgba(12, 10, 22, 0.56)';
            ctx.beginPath();
            ctx.arc(pbX, pbY, 19, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(pbX - 4, pbY - 8);
            ctx.lineTo(pbX + 9, pbY);
            ctx.lineTo(pbX - 4, pbY + 8);
            ctx.closePath();
            ctx.fill();
          }

          this.registerHit(badgeKey, `卡片 ${idx + 1} 播放角标`, 'element', pbX - 22, pbY - 22, 44, 44, 'module_4');
          this.playButtons.push({
            cardId: card.id,
            isVideo,
            isPaused: isVideoPaused,
            x: pbX - 26,
            y: pbY - 26,
            w: 52,
            h: 52,
            cardX: cx,
            cardY: cy,
            cardW: colW,
            mediaH
          });
        }

        // 画面大标题（可单独调整字号/隐藏/删除/移动）
        const titleKey = `card_title_${card.id}`;
        if (card.overlayTitle && this.isVisible(state, titleKey)) {
          const tOff = this.getOffset(state, titleKey);
          const fontSize = this.getFontPx(state, titleKey, Number(fm.titleFontSize) || 38);
          const strokeW = Math.max(5, Math.round(fontSize * 0.24 * 10) / 10);
          const lineH = Math.round(fontSize * 1.24);
          const lines = String(card.overlayTitle).split('\n');
          const startTY = cy + 80 + tOff.y;
          const centerTX = cx + colW / 2 + tOff.x;

          if (!useUneditedOrig) {
            lines.forEach((line, lIdx) => {
              const ly = startTY + lIdx * lineH;
              this.drawStrokedRichLine(ctx, line, centerTX, ly, fontSize, 900, strokeW, '#ffffff', '#f43f5e');
            });
          }

          this.registerHit(
            titleKey,
            `卡片 ${idx + 1} 标题`,
            'element',
            centerTX - colW * 0.44,
            startTY - fontSize * 0.6,
            colW * 0.88,
            lines.length * lineH,
            'module_4'
          );
        }

        // 画面下方字幕（可单独调整字号/隐藏/删除/移动）
        const subKey = `card_sub_${card.id}`;
        if (card.overlaySubtitle && this.isVisible(state, subKey)) {
          const subOff = this.getOffset(state, subKey);
          const subSize = this.getFontPx(state, subKey, Number(fm.subtitleFontSize) || 24);
          const subStroke = Math.max(4, Math.round(subSize * 0.27 * 10) / 10);
          const subLines = String(card.overlaySubtitle).split('\n');
          const lineH = Math.round(subSize * 1.28);
          const baseSubY = cy + mediaH - 42 - (subLines.length - 1) * lineH + subOff.y;
          const subCX = cx + colW / 2 + subOff.x;

          if (!useUneditedOrig) {
            subLines.forEach((line, sIdx) => {
              this.drawStrokedRichLine(
                ctx,
                line,
                subCX,
                baseSubY + sIdx * lineH,
                subSize,
                700,
                subStroke,
                '#f8fafc',
                '#fbbf24'
              );
            });
          }

          this.registerHit(
            subKey,
            `卡片 ${idx + 1} 字幕`,
            'element',
            subCX - colW * 0.44,
            baseSubY - subSize * 0.65,
            colW * 0.88,
            subLines.length * lineH + 6,
            'module_4'
          );
        }

        // 卡片底部两行结构：
        // 第1行：帖子标题摘要
        // 第2行：左侧【同步上方用户头像 + 昵称】 + 右侧【爱心点赞数】
        const footerY = cy + mediaH;
        if (!isFullTrans) {
          const fBg = ctx.createLinearGradient(cx, footerY, cx, footerY + footerH);
          fBg.addColorStop(0, '#181428');
          fBg.addColorStop(1, '#110e1d');
          ctx.fillStyle = fBg;
          ctx.fillRect(cx, footerY, colW, footerH);

          ctx.fillStyle = 'rgba(192, 132, 252, 0.14)';
          ctx.fillRect(cx, footerY, colW, 1);
        }

        // 底部第1行：标题摘要
        const ftKey = `card_ft_${card.id}`;
        if (fm.showFooterTitle && this.isVisible(state, ftKey)) {
          const ftOff = this.getOffset(state, ftKey);
          const ftFs = this.getFontPx(state, ftKey, 20);
          const rawFooter =
            card.footerTitle || String(card.overlayTitle || '').replace(/\n+/g, ' ').replace(/\*/g, '');
          const ftX = cx + 16 + ftOff.x;
          const ftY = footerY + 26 + ftOff.y;
          const availW = colW - 32;

          ctx.font = `600 ${ftFs}px ${FONT_SANS}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const shortTitle = this.truncateText(ctx, rawFooter, availW);
          this.fillReadableText(ctx, shortTitle, ftX, ftY, '#f1effa', isFullTrans);

          this.registerHit(
            ftKey,
            `卡片 ${idx + 1} 底部标题`,
            'element',
            ftX - 4,
            ftY - ftFs * 0.65,
            Math.min(availW, ctx.measureText(shortTitle).width + 10),
            Math.max(26, ftFs * 1.3),
            'module_4'
          );
        }

        const botRowCY = fm.showFooterTitle && this.isVisible(state, ftKey) ? footerY + 66 : footerY + footerH / 2;

        // 底部第2行右侧：爱心点赞胶囊
        let rightLimitX = cx + colW - 14;
        const likeKey = `card_likes_${card.id}`;
        if (this.isVisible(state, likeKey)) {
          const likeOff = this.getOffset(state, likeKey);
          const likeFs = this.getFontPx(state, likeKey, 18);
          const likeStr = String(card.likes || '0');
          ctx.font = `600 ${likeFs}px ${FONT_SANS}`;
          const likeTW = ctx.measureText(likeStr).width;
          const heartSize = Math.max(6, likeFs * 0.39);
          const textLead = Math.round(heartSize * 2 + 14);
          const pillW = likeTW + textLead + Math.max(10, Math.round(likeFs * 0.65));
          const pillH = Math.max(26, Math.round(likeFs * 1.56));
          const pillX = cx + colW - 14 - pillW + likeOff.x;
          const pillY = botRowCY - pillH / 2 + likeOff.y;

          ctx.fillStyle = 'rgba(168, 85, 247, 0.14)';
          this.roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
          ctx.fill();

          this.drawHeartOutline(ctx, pillX + Math.round(textLead * 0.54), botRowCY + likeOff.y, heartSize, '#f472b6');

          ctx.fillStyle = '#e9d5ff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(likeStr, pillX + textLead, botRowCY + likeOff.y + 1);

          this.registerHit(likeKey, `卡片 ${idx + 1} 点赞数`, 'element', pillX, pillY, pillW, pillH, 'module_4');
          rightLimitX = pillX - 10;
        }

        // 底部第2行左侧：与上方个人卡片实时同步的【圆形小头像 + 昵称】
        const authorKey = `card_author_${card.id}`;
        if (fm.syncAuthorFromUser !== false && this.isVisible(state, authorKey)) {
          const auOff = this.getOffset(state, authorKey);
          const auFs = this.getFontPx(state, authorKey, 18);
          const auX = cx + 16 + auOff.x;
          const auY = botRowCY + auOff.y;
          const miniAv = Math.max(24, Math.round(auFs * 1.55));

          if (syncedAvatar) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(auX + miniAv / 2, auY, miniAv / 2, 0, Math.PI * 2);
            ctx.clip();
            this.drawCoverImage(ctx, syncedAvatar, auX, auY - miniAv / 2, miniAv, miniAv);
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.arc(auX + miniAv / 2, auY, miniAv / 2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(232, 121, 249, 0.6)';
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.restore();
          }

          const nameStartX = auX + miniAv + 9;
          const maxAuthorW = Math.max(60, rightLimitX - nameStartX);
          ctx.font = `500 ${auFs}px ${FONT_SANS}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const shortNick = this.truncateText(ctx, syncedNickname, maxAuthorW);
          this.fillReadableText(ctx, shortNick, nameStartX, auY + 1, '#b8b2d1', isFullTrans);

          const totalAuW = miniAv + 9 + ctx.measureText(shortNick).width + 6;
          this.registerHit(authorKey, `卡片 ${idx + 1} 同步头像昵称`, 'element', auX - 2, auY - Math.max(16, auFs * 0.8), totalAuW, Math.max(32, auFs * 1.6), 'module_4');
        }

        ctx.restore();
        if (!isFullTrans) {
          this.drawGlassCardRim(ctx, cx, cy, colW, cardH, radius);
        }

        this.registerHit(cardHitKey, `视频卡片 ${idx + 1}`, 'element', cx, cy, colW, cardH, 'module_4');
      });

      ctx.restore();
      return totalH;
    }

    fillReadableText(ctx, text, x, y, fillStyle, addShadowOutline) {
      ctx.save();
      if (addShadowOutline) {
        ctx.strokeStyle = 'rgba(8, 6, 17, 0.88)';
        ctx.lineWidth = 4.5;
        ctx.lineJoin = 'round';
        ctx.strokeText(text, x, y);
      }
      ctx.fillStyle = fillStyle;
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    // ---------------------------------------------------------------------------
    // 編輯器覆蓋層（新增畫布內直點「✕ 隱藏」快捷膠囊鈕）
    // ---------------------------------------------------------------------------
    renderOverlay(uiState) {
      const octx = this.octx;
      const W = this.W;
      const H = this.H;
      octx.clearRect(0, 0, W, H);
      this.deleteActionBox = null;
      if (!uiState) return;

      this.playButtons.forEach((pb) => {
        if (!pb.isVideo) return;
        const isHoveredCard = uiState.hoveredCardId === pb.cardId;
        if (pb.isPaused || isHoveredCard) {
          const midX = pb.cardX + pb.cardW / 2;
          const midY = pb.cardY + pb.mediaH / 2;
          octx.save();
          octx.fillStyle = 'rgba(12, 10, 22, 0.65)';
          octx.beginPath();
          octx.arc(midX, midY, 40, 0, Math.PI * 2);
          octx.fill();
          octx.strokeStyle = 'rgba(216, 180, 254, 0.85)';
          octx.lineWidth = 2.5;
          octx.stroke();

          octx.fillStyle = '#ffffff';
          if (pb.isPaused) {
            octx.beginPath();
            octx.moveTo(midX - 9, midY - 14);
            octx.lineTo(midX + 16, midY);
            octx.lineTo(midX - 9, midY + 14);
            octx.closePath();
            octx.fill();
          } else {
            octx.fillRect(midX - 11, midY - 14, 7, 28);
            octx.fillRect(midX + 4, midY - 14, 7, 28);
          }
          octx.restore();
        }
      });

      if (uiState.hoveredBox && (!uiState.selectedBox || uiState.hoveredBox.key !== uiState.selectedBox.key)) {
        const b = uiState.hoveredBox;
        octx.save();
        octx.strokeStyle = 'rgba(192, 132, 252, 0.78)';
        octx.lineWidth = 2;
        octx.setLineDash([8, 6]);
        octx.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
        const tagY = b.y < 130 ? b.bottom + 36 : b.y - 8;
        const isUploadable =
          b.key === 'play_icon' ||
          b.key === 'play_store_logo' ||
          b.key === 'floating_brand_logo' ||
          b.key === 'play_strip' ||
          b.key === 'nav_top_trophy' ||
          b.key === 'nav_top_search' ||
          b.key === 'user_avatar' ||
          b.key.startsWith('feed_card_');
        const isTextEl = Boolean(global.LayaDefaults && global.LayaDefaults.getTextElementMeta(null, b.key));
        const hintSuffix =
          b.kind === 'module'
            ? ' · 按住拖动'
            : isUploadable
            ? ' · 点击上传图片/视频'
            : isTextEl
            ? ' · 点击改字/单独调大小'
            : ' · 按住拖动/可隐藏';
        this.drawGizmoTag(octx, `${b.label}${hintSuffix}`, b.x, tagY, 'rgba(109, 40, 217, 0.92)');
        octx.restore();
      }

      if (uiState.selectedBox) {
        const b = uiState.selectedBox;
        octx.save();
        octx.strokeStyle = '#e879f9';
        octx.lineWidth = 2.6;
        octx.setLineDash([10, 5]);
        octx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);

        const corners = [
          [b.x - 4, b.y - 4],
          [b.x + b.w + 4, b.y - 4],
          [b.x - 4, b.y + b.h + 4],
          [b.x + b.w + 4, b.y + b.h + 4]
        ];
        octx.setLineDash([]);
        octx.fillStyle = '#fae8ff';
        corners.forEach(([px, py]) => {
          octx.fillRect(px - 5, py - 5, 10, 10);
        });

        const selTagY = b.y < 130 ? b.bottom + 38 : b.y - 10;
        const tagRect = this.drawGizmoTag(octx, `${b.label}`, b.x, selTagY, '#9333ea');

        // 紧贴标签右侧绘制红色「✕ 隐藏」快捷点击按钮
        const delText = '✕ 隐藏';
        octx.font = `700 17px ${FONT_SANS}`;
        const delW = octx.measureText(delText).width + 20;
        const delH = tagRect.h;
        let delX = tagRect.x + tagRect.w + 8;
        if (delX + delW > W - 8) {
          delX = Math.max(8, tagRect.x - delW - 8);
        }
        const delY = tagRect.y;

        this.roundRect(octx, delX, delY, delW, delH, 7);
        octx.fillStyle = '#e11d48';
        octx.fill();
        octx.fillStyle = '#ffffff';
        octx.textAlign = 'center';
        octx.textBaseline = 'middle';
        octx.fillText(delText, delX + delW / 2, delY + delH / 2 + 1);

        this.deleteActionBox = {
          key: b.key,
          label: b.label,
          x: delX - 4,
          y: delY - 4,
          w: delW + 8,
          h: delH + 8
        };
        octx.restore();
      }

      if (uiState.guides && uiState.guides.length > 0) {
        octx.save();
        uiState.guides.forEach((g) => {
          octx.strokeStyle = g.primary ? '#38bdf8' : '#e879f9';
          octx.lineWidth = g.primary ? 2.5 : 2;
          octx.setLineDash([12, 8]);
          octx.beginPath();
          if (g.axis === 'x') {
            octx.moveTo(g.pos, 0);
            octx.lineTo(g.pos, H);
          } else {
            octx.moveTo(0, g.pos);
            octx.lineTo(W, g.pos);
          }
          octx.stroke();

          if (g.label) {
            octx.setLineDash([]);
            const lx = g.axis === 'x' ? Math.min(W - 180, g.pos + 10) : 24;
            const ly = g.axis === 'x' ? 42 : Math.max(32, g.pos - 10);
            this.drawGizmoTag(octx, g.label, lx, ly, g.primary ? '#0284c7' : '#a21caf');
          }
        });
        octx.restore();
      }
    }

    drawGizmoTag(ctx, text, x, y, bg) {
      const W = this.W;
      const H = this.H;
      ctx.save();
      ctx.font = `600 18px ${FONT_SANS}`;
      const tw = ctx.measureText(text).width;
      const pw = tw + 18;
      const ph = 28;
      const clampedX = Math.max(8, Math.min(W - pw - 96, x));
      const clampedY = Math.max(6, Math.min(H - ph - 6, y - ph));
      this.roundRect(ctx, clampedX, clampedY, pw, ph, 7);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, clampedX + 9, clampedY + ph / 2 + 1);
      ctx.restore();
      return { x: clampedX, y: clampedY, w: pw, h: ph };
    }

    // ---------------------------------------------------------------------------
    // 基礎繪圖方法
    // ---------------------------------------------------------------------------
    drawStrokedRichLine(ctx, rawLine, centerX, centerY, fontSize, weight, strokeW, normalColor, accentColor) {
      const segments = [];
      const regex = /\*([^*]+)\*|([^*]+)/g;
      let match;
      while ((match = regex.exec(rawLine)) !== null) {
        if (match[1] !== undefined) {
          segments.push({ text: match[1], accent: true });
        } else if (match[2] !== undefined) {
          segments.push({ text: match[2], accent: false });
        }
      }

      ctx.save();
      ctx.font = `${weight} ${fontSize}px ${FONT_SANS}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;

      const totalW = segments.reduce((acc, s) => acc + ctx.measureText(s.text).width, 0);
      let curX = centerX - totalW / 2;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.strokeStyle = '#050507';
      ctx.lineWidth = strokeW;
      let sx = curX;
      segments.forEach((seg) => {
        ctx.strokeText(seg.text, sx, centerY);
        sx += ctx.measureText(seg.text).width;
      });
      ctx.restore();

      segments.forEach((seg) => {
        ctx.fillStyle = seg.accent ? accentColor : normalColor;
        ctx.fillText(seg.text, curX, centerY);
        curX += ctx.measureText(seg.text).width;
      });
      ctx.restore();
    }

    drawMagnifier(ctx, cx, cy, r, color, lw) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lw || 3.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx - 2, cy - 2, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 2 + r * 0.72, cy - 2 + r * 0.72);
      ctx.lineTo(cx - 2 + r * 1.48, cy - 2 + r * 1.48);
      ctx.stroke();
      ctx.restore();
    }

    drawBatteryIcon(ctx, x, y, w, h, pct, charging) {
      ctx.save();
      const clamped = Math.max(1, Math.min(100, Number(pct) || 70));
      ctx.fillStyle = '#484a52';
      this.roundRect(ctx, x, y, w, h, 6);
      ctx.fill();
      ctx.fillRect(x + w + 1.5, y + h * 0.28, 3, h * 0.44);

      ctx.save();
      this.roundRect(ctx, x, y, w, h, 6);
      ctx.clip();
      const fillW = Math.max(8, (w * clamped) / 100);
      ctx.fillStyle = clamped <= 20 ? '#ef4444' : charging ? '#4ade80' : '#f1f3f4';
      ctx.fillRect(x, y, fillW, h);
      ctx.restore();

      ctx.font = `800 13px ${FONT_SANS}`;
      ctx.fillStyle = '#0b0b0e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(241, 243, 244, 0.85)';
      ctx.lineWidth = 2;
      const txt = charging ? `${clamped}⚡` : String(clamped);
      ctx.strokeText(txt, x + w / 2, y + h / 2 + 1);
      ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
      ctx.restore();
    }

    drawSignalIcon(ctx, x, y, bars, netType, scale) {
      const s = scale || 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.font = `800 13px ${FONT_SANS}`;
      ctx.fillStyle = '#f1f3f4';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(netType || '5G', 0, -2);

      ctx.beginPath();
      ctx.arc(5, 24, 2.5, 0, Math.PI * 2);
      ctx.fill();

      const activeBars = Math.max(1, Math.min(4, Number(bars) || 4));
      for (let i = 0; i < 4; i++) {
        const bh = 8 + i * 5;
        const bx = 17 + i * 7.5;
        const by = 29 - bh;
        ctx.fillStyle = i < activeBars ? '#f1f3f4' : '#484a52';
        this.roundRect(ctx, bx, by, 5, bh, 1.8);
        ctx.fill();
      }
      ctx.restore();
    }

    drawWifiIcon(ctx, cx, bottomY) {
      ctx.save();
      ctx.strokeStyle = '#f1f3f4';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, bottomY, i * 5.5, Math.PI * 1.22, Math.PI * 1.78);
        ctx.stroke();
      }
      ctx.fillStyle = '#f1f3f4';
      ctx.beginPath();
      ctx.arc(cx, bottomY - 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawBluetoothIcon(ctx, cx, cy) {
      ctx.save();
      ctx.strokeStyle = '#e8eaed';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 6);
      ctx.lineTo(cx + 5, cy + 5);
      ctx.lineTo(cx, cy + 11);
      ctx.lineTo(cx, cy - 11);
      ctx.lineTo(cx + 5, cy - 5);
      ctx.lineTo(cx - 5, cy + 6);
      ctx.stroke();
      ctx.restore();
    }

    drawAlarmIcon(ctx, cx, cy) {
      ctx.save();
      ctx.fillStyle = '#f1f3f4';
      ctx.beginPath();
      ctx.arc(cx, cy + 1, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f1f3f4';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy - 7);
      ctx.lineTo(cx - 5, cy - 10);
      ctx.moveTo(cx + 9, cy - 7);
      ctx.lineTo(cx + 5, cy - 10);
      ctx.stroke();
      ctx.strokeStyle = '#0b0b0e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 3);
      ctx.lineTo(cx, cy + 1);
      ctx.lineTo(cx + 3.5, cy + 3.5);
      ctx.stroke();
      ctx.restore();
    }

    drawStar(ctx, cx, cy, outerR, color) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      const innerR = outerR * 0.46;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawDownloadTrayIcon(ctx, cx, cy, color, scale) {
      const s = scale || 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(0, 3);
      ctx.moveTo(-5, -1);
      ctx.lineTo(0, 4);
      ctx.lineTo(5, -1);
      ctx.moveTo(-8, 8);
      ctx.lineTo(8, 8);
      ctx.stroke();
      ctx.restore();
    }

    drawHeartOutline(ctx, cx, cy, size, color) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(0, size * 0.85);
      ctx.bezierCurveTo(-size * 1.3, size * 0.05, -size * 1.25, -size * 0.95, 0, -size * 0.35);
      ctx.bezierCurveTo(size * 1.25, -size * 0.95, size * 1.3, size * 0.05, 0, size * 0.85);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    drawCoverImage(ctx, source, dx, dy, dw, dh) {
      if (!source) return;
      const sw = source.videoWidth || source.naturalWidth || source.width || dw;
      const sh = source.videoHeight || source.naturalHeight || source.height || dh;
      if (!sw || !sh) return;

      const scale = Math.max(dw / sw, dh / sh);
      const cropW = dw / scale;
      const cropH = dh / scale;
      const sx = (sw - cropW) / 2;
      const sy = (sh - cropH) / 2;
      try {
        ctx.drawImage(source, sx, sy, cropW, cropH, dx, dy, dw, dh);
      } catch (_) {}
    }

    drawContainImage(ctx, source, dx, dy, dw, dh) {
      if (!source) return;
      const sw = source.videoWidth || source.naturalWidth || source.width || dw;
      const sh = source.videoHeight || source.naturalHeight || source.height || dh;
      if (!sw || !sh) return;
      const scale = Math.min(dw / sw, dh / sh);
      const rw = sw * scale;
      const rh = sh * scale;
      try {
        ctx.drawImage(source, dx + (dw - rw) / 2, dy + (dh - rh) / 2, rw, rh);
      } catch (_) {}
    }

    truncateText(ctx, text, maxWidth) {
      if (!text) return '';
      if (ctx.measureText(text).width <= maxWidth) return text;
      let str = text;
      while (str.length > 1 && ctx.measureText(str + '…').width > maxWidth) {
        str = str.slice(0, -1);
      }
      return str + '…';
    }

    roundRect(ctx, x, y, w, h, r) {
      const rad = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    }
  }

  global.StageRenderer = StageRenderer;
})(window);
