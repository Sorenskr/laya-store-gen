/**
 * Laya 个人中心工作台 - Laya 软件暗夜紫霓虹风格瀑布流渲染引擎 & AI 视觉/人设/背景生成器
 */
(function (global) {
  'use strict';

  const FONT_SANS =
    '"Noto Sans SC", "Noto Sans TC", "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, sans-serif';

  const PROF_W = 1080;

  // 复用的离屏测算画布，避免每秒 60 帧重复创建 DOM 节点
  let _measureCanvas = null;
  let _measureCtx = null;

  function getMeasureCtx() {
    if (!_measureCtx) {
      _measureCanvas = document.createElement('canvas');
      _measureCanvas.width = PROF_W;
      _measureCanvas.height = 100;
      _measureCtx = _measureCanvas.getContext('2d');
    }
    return _measureCtx;
  }

  function strVal(val, fallback) {
    return val !== undefined && val !== null ? String(val) : fallback;
  }

  // =========================================================================
  // 1. 辅助工具：比例换算、头像获取、文本自动换行
  // =========================================================================
  function parseAspectRatio(ratioStr, mediaEl) {
    if ((!ratioStr || ratioStr === 'auto') && mediaEl) {
      const mw = mediaEl.videoWidth || mediaEl.naturalWidth || mediaEl.width || 0;
      const mh = mediaEl.videoHeight || mediaEl.naturalHeight || mediaEl.height || 0;
      if (mw > 0 && mh > 0) {
        const r = mh / mw;
        return Math.max(0.62, Math.min(1.65, r));
      }
    }
    switch (ratioStr) {
      case '1:1':
        return 1.0;
      case '4:5':
        return 1.25;
      case '9:16':
        return 1.56;
      case '4:3':
        return 0.78;
      case '3:4':
      default:
        return 1.33;
    }
  }

  function resolveAvatarImage(mediaRegistry, customSlotImg, cat, idx) {
    if (customSlotImg) return customSlotImg;
    if (global.LayaDefaults && typeof global.LayaDefaults.getAvatarFromLibrary === 'function') {
      const libImg = global.LayaDefaults.getAvatarFromLibrary(cat || 'beauties', idx || 0);
      if (libImg) return libImg;
    }
    const raw = (mediaRegistry && mediaRegistry.raw) || {};
    return raw.user_avatar || raw.brand_laya || null;
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const rawStr = String(text || '');
    if (!rawStr) return [];
    const paragraphs = rawStr.split(/\r?\n/);
    const lines = [];
    for (let p = 0; p < paragraphs.length; p++) {
      const para = paragraphs[p];
      if (!para) {
        lines.push('');
        if (maxLines && lines.length >= maxLines) break;
        continue;
      }
      let cur = '';
      for (let i = 0; i < para.length; i++) {
        const ch = para[i];
        const test = cur + ch;
        if (ctx.measureText(test).width > maxWidth && cur.length > 0) {
          lines.push(cur);
          cur = ch;
          if (maxLines && lines.length >= maxLines) {
            cur = '';
            break;
          }
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
      if (maxLines && lines.length >= maxLines) break;
    }
    if (maxLines && lines.length > maxLines) {
      lines.length = maxLines;
    }
    if (maxLines && lines.length === maxLines) {
      const lastIdx = lines.length - 1;
      let last = lines[lastIdx];
      while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth && rawStr.replace(/\r?\n/g, '').length > lines.join('').length) {
        last = last.slice(0, -1);
      }
      if (rawStr.length > lines.join('').length && !last.endsWith('…')) {
        if (ctx.measureText(last + '…').width <= maxWidth) last += '…';
        else if (last.length > 1) last = last.slice(0, -1) + '…';
      }
      lines[lastIdx] = last;
    }
    return lines;
  }

  // =========================================================================
  // 2. 动态布局测算（精准计算长图瀑布流总高度与各区块坐标）
  // =========================================================================
  function computeProfileLayout(renderer, ctx, state) {
    const pc = state.profileCenter || global.LayaDefaults.createDefaultProfileCenter();
    const padX = 36;
    const contentW = PROF_W - padX * 2;
    const statusH = pc.header && pc.header.showStatusBar && renderer.isVisible(state, 'prof_status_bar') ? 68 : 0;

    // 顶部导航箭头/在线徽章行
    const topBarY = statusH + 20;

    // 头像 + 昵称 + Laya号 + IP + 徽章行
    const avatarY = topBarY + 66;
    const avatarSize = 154;

    // 徽章行之后，留足空间放三列统计数据
    const statsY = avatarY + avatarSize + 36;
    const statsH = 74;

    // 测算多行 Bio 文本高度
    const bioFs = renderer.getFontPx(state, 'prof_bio_text', 25);
    ctx.save();
    ctx.font = `400 ${bioFs}px ${FONT_SANS}`;
    const bioLines = wrapLines(ctx, (pc.bio && pc.bio.text) || '', contentW - 8, 8);
    ctx.restore();
    const bioLineH = Math.round(bioFs * 1.46);
    const bioY = statsY + statsH + 22;
    const bioH = pc.bio && pc.bio.text && renderer.isVisible(state, 'prof_bio_text')
      ? Math.max(bioLineH, bioLines.length * bioLineH)
      : 0;

    // 瞬间/语音胶囊栏
    const momentY = bioY + (bioH ? bioH + 22 : 8);
    const momentH = pc.momentBar && pc.momentBar.enabled && renderer.isVisible(state, 'prof_moment_bar') ? 66 : 0;

    // 关注 / 发私信 / 扩列按钮行
    const actionsY = momentY + (momentH ? momentH + 18 : 6);
    const actionsH = renderer.isVisible(state, 'prof_actions_row') ? 76 : 0;

    // 英雄头图总高度覆盖到按钮下方柔和过渡
    const heroH = Math.max(540, actionsY + actionsH + 28);

    // 内容分区 Tabs（动态 / 视频 / 瞬间 / 收藏）
    const tabsY = actionsY + actionsH + 26;
    const tabsH = 74;

    // 双列错落瀑布流测量
    const feedSettings = pc.feedSettings || {};
    const colGap = Number(feedSettings.colGap) || 14;
    const rowGap = Number(feedSettings.rowGap) || 16;
    const cardW = Math.floor((contentW - colGap) / 2);
    const colXs = [padX, padX + cardW + colGap];
    const colYs = [tabsY + tabsH + 18, tabsY + tabsH + 18];

    const posts = Array.isArray(pc.posts) ? pc.posts : [];
    const postLayouts = [];

    posts.forEach((post, idx) => {
      const cardKey = `prof_post_${post.id}`;
      if (!renderer.isVisible(state, cardKey)) return;

      const mediaEntry = renderer.media && renderer.media.profCardMedia && renderer.media.profCardMedia[post.id];
      const ratio = parseAspectRatio(post.aspectRatio, mediaEntry && mediaEntry.el);
      const mediaH = Math.round(cardW * ratio);

      // 测算底部标题、热评与作者行高度
      const titleFs = renderer.getFontPx(state, `prof_post_title_${post.id}`, 24);
      ctx.save();
      ctx.font = `600 ${titleFs}px ${FONT_SANS}`;
      const titleLines = renderer.isVisible(state, `prof_post_title_${post.id}`) && post.title
        ? wrapLines(ctx, post.title, cardW - 28, 2)
        : [];
      ctx.restore();
      const titleLineH = Math.round(titleFs * 1.34);
      const titleBlockH = titleLines.length ? titleLines.length * titleLineH + 12 : 0;

      let hotLines = [];
      const hotFs = renderer.getFontPx(state, `prof_post_hotcmt_${post.id}`, 18);
      if (feedSettings.showHotCommentOnCard !== false && post.hotComment && renderer.isVisible(state, `prof_post_hotcmt_${post.id}`)) {
        ctx.save();
        ctx.font = `500 ${hotFs}px ${FONT_SANS}`;
        hotLines = wrapLines(ctx, post.hotComment, cardW - 44, 2);
        ctx.restore();
      }
      const hotLineH = Math.round(hotFs * 1.32);
      const hotBlockH = hotLines.length ? hotLines.length * hotLineH + 18 : 0;

      const metaRowH = 54;
      const footerPadTop = 14;
      const footerPadBot = 10;
      const footerH = footerPadTop + titleBlockH + hotBlockH + metaRowH + footerPadBot;
      const cardH = mediaH + footerH;

      // 选择当前较短列实现真瀑布流交错
      const colIdx = colYs[0] <= colYs[1] ? 0 : 1;
      const baseX = colXs[colIdx];
      const baseY = colYs[colIdx];

      postLayouts.push({
        post,
        idx,
        colIdx,
        x: baseX,
        y: baseY,
        w: cardW,
        h: cardH,
        mediaH,
        footerH,
        titleLines,
        titleLineH,
        hotLines,
        hotLineH
      });

      colYs[colIdx] = baseY + cardH + rowGap;
    });

    const feedBottomY = Math.max(colYs[0], colYs[1], tabsY + tabsH + 60);

    // 底部 Laya 互动评论区测算
    const cmtSec = pc.commentSection || {};
    let commentsY = feedBottomY + 14;
    let commentsH = 0;
    const cmtLayouts = [];
    if (cmtSec.enabled !== false && renderer.isVisible(state, 'prof_comment_section')) {
      let curCmtY = commentsY + 120; // header + input pill
      const cmtItems = Array.isArray(cmtSec.items) ? cmtSec.items : [];
      cmtItems.forEach((cm, cIdx) => {
        const cKey = `prof_cmt_${cm.id}`;
        if (!renderer.isVisible(state, cKey)) return;
        const txtFs = renderer.getFontPx(state, `prof_cmt_text_${cm.id}`, 23);
        ctx.save();
        ctx.font = `400 ${txtFs}px ${FONT_SANS}`;
        const cLines = wrapLines(ctx, cm.text || '', contentW - 148, 4);
        ctx.restore();
        const cLineH = Math.round(txtFs * 1.38);

        let replyLines = [];
        const repFs = renderer.getFontPx(state, `prof_cmt_reply_${cm.id}`, 21);
        if (cm.authorReply && renderer.isVisible(state, `prof_cmt_reply_${cm.id}`)) {
          const repPrefix = strVal(cmtSec.replyPrefix, '作者回复：');
          ctx.save();
          ctx.font = `500 ${repFs}px ${FONT_SANS}`;
          replyLines = wrapLines(ctx, `${repPrefix}${cm.authorReply}`, contentW - 186, 2);
          ctx.restore();
        }
        const repLineH = Math.round(repFs * 1.35);
        const repH = replyLines.length ? replyLines.length * repLineH + 22 : 0;

        const rowH = Math.max(92, 42 + cLines.length * cLineH + 34 + repH + 18);
        cmtLayouts.push({
          cm,
          cIdx,
          y: curCmtY,
          h: rowH,
          cLines,
          cLineH,
          replyLines,
          repLineH,
          repH
        });
        curCmtY += rowH + 10;
      });
      commentsH = curCmtY - commentsY + 26;
    }

    const botNavH = pc.bottomNav && pc.bottomNav.enabled && renderer.isVisible(state, 'prof_bottom_nav') ? 104 : 0;
    const rawTotalH = (commentsH > 0 ? commentsY + commentsH + 20 : feedBottomY + 28) + botNavH;
    // 确保画布高度为偶数（WebCodecs H.264 必须偶数分辨率）
    const totalContentH = Math.ceil(Math.max(1920, rawTotalH) / 2) * 2;

    return {
      padX,
      contentW,
      statusH,
      topBarY,
      avatarY,
      avatarSize,
      statsY,
      statsH,
      bioY,
      bioLines,
      bioLineH,
      bioH,
      momentY,
      momentH,
      actionsY,
      actionsH,
      heroH,
      tabsY,
      tabsH,
      cardW,
      postLayouts,
      feedBottomY,
      commentsY,
      commentsH,
      cmtLayouts,
      botNavH,
      totalContentH
    };
  }

  function computeProfileCanvasHeight(state, mediaRegistry) {
    const pc = (state && state.profileCenter) || {};
    if (pc.viewportMode === 'mobile') return 1920;
    const dctx = getMeasureCtx();
    const dummyRenderer = {
      media: mediaRegistry || { raw: {}, profCardMedia: {}, profCommentAvatars: {} },
      isVisible: (s, k) => !(s.hiddenElements && s.hiddenElements[k]),
      getFontPx: (s, k, fb) =>
        global.LayaDefaults && global.LayaDefaults.getEffectiveFontSize
          ? global.LayaDefaults.getEffectiveFontSize(s, k, fb)
          : fb
    };
    const layout = computeProfileLayout(dummyRenderer, dctx, state);
    return layout.totalContentH;
  }

  // =========================================================================
  // 3. Canvas 主渲染函数：Laya 软件风格个人中心
  // =========================================================================
  function renderProfileCenter(renderer, ctx, state) {
    const pc = state.profileCenter || global.LayaDefaults.createDefaultProfileCenter();
    const W = renderer.W;
    const H = renderer.H;
    const isMobileViewport = pc.viewportMode === 'mobile';
    const theme = (state.layout && state.layout.canvasTheme) || 'dark';
    const isOuterTrans = theme === 'transparent' || theme === 'full-transparent';
    const isFullTrans = theme === 'full-transparent';
    const isLight = theme === 'light';
    const t = renderer.animTime || 0;

    const layout = computeProfileLayout(renderer, ctx, state);

    // 限制 9:16 竖屏模式滚动范围，并暴露给 UI 滑块动态上限
    const maxScroll = isMobileViewport ? Math.max(0, layout.totalContentH - H) : 0;
    renderer.lastProfileMaxScroll = maxScroll;
    const scrollY = isMobileViewport ? Math.max(0, Math.min(maxScroll, Number(pc.scrollY) || 0)) : 0;
    if (isMobileViewport && pc.scrollY !== scrollY) {
      pc.scrollY = scrollY;
    }

    // 1) 主底色与全画布氛围暗夜紫底
    if (!isOuterTrans) {
      const baseBg = ctx.createLinearGradient(0, 0, 0, H);
      if (isLight) {
        baseBg.addColorStop(0, '#f8f6ff');
        baseBg.addColorStop(1, '#f2eefb');
      } else {
        baseBg.addColorStop(0, '#0a0714');
        baseBg.addColorStop(0.5, '#080610');
        baseBg.addColorStop(1, '#06040b');
      }
      ctx.fillStyle = baseBg;
      ctx.fillRect(0, 0, W, H);
    }

    // 可滚动内容包裹层
    ctx.save();
    renderer._hitScrollOffsetY = scrollY;
    if (isMobileViewport && scrollY > 0) {
      ctx.translate(0, -scrollY);
    }

    // 2) 顶部个人主页背景图（可上传 / AI 生成 / 内置氛围底图 / 炫彩极光）
    const hdr = pc.header || {};
    const heroDrawH = layout.heroH + 60;
    if (!isFullTrans && renderer.isVisible(state, 'prof_bg_banner')) {
      const bgOff = renderer.getOffset(state, 'prof_bg_banner');
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, heroDrawH);
      ctx.clip();

      const customBg = renderer.media && renderer.media.profileBg;
      const vibeList = (global.LAYA_ASIAN_AVATARS && global.LAYA_ASIAN_AVATARS.vibes) || [];
      const vibeSrc = vibeList.length ? vibeList[((Number(hdr.vibeIndex) || 0) % vibeList.length + vibeList.length) % vibeList.length] : null;
      const vibeImg = vibeSrc && global.LayaDefaults ? global.LayaDefaults.getLibraryImage(vibeSrc) : null;
      const avatarImgForPortrait = resolveAvatarImage(
        renderer.media,
        renderer.media && renderer.media.profAvatar,
        pc.user && pc.user.avatarCategory,
        pc.user && pc.user.avatarIndex
      );

      let drewImg = false;
      if (hdr.bgStyle === 'custom' && customBg && (customBg.complete === undefined || customBg.complete) && (customBg.naturalWidth || customBg.width)) {
        renderer.drawCoverImage(ctx, customBg, bgOff.x, bgOff.y, W, heroDrawH);
        drewImg = true;
      } else if (hdr.bgStyle === 'vibe-photo' && vibeImg && vibeImg.complete && vibeImg.naturalWidth) {
        renderer.drawCoverImage(ctx, vibeImg, bgOff.x, bgOff.y, W, heroDrawH);
        drewImg = true;
      } else if (hdr.bgStyle === 'portrait-glow' && avatarImgForPortrait && avatarImgForPortrait.complete && avatarImgForPortrait.naturalWidth) {
        // 复刻图2“背景人物虚化融合”效果 + Laya 暗紫渐变叠层
        ctx.save();
        ctx.filter = 'blur(6px) saturate(1.18)';
        renderer.drawCoverImage(ctx, avatarImgForPortrait, bgOff.x + 120, bgOff.y - 40, W, heroDrawH + 80);
        ctx.restore();
        drewImg = true;
      }

      if (!drewImg) {
        const gHero = ctx.createLinearGradient(0, 0, W, heroDrawH);
        if (hdr.bgStyle === 'cyber-neon') {
          gHero.addColorStop(0, '#1e0b36');
          gHero.addColorStop(0.5, '#3b0764');
          gHero.addColorStop(1, '#500724');
        } else {
          gHero.addColorStop(0, '#160d2e');
          gHero.addColorStop(0.55, '#251042');
          gHero.addColorStop(1, '#140c24');
        }
        ctx.fillStyle = gHero;
        ctx.fillRect(0, 0, W, heroDrawH);
      }

      // Laya 标志性紫粉氛围光斑 + 底部自然熔入背景渐变遮罩
      const drift = t ? Math.sin(t * 0.9) * 28 : 0;
      const aura1 = ctx.createRadialGradient(W * 0.72 + drift, 180, 20, W * 0.72 + drift, 180, 480);
      aura1.addColorStop(0, 'rgba(217, 70, 239, 0.34)');
      aura1.addColorStop(0.5, 'rgba(147, 51, 234, 0.16)');
      aura1.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura1;
      ctx.fillRect(0, 0, W, heroDrawH);

      const dimRatio = Math.max(0.15, Math.min(0.92, (Number(hdr.bgDim) || 52) / 100));
      const fadeGrad = ctx.createLinearGradient(0, 0, 0, heroDrawH);
      fadeGrad.addColorStop(0, `rgba(9, 6, 18, ${(dimRatio * 0.65).toFixed(2)})`);
      fadeGrad.addColorStop(0.45, `rgba(11, 8, 22, ${(dimRatio * 0.86).toFixed(2)})`);
      fadeGrad.addColorStop(0.84, isLight ? 'rgba(248, 246, 255, 0.92)' : 'rgba(9, 7, 17, 0.96)');
      fadeGrad.addColorStop(1, isLight ? '#f8f6ff' : '#090711');
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(0, 0, W, heroDrawH);

      ctx.restore();
      renderer.registerHit('prof_bg_banner', '主页顶部背景图（点击或拖入图片替换）', 'element', 0, layout.statusH, W, 180, 'prof_header');
    }

    // 3) 顶部导航交互按钮（左返回 < + 语音在线胶囊 + 右更多 ···）
    const navRowCY = layout.topBarY + 26;
    if (hdr.showBackBtn !== false && renderer.isVisible(state, 'prof_back_btn')) {
      const bOff = renderer.getOffset(state, 'prof_back_btn');
      const bx = layout.padX + 18 + bOff.x;
      const by = navRowCY + bOff.y;
      ctx.save();
      ctx.fillStyle = 'rgba(18, 13, 34, 0.45)';
      ctx.beginPath();
      ctx.arc(bx, by, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(bx + 6, by - 12);
      ctx.lineTo(bx - 7, by);
      ctx.lineTo(bx + 6, by + 12);
      ctx.stroke();
      ctx.restore();
      renderer.registerHit('prof_back_btn', '左上返回箭头', 'element', bx - 26, by - 26, 52, 52, 'prof_header');
    }

    if (hdr.showOnlineBadge !== false && hdr.onlineBadgeText && renderer.isVisible(state, 'prof_online_badge')) {
      const obOff = renderer.getOffset(state, 'prof_online_badge');
      const obFs = renderer.getFontPx(state, 'prof_online_badge', 19);
      ctx.save();
      ctx.font = `600 ${obFs}px ${FONT_SANS}`;
      const txt = hdr.onlineBadgeText;
      const tw = ctx.measureText(txt).width;
      const pw = tw + 30;
      const ph = Math.max(32, Math.round(obFs * 1.72));
      const px = layout.padX + 64 + obOff.x;
      const py = navRowCY - ph / 2 + obOff.y;
      ctx.fillStyle = 'rgba(26, 18, 46, 0.68)';
      renderer.roundRect(ctx, px, py, pw, ph, ph / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#f5d0fe';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, px + pw / 2, py + ph / 2 + 1);
      ctx.restore();
      renderer.registerHit('prof_online_badge', '顶部在线状态胶囊', 'element', px, py, pw, ph, 'prof_header');
    }

    if (hdr.showMoreBtn !== false && renderer.isVisible(state, 'prof_more_btn')) {
      const mOff = renderer.getOffset(state, 'prof_more_btn');
      const mx = W - layout.padX - 24 + mOff.x;
      const my = navRowCY + mOff.y;
      ctx.save();
      ctx.fillStyle = 'rgba(18, 13, 34, 0.45)';
      ctx.beginPath();
      ctx.arc(mx, my, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      [-10, 0, 10].forEach((dx) => {
        ctx.beginPath();
        ctx.arc(mx + dx, my, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
      renderer.registerHit('prof_more_btn', '右上更多图标', 'element', mx - 26, my - 26, 52, 52, 'prof_header');
    }

    // 4) 核心身份区：大圆形头像 + 昵称 + Laya号 + IP属地 + Laya 性别/等级/声音徽章
    const u = pc.user || {};
    const avSize = layout.avatarSize;
    const avX = layout.padX;
    const avY = layout.avatarY;
    const profileAvatarImg = resolveAvatarImage(
      renderer.media,
      renderer.media && renderer.media.profAvatar,
      u.avatarCategory,
      u.avatarIndex
    );

    if (renderer.isVisible(state, 'prof_avatar')) {
      const aOff = renderer.getOffset(state, 'prof_avatar');
      const ax = avX + aOff.x;
      const ay = avY + aOff.y;
      const cx = ax + avSize / 2;
      const cy = ay + avSize / 2;

      ctx.save();
      ctx.shadowColor = 'rgba(217, 70, 239, 0.48)';
      ctx.shadowBlur = 24;
      const ringGrad = ctx.createLinearGradient(ax, ay, ax + avSize, ay + avSize);
      ringGrad.addColorStop(0, '#f472b6');
      ringGrad.addColorStop(0.5, '#a855f7');
      ringGrad.addColorStop(1, '#38bdf8');
      ctx.fillStyle = ringGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, avSize / 2 + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, avSize / 2, 0, Math.PI * 2);
      ctx.clip();
      if (profileAvatarImg && (profileAvatarImg.complete === undefined || profileAvatarImg.complete)) {
        renderer.drawCoverImage(ctx, profileAvatarImg, ax, ay, avSize, avSize);
      } else {
        ctx.fillStyle = '#2d1c4d';
        ctx.fillRect(ax, ay, avSize, avSize);
      }
      ctx.restore();

      // 右下角 Laya 在线绿点角标
      ctx.save();
      ctx.fillStyle = '#090711';
      ctx.beginPath();
      ctx.arc(ax + avSize - 18, ay + avSize - 18, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(ax + avSize - 18, ay + avSize - 18, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      renderer.registerHit('prof_avatar', '个人主页头像（点击选头像库或上传）', 'element', ax, ay, avSize, avSize, 'prof_identity');
    }

    const infoX = avX + avSize + 28;
    const infoMaxW = W - layout.padX - infoX;

    // 昵称行
    let curInfoY = avY + 26;
    if (renderer.isVisible(state, 'prof_nickname')) {
      const nOff = renderer.getOffset(state, 'prof_nickname');
      const nickFs = renderer.getFontPx(state, 'prof_nickname', 40);
      const nickStr = strVal(u.nickname, 'Selina（回关）');
      ctx.save();
      ctx.font = `800 ${nickFs}px ${FONT_SANS}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const nx = infoX + nOff.x;
      const ny = curInfoY + nOff.y;
      renderer.fillReadableText(ctx, renderer.truncateText(ctx, nickStr, infoMaxW), nx, ny, isLight ? '#181029' : '#ffffff', isFullTrans);
      const nw = Math.max(80, Math.min(infoMaxW, ctx.measureText(nickStr).width + 8));
      ctx.restore();
      renderer.registerHit('prof_nickname', '个人主页昵称', 'element', nx - 4, ny - nickFs * 0.65, nw, Math.max(42, nickFs * 1.3), 'prof_identity');
    }

    // Laya号 + 复制图标
    curInfoY += 46;
    if (renderer.isVisible(state, 'prof_id_row')) {
      const idOff = renderer.getOffset(state, 'prof_id_row');
      const idFs = renderer.getFontPx(state, 'prof_id_row', 22);
      const idStr = `${strVal(u.idPrefix, 'Laya号：')}${strVal(u.userId, '')}`;
      ctx.save();
      ctx.font = `500 ${idFs}px ${FONT_SANS}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const ix = infoX + idOff.x;
      const iy = curInfoY + idOff.y;
      renderer.fillReadableText(ctx, idStr, ix, iy, isLight ? '#5b4b7a' : 'rgba(226, 214, 248, 0.78)', isFullTrans);
      const iw = Math.max(60, ctx.measureText(idStr).width);
      if (idStr.trim() && u.showCopyIcon !== false) {
        const cx = ix + iw + 16;
        ctx.strokeStyle = 'rgba(226, 214, 248, 0.7)';
        ctx.lineWidth = 1.8;
        renderer.roundRect(ctx, cx, iy - 9, 13, 15, 2.5);
        ctx.stroke();
        renderer.roundRect(ctx, cx + 4, iy - 5, 13, 15, 2.5);
        ctx.stroke();
      }
      ctx.restore();
      renderer.registerHit('prof_id_row', 'Laya号 / 账号栏', 'element', ix - 4, iy - idFs * 0.65, iw + 42, Math.max(28, idFs * 1.35), 'prof_identity');
    }

    // IP 属地行
    curInfoY += 32;
    if (u.ipText && renderer.isVisible(state, 'prof_ip_text')) {
      const ipOff = renderer.getOffset(state, 'prof_ip_text');
      const ipFs = renderer.getFontPx(state, 'prof_ip_text', 20);
      ctx.save();
      ctx.font = `500 ${ipFs}px ${FONT_SANS}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const px = infoX + ipOff.x;
      const py = curInfoY + ipOff.y;
      renderer.fillReadableText(ctx, u.ipText, px, py, isLight ? '#6b5b8c' : 'rgba(203, 194, 232, 0.74)', isFullTrans);
      const pw = ctx.measureText(u.ipText).width + 10;
      ctx.restore();
      renderer.registerHit('prof_ip_text', 'IP 属地文字', 'element', px - 4, py - ipFs * 0.65, pw, Math.max(26, ipFs * 1.3), 'prof_identity');
    }

    // Laya 专属徽章行：性别年龄 + 等级 + 声音标签
    curInfoY += 34;
    let badgeCurX = infoX;
    if (u.age && renderer.isVisible(state, 'prof_age_badge')) {
      const aOff = renderer.getOffset(state, 'prof_age_badge');
      const aFs = renderer.getFontPx(state, 'prof_age_badge', 18);
      const sym = u.gender === 'female' ? '♀' : u.gender === 'male' ? '♂' : '';
      const txt = `${sym} ${u.age}`.trim();
      const ph = Math.max(26, Math.round(aFs * 1.54));
      const pw = renderer.drawTagPill(
        ctx,
        txt,
        badgeCurX + aOff.x,
        curInfoY + aOff.y,
        u.gender === 'male' ? '#2563eb' : '#db2777',
        u.gender === 'male' ? '#0ea5e9' : '#ec4899',
        '#ffffff',
        aFs
      );
      renderer.registerHit('prof_age_badge', '年龄性别徽章', 'element', badgeCurX + aOff.x, curInfoY - ph / 2 + aOff.y, pw, ph + 2, 'prof_identity');
      badgeCurX += pw + 10;
    }

    if (u.level && renderer.isVisible(state, 'prof_level_badge')) {
      const lOff = renderer.getOffset(state, 'prof_level_badge');
      const lFs = renderer.getFontPx(state, 'prof_level_badge', 18);
      const ph = Math.max(26, Math.round(lFs * 1.54));
      const pw = renderer.drawTagPill(ctx, String(u.level), badgeCurX + lOff.x, curInfoY + lOff.y, '#7e22ce', '#a855f7', '#fae8ff', lFs);
      renderer.registerHit('prof_level_badge', '等级徽章', 'element', badgeCurX + lOff.x, curInfoY - ph / 2 + lOff.y, pw, ph + 2, 'prof_identity');
      badgeCurX += pw + 10;
    }

    if (u.voiceTag && renderer.isVisible(state, 'prof_voice_tag')) {
      const vOff = renderer.getOffset(state, 'prof_voice_tag');
      const vFs = renderer.getFontPx(state, 'prof_voice_tag', 18);
      const ph = Math.max(26, Math.round(vFs * 1.54));
      const pw = renderer.drawSubtleGlassPill(ctx, u.voiceTag, badgeCurX + vOff.x, curInfoY + vOff.y, 'rgba(192, 132, 252, 0.16)', '#f3e8ff', vFs);
      renderer.registerHit('prof_voice_tag', '声音个性标签', 'element', badgeCurX + vOff.x, curInfoY - ph / 2 + vOff.y, pw, ph + 2, 'prof_identity');
    }

    // 5) 三组统计数字行（关注 / 粉丝 / 获赞与收藏）
    const statItems = (pc.stats && pc.stats.items) || [];
    let statX = layout.padX + 4;
    statItems.forEach((st, idx) => {
      const numKey = `prof_stat_num_${idx}`;
      const lblKey = `prof_stat_lbl_${idx}`;
      const numFs = renderer.getFontPx(state, numKey, 32);
      const lblFs = renderer.getFontPx(state, lblKey, 20);

      ctx.save();
      ctx.font = `800 ${numFs}px ${FONT_SANS}`;
      const numW = ctx.measureText(String(st.num || '0')).width;
      ctx.font = `400 ${lblFs}px ${FONT_SANS}`;
      const lblW = ctx.measureText(String(st.label || '')).width;
      ctx.restore();
      const colSpan = Math.max(118, numW + 30, lblW + 30);

      if (renderer.isVisible(state, numKey)) {
        const off = renderer.getOffset(state, numKey);
        const nx = statX + off.x;
        const ny = layout.statsY + 18 + off.y;
        ctx.save();
        ctx.font = `800 ${numFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        renderer.fillReadableText(ctx, String(st.num || '0'), nx, ny, isLight ? '#140c24' : '#ffffff', isFullTrans);
        ctx.restore();
        renderer.registerHit(numKey, `统计数字：${st.label}`, 'element', nx - 4, ny - numFs * 0.65, Math.max(54, numW + 14), Math.max(34, numFs * 1.3), 'prof_stats');
      }

      if (renderer.isVisible(state, lblKey)) {
        const off = renderer.getOffset(state, lblKey);
        const lx = statX + off.x;
        const ly = layout.statsY + 54 + off.y;
        ctx.save();
        ctx.font = `400 ${lblFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        renderer.fillReadableText(ctx, String(st.label || ''), lx, ly, isLight ? '#5c4d78' : 'rgba(203, 196, 224, 0.78)', isFullTrans);
        ctx.restore();
        renderer.registerHit(lblKey, `统计标签：${st.label}`, 'element', lx - 4, ly - lblFs * 0.65, Math.max(54, lblW + 14), Math.max(28, lblFs * 1.3), 'prof_stats');
      }

      statX += colSpan + 36;
    });

    // 6) 多行个性签名简介
    if (pc.bio && pc.bio.text && renderer.isVisible(state, 'prof_bio_text')) {
      const bOff = renderer.getOffset(state, 'prof_bio_text');
      const bioFs = renderer.getFontPx(state, 'prof_bio_text', 25);
      const bx = layout.padX + 4 + bOff.x;
      const by = layout.bioY + bOff.y;
      ctx.save();
      ctx.font = `400 ${bioFs}px ${FONT_SANS}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      layout.bioLines.forEach((line, lIdx) => {
        renderer.fillReadableText(
          ctx,
          line,
          bx,
          by + lIdx * layout.bioLineH,
          isLight ? '#2c1f44' : 'rgba(244, 240, 255, 0.94)',
          isFullTrans
        );
      });
      ctx.restore();
      renderer.registerHit(
        'prof_bio_text',
        '多行个性签名',
        'element',
        bx - 4,
        by - 4,
        layout.contentW,
        Math.max(36, layout.bioLines.length * layout.bioLineH + 6),
        'prof_bio'
      );
    }

    // 7) 瞬间 / 语音胶囊条（对标图2全宽半透明胶囊条，融入 Laya 紫粉玻璃质感）
    if (pc.momentBar && pc.momentBar.enabled !== false && renderer.isVisible(state, 'prof_moment_bar')) {
      const mbOff = renderer.getOffset(state, 'prof_moment_bar');
      const mx = layout.padX + mbOff.x;
      const my = layout.momentY + mbOff.y;
      const mw = layout.contentW;
      const mh = layout.momentH;

      ctx.save();
      renderer.roundRect(ctx, mx, my, mw, mh, 16);
      const mGrad = ctx.createLinearGradient(mx, my, mx + mw, my);
      mGrad.addColorStop(0, isFullTrans ? 'rgba(30, 20, 52, 0.78)' : 'rgba(34, 24, 58, 0.88)');
      mGrad.addColorStop(1, isFullTrans ? 'rgba(42, 22, 64, 0.78)' : 'rgba(48, 26, 74, 0.82)');
      ctx.fillStyle = mGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.28)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();

      const icoStr = strVal(pc.momentBar.iconText, '◎ 瞬间');
      const descStr = strVal(pc.momentBar.descText, '');
      const icoFs = renderer.getFontPx(state, 'prof_moment_icon', 22);
      const descFs = renderer.getFontPx(state, 'prof_moment_desc', 21);

      ctx.save();
      ctx.font = `600 ${icoFs}px ${FONT_SANS}`;
      const icoW = ctx.measureText(icoStr).width;
      ctx.font = `400 ${descFs}px ${FONT_SANS}`;
      const descW = ctx.measureText(descStr).width;
      const totalInnerW = icoW + (descStr ? (icoW > 0 ? 20 : 0) + descW : 0);
      const startInnerX = mx + (mw - totalInnerW) / 2;
      const midY = my + mh / 2;

      if (icoStr && renderer.isVisible(state, 'prof_moment_icon')) {
        const io = renderer.getOffset(state, 'prof_moment_icon');
        ctx.font = `600 ${icoFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        renderer.fillReadableText(ctx, icoStr, startInnerX + io.x, midY + io.y, '#f5d0fe', false);
        renderer.registerHit('prof_moment_icon', '瞬间栏左侧文字', 'element', startInnerX + io.x - 4, my + 8 + io.y, icoW + 10, mh - 16, 'prof_moment_bar');
      }
      if (descStr && renderer.isVisible(state, 'prof_moment_desc')) {
        const doff = renderer.getOffset(state, 'prof_moment_desc');
        const dx = startInnerX + (icoStr ? icoW + 20 : 0) + doff.x;
        ctx.font = `400 ${descFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        renderer.fillReadableText(ctx, descStr, dx, midY + doff.y, 'rgba(226, 218, 246, 0.82)', false);
        renderer.registerHit('prof_moment_desc', '瞬间栏右侧提示', 'element', dx - 4, my + 8 + doff.y, descW + 10, mh - 16, 'prof_moment_bar');
      }
      ctx.restore();
      renderer.registerHit('prof_moment_bar', '瞬间语音横条', 'element', mx, my, mw, mh, 'prof_moment_bar');
    }

    // 8) 互动操作行：Laya 紫粉渐变主按钮（关注） + 暗紫毛玻璃（发私信） + 扩列好友小钮
    if (renderer.isVisible(state, 'prof_actions_row')) {
      const act = pc.actions || {};
      const showFriend = act.showFriendBtn !== false && renderer.isVisible(state, 'prof_btn_friend');
      const friendW = showFriend ? 80 : 0;
      const btnGap = 14;
      const mainBtnW = Math.floor((layout.contentW - friendW - (showFriend ? btnGap * 2 : btnGap)) / 2);
      const btnH = layout.actionsH;
      const ay = layout.actionsY;

      // 主按钮：关注
      if (renderer.isVisible(state, 'prof_btn_follow')) {
        const fOff = renderer.getOffset(state, 'prof_btn_follow');
        const fx = layout.padX + fOff.x;
        const fy = ay + fOff.y;
        ctx.save();
        ctx.shadowColor = act.isFollowing ? 'rgba(147, 51, 234, 0.2)' : 'rgba(219, 39, 119, 0.48)';
        ctx.shadowBlur = 20;
        renderer.roundRect(ctx, fx, fy, mainBtnW, btnH, 16);
        if (act.isFollowing) {
          ctx.fillStyle = 'rgba(42, 30, 68, 0.85)';
        } else {
          const fg = ctx.createLinearGradient(fx, fy, fx + mainBtnW, fy + btnH);
          fg.addColorStop(0, '#ec4899');
          fg.addColorStop(0.52, '#a855f7');
          fg.addColorStop(1, '#7e22ce');
          ctx.fillStyle = fg;
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(250, 232, 255, 0.35)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        const fFs = renderer.getFontPx(state, 'prof_btn_follow', 26);
        ctx.font = `700 ${fFs}px ${FONT_SANS}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        renderer.fillReadableText(ctx, strVal(act.followText, '关注'), fx + mainBtnW / 2, fy + btnH / 2 + 1, '#ffffff', false);
        ctx.restore();
        renderer.registerHit('prof_btn_follow', '主按钮（关注）', 'element', fx, fy, mainBtnW, btnH, 'prof_actions');
      }

      // 次按钮：发私信
      if (renderer.isVisible(state, 'prof_btn_msg')) {
        const mOff = renderer.getOffset(state, 'prof_btn_msg');
        const mx = layout.padX + mainBtnW + btnGap + mOff.x;
        const my = ay + mOff.y;
        ctx.save();
        renderer.roundRect(ctx, mx, my, mainBtnW, btnH, 16);
        ctx.fillStyle = isFullTrans ? 'rgba(30, 22, 52, 0.72)' : 'rgba(34, 26, 56, 0.92)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.32)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        const mFs = renderer.getFontPx(state, 'prof_btn_msg', 26);
        ctx.font = `600 ${mFs}px ${FONT_SANS}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        renderer.fillReadableText(ctx, strVal(act.msgText, '发私信'), mx + mainBtnW / 2, my + btnH / 2 + 1, '#f3e8ff', false);
        ctx.restore();
        renderer.registerHit('prof_btn_msg', '次按钮（发私信）', 'element', mx, my, mainBtnW, btnH, 'prof_actions');
      }

      // 右侧加好友扩列小图标钮
      if (showFriend) {
        const frOff = renderer.getOffset(state, 'prof_btn_friend');
        const frx = layout.padX + mainBtnW * 2 + btnGap * 2 + frOff.x;
        const fry = ay + frOff.y;
        ctx.save();
        renderer.roundRect(ctx, frx, fry, friendW, btnH, 16);
        ctx.fillStyle = isFullTrans ? 'rgba(30, 22, 52, 0.72)' : 'rgba(34, 26, 56, 0.92)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.32)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // 绘人像+加号图标
        const icx = frx + friendW / 2 - 3;
        const icy = fry + btnH / 2;
        ctx.strokeStyle = '#e9d5ff';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(icx - 2, icy - 6, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(icx - 2, icy + 13, 12, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(icx + 12, icy - 4);
        ctx.lineTo(icx + 20, icy - 4);
        ctx.moveTo(icx + 16, icy - 8);
        ctx.lineTo(icx + 16, icy);
        ctx.stroke();
        ctx.restore();
        renderer.registerHit('prof_btn_friend', '扩列好友图标按钮', 'element', frx, fry, friendW, btnH, 'prof_actions');
      }
    }

    // 9) 内容分区 Tabs 栏（动态 / 视频 / 瞬间 / 收藏 + 右侧搜索图标）
    const ct = pc.contentTabs || {};
    const tabList = Array.isArray(ct.tabs) ? ct.tabs : ['动态'];
    const tabsY = layout.tabsY;
    const tabsH = layout.tabsH;

    if (!isFullTrans) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(0, tabsY, W, 1);
      ctx.fillRect(0, tabsY + tabsH, W, 1);
      ctx.restore();
    }

    let tabCurX = layout.padX + 6;
    const tabMidY = tabsY + tabsH / 2;
    tabList.forEach((lbl, idx) => {
      const key = `prof_tab_${idx}`;
      if (!renderer.isVisible(state, key)) return;
      const isAct = idx === Number(ct.activeIndex);
      const tOff = renderer.getOffset(state, key);
      const tx = tabCurX + tOff.x;
      const ty = tabMidY + tOff.y;
      const tFs = renderer.getFontPx(state, key, 26);

      ctx.save();
      ctx.font = `${isAct ? '800' : '500'} ${tFs}px ${FONT_SANS}`;
      const tw = ctx.measureText(lbl).width;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      renderer.fillReadableText(ctx, lbl, tx, ty, isAct ? (isLight ? '#181029' : '#ffffff') : 'rgba(166, 158, 194, 0.72)', isFullTrans);

      if (isAct) {
        const lineW = Math.max(36, tw * 0.76);
        const lx = tx + (tw - lineW) / 2;
        const ly = tabsY + tabsH - 6;
        const lg = ctx.createLinearGradient(lx, ly, lx + lineW, ly);
        lg.addColorStop(0, '#ec4899');
        lg.addColorStop(1, '#a855f7');
        ctx.fillStyle = lg;
        renderer.roundRect(ctx, lx, ly, lineW, 5, 2.5);
        ctx.fill();
      }
      ctx.restore();

      renderer.registerHit(key, `分区标签：${lbl}`, 'element', tx - 8, ty - tFs * 0.7, tw + 16, Math.max(42, tFs * 1.5), 'prof_tabs');
      tabCurX += tw + 46;
    });

    if (ct.showSearchIcon !== false && renderer.isVisible(state, 'prof_content_search')) {
      const sOff = renderer.getOffset(state, 'prof_content_search');
      const sx = W - layout.padX - 20 + sOff.x;
      const sy = tabMidY + sOff.y;
      renderer.drawMagnifier(ctx, sx, sy, 12, 'rgba(216, 206, 240, 0.78)', 2.8);
      renderer.registerHit('prof_content_search', '作品栏搜索图标', 'element', sx - 24, sy - 24, 48, 48, 'prof_tabs');
    }

    // 10) 双列错落瀑布流视频/图片卡片
    const feedCfg = pc.feedSettings || {};
    const cardRadius = Number(feedCfg.cardRadius) || 18;
    const syncedAvatar = resolveAvatarImage(
      renderer.media,
      renderer.media && renderer.media.profAvatar,
      u.avatarCategory,
      u.avatarIndex
    );
    const baseSyncedNickname = strVal(u.nickname, 'Selina（回关）');
    const vibePool = (global.LAYA_ASIAN_AVATARS && global.LAYA_ASIAN_AVATARS.vibes) || [];

    layout.postLayouts.forEach((pl) => {
      const post = pl.post;
      const idx = pl.idx;
      const pKey = `prof_post_${post.id}`;
      const pOff = renderer.getOffset(state, pKey);
      const cx = pl.x + pOff.x;
      const cy = pl.y + pOff.y;
      const cw = pl.w;
      const ch = pl.h;
      const mh = pl.mediaH;

      // 卡片外底投影
      if (!isFullTrans) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 22;
        ctx.shadowOffsetY = 6;
        renderer.roundRect(ctx, cx, cy, cw, ch, cardRadius);
        ctx.fillStyle = isLight ? '#ffffff' : '#131020';
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      renderer.roundRect(ctx, cx, cy, cw, ch, cardRadius);
      ctx.clip();

      // 卡片媒体画面（支持上传视频实时播放 / 上传图片 / 头像库图集封面 / 内置氛围图库）
      const mediaEntry = renderer.media && renderer.media.profCardMedia && renderer.media.profCardMedia[post.id];
      let mediaSrc = null;
      let isVideo = false;
      let isVideoPaused = true;

      if (mediaEntry && mediaEntry.el) {
        mediaSrc = mediaEntry.el;
        isVideo = mediaEntry.type === 'video';
        if (isVideo) isVideoPaused = mediaSrc.paused;
      } else if (post.coverCategory && global.LayaDefaults && typeof global.LayaDefaults.getAvatarFromLibrary === 'function') {
        mediaSrc = global.LayaDefaults.getAvatarFromLibrary(post.coverCategory, post.coverIndex || 0);
      } else if (vibePool.length > 0 && global.LayaDefaults) {
        const vIdx = ((Number(post.defaultVibeIndex) || idx) % vibePool.length + vibePool.length) % vibePool.length;
        mediaSrc = global.LayaDefaults.getLibraryImage(vibePool[vIdx]);
      }

      if (mediaSrc && (mediaSrc.complete === undefined || mediaSrc.complete || isVideo)) {
        renderer.drawCoverImage(ctx, mediaSrc, cx, cy, cw, mh);
      } else {
        const pGrad = ctx.createLinearGradient(cx, cy, cx + cw, cy + mh);
        pGrad.addColorStop(0, '#271747');
        pGrad.addColorStop(1, '#120d21');
        ctx.fillStyle = pGrad;
        ctx.fillRect(cx, cy, cw, mh);
      }

      // 底部微暗角保证文字角标清晰
      const mediaFade = ctx.createLinearGradient(cx, cy + mh * 0.65, cx, cy + mh);
      mediaFade.addColorStop(0, 'rgba(0, 0, 0, 0)');
      mediaFade.addColorStop(1, 'rgba(9, 7, 17, 0.58)');
      ctx.fillStyle = mediaFade;
      ctx.fillRect(cx, cy + mh * 0.65, cw, mh * 0.35);

      // 左上角「置顶」Laya 紫粉标签
      const pinKey = `prof_post_pin_${post.id}`;
      if (post.pinBadge && renderer.isVisible(state, pinKey)) {
        const pinOff = renderer.getOffset(state, pinKey);
        const pinFs = renderer.getFontPx(state, pinKey, 17);
        ctx.save();
        ctx.font = `700 ${pinFs}px ${FONT_SANS}`;
        const ptw = ctx.measureText(post.pinBadge).width;
        const pw = ptw + 20;
        const ph = Math.max(26, Math.round(pinFs * 1.65));
        const px = cx + 14 + pinOff.x;
        const py = cy + 14 + pinOff.y;
        const pg = ctx.createLinearGradient(px, py, px + pw, py + ph);
        pg.addColorStop(0, '#ec4899');
        pg.addColorStop(1, '#9333ea');
        ctx.fillStyle = pg;
        renderer.roundRect(ctx, px, py, pw, ph, 8);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(post.pinBadge, px + pw / 2, py + ph / 2 + 1);
        ctx.restore();
        renderer.registerHit(pinKey, `作品 ${idx + 1} 置顶角标`, 'element', px, py, pw, ph, pKey);
      }

      // 右上角视频播放小圆标
      const playKey = `prof_post_play_${post.id}`;
      if ((isVideo || post.showPlayIcon) && renderer.isVisible(state, playKey)) {
        const bOff = renderer.getOffset(state, playKey);
        const pbx = cx + cw - 28 + bOff.x;
        const pby = cy + 28 + bOff.y;
        ctx.save();
        ctx.fillStyle = 'rgba(12, 10, 22, 0.58)';
        ctx.beginPath();
        ctx.arc(pbx, pby, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(pbx - 4, pby - 7);
        ctx.lineTo(pbx + 8, pby);
        ctx.lineTo(pbx - 4, pby + 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        renderer.registerHit(playKey, `作品 ${idx + 1} 播放标`, 'element', pbx - 20, pby - 20, 40, 40, pKey);
        renderer.playButtons.push({
          cardId: `prof:${post.id}`,
          isVideo,
          isPaused: isVideoPaused,
          x: pbx - 24,
          y: pby - 24 - scrollY,
          w: 48,
          h: 48,
          cardX: cx,
          cardY: cy - scrollY,
          cardW: cw,
          mediaH: mh
        });
      }

      // 可选画面内花字大标题
      const ovKey = `prof_post_overlay_${post.id}`;
      if (post.overlayTitle && renderer.isVisible(state, ovKey)) {
        const oOff = renderer.getOffset(state, ovKey);
        const oFs = renderer.getFontPx(state, ovKey, 30);
        const oLines = String(post.overlayTitle).split('\n');
        const oLineH = Math.round(oFs * 1.25);
        const ocx = cx + cw / 2 + oOff.x;
        const ocy = cy + mh * 0.44 - ((oLines.length - 1) * oLineH) / 2 + oOff.y;
        oLines.forEach((line, lIdx) => {
          renderer.drawStrokedRichLine(ctx, line, ocx, ocy + lIdx * oLineH, oFs, 800, Math.max(4, oFs * 0.22), '#ffffff', '#f472b6');
        });
        renderer.registerHit(ovKey, `作品 ${idx + 1} 画面花字`, 'element', cx + 18 + oOff.x, ocy - oFs * 0.7, cw - 36, oLines.length * oLineH + 8, pKey);
      }

      // 可选画面底部「刚刚看过」状态标签
      const wtKey = `prof_post_watched_${post.id}`;
      if (post.watchedTag && renderer.isVisible(state, wtKey)) {
        const wOff = renderer.getOffset(state, wtKey);
        const wFs = renderer.getFontPx(state, wtKey, 18);
        ctx.save();
        ctx.font = `600 ${wFs}px ${FONT_SANS}`;
        const wtw = ctx.measureText(post.watchedTag).width;
        const wpW = wtw + 26;
        const wpH = Math.max(28, Math.round(wFs * 1.65));
        const wx = cx + (cw - wpW) / 2 + wOff.x;
        const wy = cy + mh - wpH - 14 + wOff.y;
        ctx.fillStyle = 'rgba(15, 11, 28, 0.76)';
        renderer.roundRect(ctx, wx, wy, wpW, wpH, wpH / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(216, 180, 254, 0.32)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#f5d0fe';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(post.watchedTag, wx + wpW / 2, wy + wpH / 2 + 1);
        ctx.restore();
        renderer.registerHit(wtKey, `作品 ${idx + 1} 状态角标`, 'element', wx, wy, wpW, wpH, pKey);
      }

      // 卡片下方内容区背景
      const footerY = cy + mh;
      if (!isFullTrans) {
        const fBg = ctx.createLinearGradient(cx, footerY, cx, footerY + pl.footerH);
        fBg.addColorStop(0, isLight ? '#ffffff' : '#161226');
        fBg.addColorStop(1, isLight ? '#faf7ff' : '#110d1c');
        ctx.fillStyle = fBg;
        ctx.fillRect(cx, footerY, cw, pl.footerH);
      }

      let curFY = footerY + 14;

      // 作品标题文案（可由 AI 识别画面生成 + 可任意编辑）
      const tKey = `prof_post_title_${post.id}`;
      if (pl.titleLines.length > 0 && renderer.isVisible(state, tKey)) {
        const tOff = renderer.getOffset(state, tKey);
        const tFs = renderer.getFontPx(state, tKey, 24);
        ctx.save();
        ctx.font = `600 ${tFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        pl.titleLines.forEach((line, lIdx) => {
          renderer.fillReadableText(
            ctx,
            line,
            cx + 14 + tOff.x,
            curFY + lIdx * pl.titleLineH + tOff.y,
            isLight ? '#1e1633' : '#f5f2ff',
            isFullTrans
          );
        });
        ctx.restore();
        renderer.registerHit(
          tKey,
          `作品 ${idx + 1} 标题`,
          'element',
          cx + 10 + tOff.x,
          curFY - 2 + tOff.y,
          cw - 20,
          pl.titleLines.length * pl.titleLineH + 6,
          pKey
        );
        curFY += pl.titleLines.length * pl.titleLineH + 12;
      }

      // AI 热评摘要（根据上传内容生成）
      const hcKey = `prof_post_hotcmt_${post.id}`;
      if (pl.hotLines.length > 0 && renderer.isVisible(state, hcKey)) {
        const hcOff = renderer.getOffset(state, hcKey);
        const hcFs = renderer.getFontPx(state, hcKey, 18);
        const boxH = pl.hotLines.length * pl.hotLineH + 10;
        const bx = cx + 12 + hcOff.x;
        const by = curFY + hcOff.y;
        ctx.save();
        ctx.fillStyle = 'rgba(168, 85, 247, 0.13)';
        renderer.roundRect(ctx, bx, by, cw - 24, boxH, 9);
        ctx.fill();
        ctx.strokeStyle = 'rgba(216, 180, 254, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = `500 ${hcFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        pl.hotLines.forEach((line, lIdx) => {
          renderer.fillReadableText(ctx, line, bx + 9, by + 6 + lIdx * pl.hotLineH, '#e9d5ff', false);
        });
        ctx.restore();
        renderer.registerHit(hcKey, `作品 ${idx + 1} 热评摘要`, 'element', bx, by, cw - 24, boxH, pKey);
        curFY += boxH + 8;
      }

      // 底部信息行：作者小头像 + 昵称 + 时间 | 右侧爱心点赞数
      const metaCenterY = footerY + pl.footerH - 30;
      let likeLeftLimit = cx + cw - 14;
      const likeKey = `prof_post_likes_${post.id}`;
      const lStr = strVal(post.likes, '');
      if (lStr !== '' && renderer.isVisible(state, likeKey)) {
        const lOff = renderer.getOffset(state, likeKey);
        const lFs = renderer.getFontPx(state, likeKey, 18);
        ctx.save();
        ctx.font = `600 ${lFs}px ${FONT_SANS}`;
        const ltw = ctx.measureText(lStr).width;
        const hs = Math.max(5.5, lFs * 0.36);
        const pillW = ltw + hs * 2 + 22;
        const pillH = Math.max(26, Math.round(lFs * 1.5));
        const px = cx + cw - 12 - pillW + lOff.x;
        const py = metaCenterY - pillH / 2 + lOff.y;
        ctx.fillStyle = 'rgba(168, 85, 247, 0.14)';
        renderer.roundRect(ctx, px, py, pillW, pillH, pillH / 2);
        ctx.fill();
        renderer.drawHeartOutline(ctx, px + hs + 10, metaCenterY + lOff.y, hs, '#f472b6');
        ctx.fillStyle = '#e9d5ff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(lStr, px + hs * 2 + 15, metaCenterY + lOff.y + 1);
        ctx.restore();
        renderer.registerHit(likeKey, `作品 ${idx + 1} 点赞数`, 'element', px, py, pillW, pillH, pKey);
        likeLeftLimit = px - 8;
      }

      const auKey = `prof_post_author_${post.id}`;
      const tmKey = `prof_post_time_${post.id}`;
      const showAu = feedCfg.showAuthorOnCard !== false && renderer.isVisible(state, auKey);
      const showTm = feedCfg.showTimeOnCard !== false && post.publishTime && renderer.isVisible(state, tmKey);
      const cardAuthorName =
        feedCfg.syncAuthorFromProfile !== false
          ? baseSyncedNickname
          : strVal(post.customAuthor, baseSyncedNickname);

      if (showAu) {
        const aOff = renderer.getOffset(state, auKey);
        const aFs = renderer.getFontPx(state, auKey, 18);
        const miniAv = 26;
        const ax = cx + 14 + aOff.x;
        const ay = (showTm ? metaCenterY - 9 : metaCenterY) + aOff.y;
        if (syncedAvatar && (syncedAvatar.complete === undefined || syncedAvatar.complete)) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(ax + miniAv / 2, ay, miniAv / 2, 0, Math.PI * 2);
          ctx.clip();
          renderer.drawCoverImage(ctx, syncedAvatar, ax, ay - miniAv / 2, miniAv, miniAv);
          ctx.restore();
        }
        const nickX = ax + miniAv + 8;
        const maxNickW = Math.max(48, likeLeftLimit - nickX);
        ctx.save();
        ctx.font = `500 ${aFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const shortN = renderer.truncateText(ctx, cardAuthorName, maxNickW);
        renderer.fillReadableText(ctx, shortN, nickX, ay + 1, isLight ? '#524869' : '#c4bedb', isFullTrans);
        const totalW = Math.max(52, miniAv + 8 + ctx.measureText(shortN).width + 4);
        ctx.restore();
        renderer.registerHit(auKey, `作品 ${idx + 1} 作者`, 'element', ax, ay - 14, totalW, 28, pKey);
      }

      if (showTm) {
        const tmOff = renderer.getOffset(state, tmKey);
        const tmFs = renderer.getFontPx(state, tmKey, 17);
        const tx = cx + (showAu ? 48 : 14) + tmOff.x;
        const ty = (showAu ? metaCenterY + 13 : metaCenterY) + tmOff.y;
        ctx.save();
        ctx.font = `400 ${tmFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const shortT = renderer.truncateText(ctx, post.publishTime, Math.max(48, likeLeftLimit - tx));
        renderer.fillReadableText(ctx, shortT, tx, ty, isLight ? '#7c7296' : 'rgba(176, 168, 206, 0.72)', isFullTrans);
        const tw = ctx.measureText(shortT).width + 6;
        ctx.restore();
        renderer.registerHit(tmKey, `作品 ${idx + 1} 发布时间`, 'element', tx - 2, ty - 12, tw, 24, pKey);
      }

      ctx.restore();
      if (!isFullTrans) {
        renderer.drawGlassCardRim(ctx, cx, cy, cw, ch, cardRadius);
      }
      renderer.registerHit(pKey, `作品卡片 ${idx + 1}（点击上传/拖动）`, 'element', cx, cy, cw, ch, 'prof_feed');
    });

    // 11) 底部 Laya 互动评论区抽屉板块
    const cmtSec = pc.commentSection || {};
    if (cmtSec.enabled !== false && layout.commentsH > 0 && renderer.isVisible(state, 'prof_comment_section')) {
      const csX = layout.padX;
      const csY = layout.commentsY;
      const csW = layout.contentW;
      const csH = layout.commentsH;

      if (!isFullTrans) {
        ctx.save();
        renderer.roundRect(ctx, csX, csY, csW, csH, 22);
        const cBg = ctx.createLinearGradient(csX, csY, csX, csY + csH);
        cBg.addColorStop(0, isLight ? '#ffffff' : '#141024');
        cBg.addColorStop(1, isLight ? '#f7f4fe' : '#0f0c1a');
        ctx.fillStyle = cBg;
        ctx.fill();
        ctx.restore();
        renderer.drawGlassCardRim(ctx, csX, csY, csW, csH, 22);
      }

      // 标题栏
      if (renderer.isVisible(state, 'prof_comments_header')) {
        const hOff = renderer.getOffset(state, 'prof_comments_header');
        const hFs = renderer.getFontPx(state, 'prof_comments_header', 26);
        const hx = csX + 24 + hOff.x;
        const hy = csY + 34 + hOff.y;
        const hStr = strVal(cmtSec.headerTitle, '精选互动评论');
        ctx.save();
        ctx.font = `700 ${hFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        renderer.fillReadableText(ctx, hStr, hx, hy, isLight ? '#1a112b' : '#ffffff', isFullTrans);
        const hw = Math.max(60, ctx.measureText(hStr).width + 12);
        ctx.restore();
        renderer.registerHit('prof_comments_header', '评论区标题', 'element', hx - 4, hy - 20, hw, 40, 'prof_comment_section');
      }

      // 评论引导输入框胶囊
      if (renderer.isVisible(state, 'prof_comments_placeholder')) {
        const pOff = renderer.getOffset(state, 'prof_comments_placeholder');
        const pFs = renderer.getFontPx(state, 'prof_comments_placeholder', 21);
        const px = csX + 24 + pOff.x;
        const py = csY + 62 + pOff.y;
        const pw = csW - 48;
        const ph = 46;
        ctx.save();
        ctx.fillStyle = isLight ? '#f1ebfc' : 'rgba(28, 22, 48, 0.9)';
        renderer.roundRect(ctx, px, py, pw, ph, ph / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.26)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = `400 ${pFs}px ${FONT_SANS}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        renderer.fillReadableText(ctx, strVal(cmtSec.inputPlaceholder, '留下一句评论吧…'), px + 22, py + ph / 2 + 1, isLight ? '#6b5e8a' : 'rgba(203, 194, 232, 0.7)', false);
        ctx.restore();
        renderer.registerHit('prof_comments_placeholder', '评论输入框提示词', 'element', px, py, pw, ph, 'prof_comment_section');
      }

      // 各条评论项
      layout.cmtLayouts.forEach((cl) => {
        const cm = cl.cm;
        const cIdx = cl.cIdx;
        const cKey = `prof_cmt_${cm.id}`;
        const cOff = renderer.getOffset(state, cKey);
        const rowX = csX + 24 + cOff.x;
        const rowY = cl.y + cOff.y;
        const rowW = csW - 48;

        // 评论者头像（支持点击从头像库选）
        const avKey = `prof_cmt_avatar_${cm.id}`;
        const avX = rowX;
        const avY = rowY + 6;
        const avSz = 56;
        if (renderer.isVisible(state, avKey)) {
          const customCmtAv = renderer.media && renderer.media.profCommentAvatars && renderer.media.profCommentAvatars[cm.id];
          const cAvImg = resolveAvatarImage(renderer.media, customCmtAv, cm.avatarCategory || 'guys', cm.avatarIndex || cIdx);
          ctx.save();
          ctx.beginPath();
          ctx.arc(avX + avSz / 2, avY + avSz / 2, avSz / 2, 0, Math.PI * 2);
          ctx.clip();
          if (cAvImg && (cAvImg.complete === undefined || cAvImg.complete)) {
            renderer.drawCoverImage(ctx, cAvImg, avX, avY, avSz, avSz);
          } else {
            ctx.fillStyle = '#312352';
            ctx.fillRect(avX, avY, avSz, avSz);
          }
          ctx.restore();
          renderer.registerHit(avKey, `评论 ${cIdx + 1} 头像（点选头像库）`, 'element', avX, avY, avSz, avSz, cKey);
        }

        const textLeftX = rowX + avSz + 18;
        const textMaxW = rowW - avSz - 102;

        // 右侧点赞
        const clkKey = `prof_cmt_likes_${cm.id}`;
        if (renderer.isVisible(state, clkKey)) {
          const lOff = renderer.getOffset(state, clkKey);
          const lFs = renderer.getFontPx(state, clkKey, 18);
          const lx = rowX + rowW - 22 + lOff.x;
          const ly = rowY + 26 + lOff.y;
          renderer.drawHeartOutline(ctx, lx, ly - 6, 7.5, 'rgba(244, 114, 182, 0.85)');
          ctx.save();
          ctx.font = `500 ${lFs}px ${FONT_SANS}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          renderer.fillReadableText(ctx, String(cm.likes || '0'), lx, ly + 8, isLight ? '#7c6e99' : 'rgba(203, 194, 232, 0.75)', false);
          ctx.restore();
          renderer.registerHit(clkKey, `评论 ${cIdx + 1} 点赞`, 'element', lx - 24, ly - 16, 48, 48, cKey);
        }

        // 昵称
        const nkKey = `prof_cmt_nick_${cm.id}`;
        if (renderer.isVisible(state, nkKey)) {
          const nOff = renderer.getOffset(state, nkKey);
          const nFs = renderer.getFontPx(state, nkKey, 21);
          const nx = textLeftX + nOff.x;
          const ny = rowY + 14 + nOff.y;
          const nkStr = strVal(cm.nickname, 'Laya 网友');
          ctx.save();
          ctx.font = `600 ${nFs}px ${FONT_SANS}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          renderer.fillReadableText(ctx, nkStr, nx, ny, isLight ? '#6b21a8' : '#c4b5fd', false);
          const nw = Math.max(54, ctx.measureText(nkStr).width + 10);
          ctx.restore();
          renderer.registerHit(nkKey, `评论 ${cIdx + 1} 昵称`, 'element', nx - 4, ny - 14, nw, 28, cKey);
        }

        // 正文
        const txKey = `prof_cmt_text_${cm.id}`;
        let curCY = rowY + 34;
        if (renderer.isVisible(state, txKey)) {
          const tOff = renderer.getOffset(state, txKey);
          const tFs = renderer.getFontPx(state, txKey, 23);
          ctx.save();
          ctx.font = `400 ${tFs}px ${FONT_SANS}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          cl.cLines.forEach((line, lIdx) => {
            renderer.fillReadableText(ctx, line, textLeftX + tOff.x, curCY + lIdx * cl.cLineH + tOff.y, isLight ? '#1d152e' : '#f8f5ff', false);
          });
          ctx.restore();
          renderer.registerHit(txKey, `评论 ${cIdx + 1} 内容`, 'element', textLeftX + tOff.x, curCY + tOff.y, textMaxW, Math.max(28, cl.cLines.length * cl.cLineH), cKey);
          curCY += cl.cLines.length * cl.cLineH + 6;
        }

        // 时间地点
        const mtKey = `prof_cmt_meta_${cm.id}`;
        if (cm.timeLoc && renderer.isVisible(state, mtKey)) {
          const mOff = renderer.getOffset(state, mtKey);
          const mFs = renderer.getFontPx(state, mtKey, 17);
          ctx.save();
          ctx.font = `400 ${mFs}px ${FONT_SANS}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          renderer.fillReadableText(ctx, cm.timeLoc, textLeftX + mOff.x, curCY + mOff.y, isLight ? '#8578a3' : 'rgba(176, 168, 206, 0.65)', false);
          const mw = ctx.measureText(cm.timeLoc).width + 10;
          ctx.restore();
          renderer.registerHit(mtKey, `评论 ${cIdx + 1} 时间属地`, 'element', textLeftX + mOff.x, curCY + mOff.y, mw, 24, cKey);
          curCY += 28;
        }

        // 作者回复框
        const rpKey = `prof_cmt_reply_${cm.id}`;
        if (cl.replyLines.length > 0 && renderer.isVisible(state, rpKey)) {
          const rOff = renderer.getOffset(state, rpKey);
          const rFs = renderer.getFontPx(state, rpKey, 21);
          const rx = textLeftX + rOff.x;
          const ry = curCY + 4 + rOff.y;
          const rw = textMaxW;
          const rh = cl.replyLines.length * cl.repLineH + 14;
          ctx.save();
          ctx.fillStyle = 'rgba(147, 51, 234, 0.14)';
          renderer.roundRect(ctx, rx, ry, rw, rh, 10);
          ctx.fill();
          ctx.font = `500 ${rFs}px ${FONT_SANS}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          cl.replyLines.forEach((line, lIdx) => {
            renderer.fillReadableText(ctx, line, rx + 12, ry + 7 + lIdx * cl.repLineH, '#f5d0fe', false);
          });
          ctx.restore();
          renderer.registerHit(rpKey, `评论 ${cIdx + 1} 作者回复`, 'element', rx, ry, rw, rh, cKey);
        }

        if (cIdx < layout.cmtLayouts.length - 1) {
          ctx.save();
          ctx.fillStyle = 'rgba(192, 132, 252, 0.1)';
          ctx.fillRect(textLeftX, rowY + cl.h - 2, rowW - avSz - 18, 1);
          ctx.restore();
        }
      });
    }

    ctx.restore(); // 结束可滚动内容
    renderer._hitScrollOffsetY = 0;

    // 12) 固定在顶部的手机系统状态栏（参考图2顶部 01:05 + 图标 + 电量，融合 Laya 状态图标）
    if (hdr.showStatusBar && renderer.isVisible(state, 'prof_status_bar')) {
      renderProfileStatusBar(renderer, ctx, state, hdr, W, layout.statusH, isFullTrans, isLight);
    }

    // 13) 可选固定在底部的 Laya 软件原生五宫格导航栏
    if (pc.bottomNav && pc.bottomNav.enabled && renderer.isVisible(state, 'prof_bottom_nav')) {
      renderProfileBottomNav(renderer, ctx, state, pc.bottomNav, W, H, layout.botNavH, isFullTrans, isLight);
    }
  }

  function renderProfileStatusBar(renderer, ctx, state, hdr, W, sbH, isFullTrans, isLight) {
    const raw = (renderer.media && renderer.media.raw) || {};
    const cy = sbH / 2 + 2;
    const padX = 36;

    ctx.save();
    if (!isFullTrans) {
      ctx.fillStyle = isLight ? 'rgba(248, 246, 255, 0.85)' : 'rgba(8, 6, 15, 0.72)';
      ctx.fillRect(0, 0, W, sbH);
    }

    if (renderer.isVisible(state, 'prof_sb_time')) {
      const tOff = renderer.getOffset(state, 'prof_sb_time');
      const tFs = renderer.getFontPx(state, 'prof_sb_time', 24);
      const tx = padX + tOff.x;
      const ty = cy + tOff.y;
      ctx.font = `700 ${tFs}px ${FONT_SANS}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const timeStr = strVal(hdr.time, '01:05');
      renderer.fillReadableText(ctx, timeStr, tx, ty, isLight ? '#181029' : '#ffffff', isFullTrans);
      const tw = Math.max(40, ctx.measureText(timeStr).width);
      renderer.registerHit('prof_sb_time', '状态栏时间', 'element', tx - 4, ty - 16, tw + 10, 32, 'prof_status_bar');

      // 紧随时间后的 Laya 小图标 + 社交通知小点
      let nx = tx + tw + 14;
      if (hdr.showLayaNotif !== false && raw.brand_laya && raw.brand_laya.complete) {
        ctx.save();
        renderer.roundRect(ctx, nx, cy - 13, 26, 26, 6);
        ctx.clip();
        renderer.drawCoverImage(ctx, raw.brand_laya, nx, cy - 13, 26, 26);
        ctx.restore();
        nx += 34;
      }
      if (raw.sb_notifs && raw.sb_notifs.complete && raw.sb_notifs.naturalWidth) {
        ctx.drawImage(raw.sb_notifs, 0, 0, 16, 20, nx, cy - 12, 20, 24);
        nx += 26;
        ctx.drawImage(raw.sb_notifs, 17, 0, 17, 20, nx, cy - 12, 21, 24);
      }
    }

    // 右侧 5G / Wi-Fi / 电量胶囊（同图2风格）
    const netLabel = strVal(hdr.networkType, '5G') || '5G';
    let rx = W - padX;
    rx -= 52;
    renderer.drawBatteryIcon(ctx, rx, cy - 12, 48, 24, hdr.battery || 20, hdr.charging);
    rx -= 14;
    if (hdr.wifi !== false) {
      rx -= 26;
      renderer.drawWifiIcon(ctx, rx + 13, cy + 8);
      rx -= 12;
    }
    if (hdr.dualSim !== false) {
      rx -= 44;
      renderer.drawSignalIcon(ctx, rx, cy - 13, hdr.signal2 || 3, netLabel, 0.88);
      rx -= 8;
    }
    rx -= 44;
    renderer.drawSignalIcon(ctx, rx, cy - 13, hdr.signal1 || 4, netLabel, 0.88);

    ctx.restore();
  }

  function renderProfileBottomNav(renderer, ctx, state, botNav, W, H, navH, isFullTrans, isLight) {
    const raw = (renderer.media && renderer.media.raw) || {};
    const y = H - navH;
    const tabs = Array.isArray(botNav.tabs) ? botNav.tabs : [];

    ctx.save();
    if (!isFullTrans) {
      ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(10, 7, 18, 0.96)';
      ctx.fillRect(0, y, W, navH);
      ctx.fillStyle = 'rgba(192, 132, 252, 0.16)';
      ctx.fillRect(0, y, W, 1);
    }

    const span = W / Math.max(1, tabs.length);
    tabs.forEach((tab, idx) => {
      const key = `prof_bot_nav_${idx}`;
      if (!renderer.isVisible(state, key)) return;
      const isAct = idx === Number(botNav.activeIndex);
      const bOff = renderer.getOffset(state, key);
      const cx = span * (idx + 0.5) + bOff.x;
      const iconCY = y + 34 + bOff.y;
      const lblY = y + 76 + bOff.y;

      if (isAct) {
        const spot = ctx.createRadialGradient(cx, iconCY + 4, 4, cx, iconCY + 4, 48);
        spot.addColorStop(0, 'rgba(236, 72, 153, 0.24)');
        spot.addColorStop(1, 'rgba(236, 72, 153, 0)');
        ctx.fillStyle = spot;
        ctx.beginPath();
        ctx.arc(cx, iconCY + 4, 48, 0, Math.PI * 2);
        ctx.fill();
      }

      const assetKey = `app_${isAct ? tab.assetActive : tab.assetInactive}`;
      const sprite = raw[assetKey];
      if (sprite && sprite.complete && sprite.naturalWidth) {
        renderer.drawContainImage(ctx, sprite, cx - 22, iconCY - 22, 44, 44);
      }

      if (tab.badge && renderer.isVisible(state, `prof_bot_badge_${idx}`)) {
        const badgeFs = renderer.getFontPx(state, `prof_bot_badge_${idx}`, 12);
        ctx.font = `800 ${badgeFs}px ${FONT_SANS}`;
        const bw = Math.max(30, ctx.measureText(tab.badge).width + 14);
        const bh = Math.max(18, Math.round(badgeFs * 1.6));
        const bx = cx + 12;
        const by = iconCY - 22;
        ctx.fillStyle = '#fe2c55';
        renderer.roundRect(ctx, bx, by, bw, bh, bh / 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tab.badge, bx + bw / 2, by + bh / 2 + 0.5);
        renderer.registerHit(`prof_bot_badge_${idx}`, `导航角标：${tab.label}`, 'element', bx - 2, by - 2, bw + 4, bh + 4, 'prof_bottom_nav');
      }

      const fs = renderer.getFontPx(state, key, 19);
      ctx.font = `${isAct ? '700' : '500'} ${fs}px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      renderer.fillReadableText(
        ctx,
        tab.label,
        cx,
        lblY,
        isAct ? '#f0abfc' : isLight ? '#6b5e8a' : 'rgba(180, 172, 208, 0.62)',
        isFullTrans
      );

      renderer.registerHit(key, `底部导航：${tab.label}`, 'element', cx - 50, y + 6, 100, navH - 12, 'prof_bottom_nav');
    });

    ctx.restore();
  }

  // =========================================================================
  // 4. AI 统一调用链路（支持用户 Key / URL 参数 / 共享 Key / GAS 代理 / 多模态看片）
  // =========================================================================
  const _TEAM_BUILTIN_KEY_PARTS = ['AQ.Ab8RN6JEu2BzQVh7cehw', 'LxkkCOnsQG4E4a8_I3RTKtzd5AIS6w'];

  function resolveGeminiConfig(aiConfig) {
    const cfg = aiConfig || {};
    let key = String(cfg.apiKey || '').trim();
    if (!key) {
      try {
        const params = new URLSearchParams((global.location && global.location.search) || '');
        key = String(params.get('ai_key') || '').trim();
      } catch (_) {}
    }
    if (!key) {
      try {
        key = String(localStorage.getItem('LAYA_LIVE_SHARED_AI_KEY') || '').trim();
      } catch (_) {}
    }
    if (!key && global.LAYA_GLOBAL_SHARED_AI_KEY) {
      key = String(global.LAYA_GLOBAL_SHARED_AI_KEY).trim();
    }
    if (!key) {
      key = _TEAM_BUILTIN_KEY_PARTS.join('');
    }
    const proxy = String(cfg.gasProxyUrl || '').trim();
    return { apiKey: key, gasProxyUrl: proxy };
  }

  async function callGeminiRequest(aiConfig, parts, options) {
    const { apiKey, gasProxyUrl } = resolveGeminiConfig(aiConfig);
    const normalizedParts = (parts || []).map((p) => {
      if (p && p.inlineData) {
        return { inline_data: { mime_type: p.inlineData.mimeType || 'image/jpeg', data: p.inlineData.data } };
      }
      return p;
    });
    const baseGenCfg = Object.assign(
      {
        temperature: 0.9,
        maxOutputTokens: 2048
      },
      options && options.generationConfig ? options.generationConfig : {}
    );

    if (gasProxyUrl) {
      const resp = await fetch(gasProxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          apiKey,
          payload: { contents: [{ role: 'user', parts: normalizedParts }], generationConfig: baseGenCfg }
        })
      });
      if (!resp.ok) throw new Error(`GAS 代理请求失败 (HTTP ${resp.status})`);
      const json = await resp.json();
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
      return json;
    }

    if (!apiKey) {
      throw new Error('未填写 Gemini API Key');
    }

    const enc = encodeURIComponent(apiKey);
    const explicitModel = (options && options.model) || '';
    const modelSpecs = explicitModel
      ? [{ id: explicitModel, cfg: baseGenCfg }]
      : [
          {
            id: 'gemini-3.8-flash',
            cfg: Object.assign({ thinkingConfig: { thinkingLevel: 'LOW' } }, baseGenCfg)
          },
          { id: 'gemini-flash-latest', cfg: baseGenCfg },
          { id: 'gemini-2.5-flash', cfg: baseGenCfg },
          { id: 'gemini-2.0-flash', cfg: baseGenCfg }
        ];

    const attempts = [];
    modelSpecs.forEach((spec) => {
      attempts.push({
        url: `https://generativelanguage.googleapis.com/v1beta/models/${spec.id}:generateContent?key=${enc}`,
        cfg: spec.cfg
      });
      attempts.push({
        url: `https://aiplatform.googleapis.com/v1/publishers/google/models/${spec.id}:generateContent?key=${enc}`,
        cfg: spec.cfg
      });
    });

    let lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
      try {
        const res = await fetch(attempts[i].url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: normalizedParts }],
            generationConfig: attempts[i].cfg
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          lastErr = new Error((data && data.error && data.error.message) || `HTTP ${res.status}`);
          continue;
        }
        return data;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Gemini 接口请求失败');
  }

  function extractJsonFromGeminiResponse(apiResponse) {
    const candidates = apiResponse && apiResponse.candidates;
    if (!candidates || !candidates.length) throw new Error('模型未返回内容');
    const parts = (candidates[0].content && candidates[0].content.parts) || [];
    const rawText = parts
      .filter((p) => typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('\n')
      .trim();
    if (!rawText) throw new Error('模型返回文本为空');
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const firstObj = cleaned.indexOf('{');
    const lastObj = cleaned.lastIndexOf('}');
    const jsonSlice = firstObj !== -1 && lastObj > firstObj ? cleaned.slice(firstObj, lastObj + 1) : cleaned;
    return JSON.parse(jsonSlice);
  }

  // =========================================================================
  // 5. AI 生成主页背景图（支持 Gemini 原生生图 + Laya 氛围合成兜底）
  // =========================================================================
  async function generateProfileBgWithAI(state, mediaRegistry) {
    const pc = state.profileCenter;
    const prompt = (pc.aiBgPrompt || '').trim() || '暗夜紫粉霓虹城市夜景与柔和人物光斑背景';
    const { apiKey } = resolveGeminiConfig(state.aiConfig);

    // 1) 尝试 Gemini 原生图像生成模型（若当前 Key 支持）
    if (apiKey && !apiKey.startsWith('AQ.')) {
      try {
        const enc = encodeURIComponent(apiKey);
        const imgUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${enc}`;
        const res = await fetch(imgUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Create a moody, aesthetic dark purple and neon pink portrait photography background banner (wide landscape 16:9, soft bokeh, no text, no watermarks) inspired by: ${prompt}`
                  }
                ]
              }
            ],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
          })
        });
        if (res.ok) {
          const json = await res.json();
          const parts = (json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts) || [];
          const imgPart = parts.find((p) => p.inlineData && p.inlineData.data);
          if (imgPart) {
            const bstr = atob(imgPart.inlineData.data);
            const u8 = new Uint8Array(bstr.length);
            for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
            const blob = new Blob([u8], { type: imgPart.inlineData.mimeType || 'image/png' });
            return { blob, source: 'gemini-image' };
          }
        }
      } catch (_) {}
    }

    // 2) 视觉艺术合成引擎（融合头像库实拍图 + AI 色调指令 + 电影景深虚化 + 霓虹光斑）
    let palette = ['#1a0b32', '#6b21a8', '#ec4899', '#38bdf8'];
    if (apiKey || (state.aiConfig && state.aiConfig.gasProxyUrl)) {
      try {
        const resp = await callGeminiRequest(
          state.aiConfig,
          [
            {
              text: `根据主题「${prompt}」，推荐 4 个契合暗夜个人主页背景的十六进制颜色（深底色、主光晕色、点缀霓虹色、星尘高光色），只返回 JSON：{"colors":["#1a0b32","#7e22ce","#f472b6","#38bdf8"]}`
            }
          ],
          { generationConfig: { responseMimeType: 'application/json', temperature: 0.85, maxOutputTokens: 256 } }
        );
        const parsed = extractJsonFromGeminiResponse(resp);
        if (Array.isArray(parsed.colors) && parsed.colors.length >= 4) {
          palette = parsed.colors;
        }
      } catch (_) {}
    }

    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 660;
    const cctx = canvas.getContext('2d');

    const bgGrad = cctx.createLinearGradient(0, 0, 1080, 660);
    bgGrad.addColorStop(0, palette[0] || '#140a28');
    bgGrad.addColorStop(0.55, palette[1] || '#4c1d95');
    bgGrad.addColorStop(1, '#090612');
    cctx.fillStyle = bgGrad;
    cctx.fillRect(0, 0, 1080, 660);

    // 随机挑一张氛围图库/当前头像做艺术虚化融合
    const vibes = (global.LAYA_ASIAN_AVATARS && global.LAYA_ASIAN_AVATARS.vibes) || [];
    const pickSrc = vibes.length ? vibes[Math.floor(Math.random() * vibes.length)] : null;
    if (pickSrc) {
      await new Promise((resolve) => {
        const im = new Image();
        im.onload = () => {
          cctx.save();
          cctx.globalAlpha = 0.56;
          cctx.filter = 'blur(8px) contrast(1.08) saturate(1.25)';
          const scale = Math.max(1080 / im.width, 660 / im.height);
          const rw = im.width * scale;
          const rh = im.height * scale;
          cctx.drawImage(im, (1080 - rw) / 2, (660 - rh) / 2, rw, rh);
          cctx.restore();
          resolve();
        };
        im.onerror = resolve;
        im.src = pickSrc;
      });
    }

    // 绘制浪漫散景光斑与梦幻极光层
    for (let i = 0; i < 24; i++) {
      const gx = Math.random() * 1080;
      const gy = Math.random() * 540;
      const gr = 30 + Math.random() * 150;
      const col = i % 2 === 0 ? palette[2] || '#ec4899' : palette[3] || '#a855f7';
      const orb = cctx.createRadialGradient(gx, gy, 2, gx, gy, gr);
      orb.addColorStop(0, col + '55');
      orb.addColorStop(0.6, col + '18');
      orb.addColorStop(1, 'rgba(0,0,0,0)');
      cctx.fillStyle = orb;
      cctx.beginPath();
      cctx.arc(gx, gy, gr, 0, Math.PI * 2);
      cctx.fill();
    }

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return { blob, source: 'ai-synthesized' };
  }

  // =========================================================================
  // 6. AI 生成个人主页头像与全套资料（同步从离线头像库匹配头像）
  // =========================================================================
  function pickRandomAvatarFromLibrary(genderPref) {
    const db = global.LAYA_ASIAN_AVATARS || {};
    let category = 'beauties';
    if (genderPref === 'male') category = 'guys';
    else if (genderPref === 'pet') category = 'pets';
    else if (genderPref === 'anime') category = 'anime';
    else if (genderPref === 'any') {
      const cats = ['beauties', 'guys', 'anime', 'pets'];
      category = cats[Math.floor(Math.random() * cats.length)];
    }
    const list = Array.isArray(db[category]) && db[category].length ? db[category] : db.beauties || [];
    const index = list.length ? Math.floor(Math.random() * list.length) : 0;
    return { category, index };
  }

  async function generateProfilePersonaWithAI(state) {
    const pc = state.profileCenter;
    const isTrad = state.posterLang === 'zh-TW';
    const langName = isTrad ? '繁体中文' : '简体中文';
    const genderPref = pc.aiGenderPref || 'female';
    const pickedAvatar = pickRandomAvatarFromLibrary(genderPref);
    const vibes = (global.LAYA_ASIAN_AVATARS && global.LAYA_ASIAN_AVATARS.vibes) || [];
    const vibeIndex = vibes.length ? Math.floor(Math.random() * vibes.length) : 0;

    const { apiKey, gasProxyUrl } = resolveGeminiConfig(state.aiConfig);
    if (apiKey || gasProxyUrl) {
      try {
        const genderHint = genderPref === 'male' ? '男生' : genderPref === 'female' ? '女生' : '年轻男女均可';
        const prompt = [
          '你是 Laya 语音社交 App 的个人主页人设生成器。',
          `请根据用户期望风格「${pc.aiPersonaPrompt || '魅力声控交友达人'}」及性别倾向「${genderHint}」，生成一套真实自然的${langName}个人中心资料。`,
          '要求只返回严格 JSON：',
          '{"nickname":"带反差感的昵称","userId":"8位左右字母数字ID","ipText":"IP：城市或省份","gender":"female或male","age":"例如22岁","level":"例如Lv.28","voiceTag":"带emoji的声音标签","onlineBadgeText":"例如🟢 语音房连麦中","following":"例如824","fans":"例如1.2万","likes":"例如6.8万","bioText":"3-4行个性简介，含emoji换行\\n","momentDesc":"例如 2 条瞬间 · 🎙️ 语音签名 15\\""}'
        ].join('\n');

        const resp = await callGeminiRequest(state.aiConfig, [{ text: prompt }], {
          generationConfig: { responseMimeType: 'application/json', temperature: 0.95, maxOutputTokens: 1024 }
        });
        const obj = extractJsonFromGeminiResponse(resp);
        return {
          avatarCategory: pickedAvatar.category,
          avatarIndex: pickedAvatar.index,
          vibeIndex,
          nickname: obj.nickname || '汐颜（回关）',
          userId: obj.userId || 'LY6182189',
          ipText: obj.ipText || 'IP：上海',
          gender: obj.gender === 'male' ? 'male' : 'female',
          age: obj.age || '22岁',
          level: obj.level || 'Lv.28',
          voiceTag: obj.voiceTag || '🎧 温柔甜妹音',
          onlineBadgeText: obj.onlineBadgeText || '🟢 语音房在线中',
          following: obj.following || '856',
          fans: obj.fans || '6290',
          likes: obj.likes || '5.1万',
          bioText: String(obj.bioText || '').replace(/\\n/g, '\n'),
          momentDesc: obj.momentDesc || '2 条瞬间 · 🎙️ 语音签名 14"',
          usedRemoteAI: true
        };
      } catch (_) {}
    }

    // 高质量本地人设模板兜底（无需网络/Key 即可立即更换整套资料与头像）
    const femalePresets = [
      {
        nickname: '林初夏（互关）',
        userId: 'LY8829104',
        ipText: 'IP：浙江 · 杭州',
        gender: 'female',
        age: '21岁',
        level: 'Lv.29',
        voiceTag: '🎧 软糯甜妹音',
        onlineBadgeText: '🟢 深夜电台开麦中',
        following: '642',
        fans: '8920',
        likes: '6.2万',
        bioText: '🌙 晚睡星人专属树洞\n🎤 吉他弹唱 / 深夜读诗 / 语音连麦\n🏃‍♀️ 西湖夜跑打卡第 128 天\n💌 私信秒回，扩列滴～',
        momentDesc: '3 条瞬间 · 🎙️ 语音签名 15"'
      },
      {
        nickname: 'Selina · 晚风',
        userId: 'XU38686149',
        ipText: 'IP：江苏 · 苏州',
        gender: 'female',
        age: '23岁',
        level: 'Lv.32',
        voiceTag: '✨ 清冷御姐音',
        onlineBadgeText: '🟢 语音派对房间 #102',
        following: '1068',
        fans: '4355',
        likes: '4.4万',
        bioText: '🏔️ ITRA：619 💪\n2025 Salomon 越野赛冠军 🥇\n2026 百公里耐力完赛 🏅\n📮 合作/连麦：38686149@qq.com',
        momentDesc: '1 条瞬间 · 🎙️ 语音签名 12"'
      },
      {
        nickname: '念念Nora',
        userId: 'LY5193027',
        ipText: 'IP：台北 · 信义区',
        gender: 'female',
        age: '22岁',
        level: 'Lv.25',
        voiceTag: '🫧 奶凶少女音',
        onlineBadgeText: '🟢 正在听歌找搭子',
        following: '389',
        fans: '1.3万',
        likes: '9.8万',
        bioText: '☕️ 咖啡重度依赖｜周末探店\n🎬 爱拍日常 Vlog 与小众胶片\n🎧 晚上 11 点准时上麦聊心事\n✨ 喜欢就直接发私信呀',
        momentDesc: '4 条瞬间 · 🎙️ 语音签名 09"'
      }
    ];

    const malePresets = [
      {
        nickname: '顾屿 · Kyson',
        userId: 'LY7742091',
        ipText: 'IP：新加坡',
        gender: 'male',
        age: '25岁',
        level: 'Lv.34',
        voiceTag: '🎙️ 磁性低音炮',
        onlineBadgeText: '🟢 语音房主麦在线',
        following: '312',
        fans: '1.6万',
        likes: '11.4万',
        bioText: '🏋️‍♂️ 健身 / 机车 / 深夜电台\n🎹 业余作曲，偶尔上麦清唱两句\n✈️ 常驻坡县与吉隆坡两地飞\n📩 交个走心的声音朋友',
        momentDesc: '2 条瞬间 · 🎙️ 语音签名 18"'
      },
      {
        nickname: '陈野Sean',
        userId: 'LY6182189',
        ipText: 'IP：香港 · 中环',
        gender: 'male',
        age: '24岁',
        level: 'Lv.27',
        voiceTag: '🌙 温柔青年音',
        onlineBadgeText: '🟢 刚结束连麦',
        following: '520',
        fans: '7410',
        likes: '5.3万',
        bioText: '📸 胶片街拍 & 徒步露营玩家\n🎧 Laya 深夜伴睡主播\n💬 欢迎在评论区点歌聊天',
        momentDesc: '3 条瞬间 · 🎙️ 语音签名 11"'
      }
    ];

    const pool = genderPref === 'male' ? malePresets : femalePresets;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const conv = (s) =>
      isTrad && global.LayaPosterLang ? global.LayaPosterLang.convertString(s, true) : s;

    return {
      avatarCategory: pickedAvatar.category,
      avatarIndex: pickedAvatar.index,
      vibeIndex,
      nickname: conv(chosen.nickname),
      userId: chosen.userId,
      ipText: conv(chosen.ipText),
      gender: chosen.gender,
      age: conv(chosen.age),
      level: chosen.level,
      voiceTag: conv(chosen.voiceTag),
      onlineBadgeText: conv(chosen.onlineBadgeText),
      following: chosen.following,
      fans: chosen.fans,
      likes: conv(chosen.likes),
      bioText: conv(chosen.bioText),
      momentDesc: conv(chosen.momentDesc),
      usedRemoteAI: false
    };
  }

  // =========================================================================
  // 7. AI 根据上传的视频/图片画面智能生成作品标题、热评与底部评论区文案
  // =========================================================================
  function sampleCanvasWithLuma(mediaEl) {
    if (!mediaEl) return null;
    try {
      const sw = mediaEl.videoWidth || mediaEl.naturalWidth || mediaEl.width;
      const sh = mediaEl.videoHeight || mediaEl.naturalHeight || mediaEl.height;
      if (!sw || !sh) return null;
      const maxDim = 512;
      const scale = Math.min(1, maxDim / Math.max(sw, sh));
      const cw = Math.max(1, Math.round(sw * scale));
      const ch = Math.max(1, Math.round(sh * scale));
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const cx = c.getContext('2d');
      cx.drawImage(mediaEl, 0, 0, cw, ch);
      let avgLuma = 128;
      try {
        if (typeof cx.getImageData === 'function') {
          const px = cx.getImageData(0, 0, cw, ch).data;
          let sum = 0;
          let cnt = 0;
          for (let i = 0; i < px.length; i += 64) {
            sum += px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
            cnt++;
          }
          if (cnt > 0) avgLuma = sum / cnt;
        }
      } catch (_) {}
      const dataUrl = c.toDataURL('image/jpeg', 0.78);
      const b64 = dataUrl.split(',')[1];
      return b64 ? { mimeType: 'image/jpeg', data: b64, avgLuma } : null;
    } catch (_) {
      return null;
    }
  }

  async function captureMediaFrameSmart(mediaEl) {
    const first = sampleCanvasWithLuma(mediaEl);
    if (!first) return null;
    // 若为视频且当前采样帧极暗（例如黑场淡入开头），推进到非黑帧重采样
    const isVideoEl = mediaEl && typeof mediaEl.videoWidth === 'number' && mediaEl.videoWidth > 0;
    if (isVideoEl && first.avgLuma < 12 && Number.isFinite(mediaEl.duration) && mediaEl.duration > 0.6) {
      const origTime = mediaEl.currentTime || 0;
      const wasPaused = mediaEl.paused;
      try {
        await new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };
          mediaEl.addEventListener('seeked', finish, { once: true });
          mediaEl.currentTime = Math.min(mediaEl.duration * 0.25, 1.2);
          setTimeout(finish, 450);
        });
        const better = sampleCanvasWithLuma(mediaEl);
        if (wasPaused) {
          try {
            mediaEl.currentTime = origTime;
          } catch (_) {}
        }
        if (better && better.avgLuma > first.avgLuma) {
          return { mimeType: better.mimeType, data: better.data };
        }
      } catch (_) {}
    }
    return { mimeType: first.mimeType, data: first.data };
  }

  async function generateProfileFeedAndCommentsWithAI(state, mediaRegistry, targetPostIds) {
    const pc = state.profileCenter;
    const isTrad = state.posterLang === 'zh-TW';
    const langName = isTrad ? '繁体中文' : '简体中文';
    const allPosts = pc.posts || [];
    const targets = Array.isArray(targetPostIds) && targetPostIds.length
      ? allPosts.filter((p) => targetPostIds.includes(p.id))
      : allPosts;

    if (!targets.length) return { posts: [], comments: [], usedRemoteAI: false };

    const { apiKey, gasProxyUrl } = resolveGeminiConfig(state.aiConfig);
    if (apiKey || gasProxyUrl) {
      try {
        const promptLines = [
          '你是「Laya 语音交友社区 App」的资深内容运营与评论氛围策划。',
          `博主昵称：「${(pc.user && pc.user.nickname) || 'Laya用户'}」，签名简介：「${(pc.bio && pc.bio.text) || ''}」。`,
          `请仔细观察我提供给你的 ${targets.length} 个作品视频/图片画面（以及文件名/主题线索），为每一个作品撰写极其贴合画面内容的${langName}标题和卡片热评，并生成 3 条真实感十足的底部评论区互动评论。`,
          '要求：',
          '1. 每个作品的 title（10~22字，自然口语+适当emoji，像真人发的朋友圈/动态/短视频标题）；',
          '2. 每个作品的 hotComment（以 "💬 " 开头的短热评，12~24字，紧扣视频或图片里的细节调侃/夸赞）；',
          '3. 每个作品的 likes（真实点赞数如 "269"、"1048"）；',
          '4. comments 数组（固定 3 条，根据刚才上传的画面内容来夸赞/提问/互动，包含海外华人/年轻用户昵称 nickname、评论正文 text、时间地点 timeLoc 如"刚刚 · 台北"、点赞数 likes、可选博主回复 authorReply）。',
          `严格只返回 JSON：{"posts":[{"title":"...","hotComment":"...","likes":"..."}],"comments":[{"nickname":"...","text":"...","timeLoc":"...","likes":"...","authorReply":"..."}]}，其中 posts 长度必须为 ${targets.length}。`
        ];

        const parts = [{ text: promptLines.join('\n') }];
        for (let i = 0; i < targets.length; i++) {
          const post = targets[i];
          const entry = mediaRegistry && mediaRegistry.profCardMedia && mediaRegistry.profCardMedia[post.id];
          let el = entry && entry.el;
          if (!el && post.coverCategory && global.LayaDefaults && typeof global.LayaDefaults.getAvatarFromLibrary === 'function') {
            el = global.LayaDefaults.getAvatarFromLibrary(post.coverCategory, post.coverIndex || 0);
          }
          const frame = await captureMediaFrameSmart(el);
          parts.push({
            text: `第 ${i + 1} 个作品（类型：${post.mediaType === 'video' ? '视频' : '图片'}，原文件名：${post.mediaName || '无'}，现有提示：${post.title || '无'}）：`
          });
          if (frame) {
            parts.push({ inlineData: frame });
          }
        }

        const resp = await callGeminiRequest(state.aiConfig, parts, {
          generationConfig: { responseMimeType: 'application/json', temperature: 0.9, maxOutputTokens: 2048 }
        });
        const parsed = extractJsonFromGeminiResponse(resp);
        const postResults = Array.isArray(parsed.posts) ? parsed.posts : [];
        const cmtResults = Array.isArray(parsed.comments) ? parsed.comments : [];
        return {
          posts: targets.map((p, i) => {
            const src = postResults[i % Math.max(1, postResults.length)] || {};
            return {
              id: p.id,
              title: String(src.title || p.title || '今天的状态超在线 ✨'),
              hotComment: String(src.hotComment || p.hotComment || '💬 这氛围感直接拉满了！'),
              likes: String(src.likes || p.likes || Math.floor(Math.random() * 900 + 80))
            };
          }),
          comments: cmtResults.map((c, idx) => {
            const av = pickRandomAvatarFromLibrary(idx % 4 === 0 ? 'female' : 'male');
            return {
              id: `c_${Date.now()}_${idx}`,
              nickname: String(c.nickname || '阿凯 · 台北'),
              avatarCategory: av.category,
              avatarIndex: av.index,
              text: String(c.text || '这个视频/照片质感太绝了，求多发！'),
              timeLoc: String(c.timeLoc || '刚刚 · 新加坡'),
              likes: String(c.likes || Math.floor(Math.random() * 120 + 18)),
              authorReply: String(c.authorReply || '')
            };
          }),
          usedRemoteAI: true
        };
      } catch (_) {}
    }

    // 本地智能文案生成兜底（结合文件名、媒体类型、博主风格生成匹配标题与评论）
    const conv = (s) =>
      isTrad && global.LayaPosterLang ? global.LayaPosterLang.convertString(s, true) : s;

    const videoTitles = [
      '把今天最治愈的一段画面留在这里 ✨',
      '原声直出｜这氛围感是不是有点上头🎧',
      '夜晚出门透透气，顺便记录下这一刻🌙',
      '谁懂啊！这段现场真的看一遍心动一遍🔥',
      '随手拍的动态碎片，今晚语音房见呀💜'
    ];
    const imageTitles = [
      '今日份碎片已送达，猜猜这是在哪拍的📸',
      '光影刚刚好的瞬间，必须发出来纪念一下✨',
      '终于有空整理相册，这张真的超喜欢！',
      '状态在线的一天，评论区报个到吧👇',
      '把喜欢的风景与声音一起收藏进主页💜'
    ];
    const hotTemplates = [
      '💬 网友热评：这画面质感绝了，原声也太好听了吧！',
      '💬 网友热评：一眼心动系列，今晚还开语音房吗？',
      '💬 网友热评：构图跟气质都满分，已经点赞收藏了～',
      '💬 网友热评：刚刷到就停不下来，求个同款机位！'
    ];

    const outPosts = targets.map((p, i) => {
      const cleanName = String(p.mediaName || '')
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      const isGenericName = /^(IMG|VID|Screenshot|screen|clip|video|image|微信|QQ|\d{4,})/i.test(cleanName);
      const pool = p.mediaType === 'video' ? videoTitles : imageTitles;
      let nextTitle = pool[(i + Math.floor(Math.random() * pool.length)) % pool.length];
      if (cleanName && !isGenericName && cleanName.length >= 2 && cleanName.length <= 18) {
        nextTitle = `${cleanName} ｜ ${nextTitle}`;
      }
      return {
        id: p.id,
        title: conv(nextTitle),
        hotComment: conv(hotTemplates[(i + Math.floor(Math.random() * hotTemplates.length)) % hotTemplates.length]),
        likes: String(Math.floor(Math.random() * 880 + 65))
      };
    });

    const nickPool = ['Jason_温哥华', '阿泽在台北', 'Kevin_墨尔本', '林屿森Sean', 'Ethan_吉隆坡', '小鹿同学'];
    const cmtPool = [
      '刚看完你新发的这几个动态，画面跟声音反差感也太戳人了吧！',
      '每一张质感都像电影截图一样，已点赞关注，晚上语音房蹲一波～',
      '这生活状态真的让人羡慕，评论区举手求个回关！'
    ];
    const outComments = cmtPool.map((txt, idx) => {
      const av = pickRandomAvatarFromLibrary(idx === 2 ? 'female' : 'male');
      return {
        id: `c_${Date.now()}_${idx}`,
        nickname: conv(nickPool[(idx + Math.floor(Math.random() * 3)) % nickPool.length]),
        avatarCategory: av.category,
        avatarIndex: av.index,
        text: conv(txt),
        timeLoc: conv(idx === 0 ? '刚刚 · 台北' : idx === 1 ? '12分钟前 · 新加坡' : '38分钟前 · 吉隆坡'),
        likes: String(Math.floor(Math.random() * 90 + 25)),
        authorReply: idx === 0 ? conv('谢谢支持呀！今晚十点语音房不见不散💜') : ''
      };
    });

    return { posts: outPosts, comments: outComments, usedRemoteAI: false };
  }

  global.LayaProfileCenter = {
    PROF_W,
    computeProfileCanvasHeight,
    computeProfileLayout,
    renderProfileCenter,
    generateProfileBgWithAI,
    generateProfilePersonaWithAI,
    generateProfileFeedAndCommentsWithAI,
    pickRandomAvatarFromLibrary,
    resolveGeminiConfig,
    callGeminiRequest,
    extractJsonFromGeminiResponse
  };
})(window);
