/**
 * Laya App 商店截图生成器 - 1920×1080 全功能可隐藏/可移动/透明背景默认配置
 */
(function (global) {
  'use strict';

  const STAGE_WIDTH = 1920;
  const STAGE_HEIGHT = 1080;
  const PORTRAIT_STAGE_WIDTH = 1080;
  const PORTRAIT_STAGE_HEIGHT = 1920;

  const DEFAULT_CARD_1_TITLE = '';
  const DEFAULT_CARD_1_SUB = '';
  const DEFAULT_CARD_2_TITLE = '';
  const DEFAULT_CARD_2_SUB = '';

  const DEFAULT_PLAY_STATE = {
    appName: 'Laya – 世界另一端，也有等你上线的人',
    company: 'HK Sennar Trading Limited',
    installText: '安装',
    inAppText: '包含内购商品',
    rating: '4.8',
    reviews: '18万 条评价 ⓘ',
    appSize: '133 MB',
    ageBadge: 'M',
    ageText: '年满 17 周岁的成年'
  };

  function createDefaultProfileCenter() {
    return {
      viewportMode: 'long', // 'long' (1080×自适应长图瀑布流) | 'mobile' (1080×1920 竖屏)
      scrollY: 0,
      autoAiOnUpload: true,
      aiPersonaPrompt: '户外越野与深夜语音房反差感女孩，热爱运动、跑步分享与深夜聊天',
      aiBgPrompt: '暗夜紫粉柔光虚化人像夜景背景',
      aiGenderPref: 'female',
      header: {
        showStatusBar: true,
        time: '01:05',
        battery: 20,
        charging: false,
        networkType: '5G',
        signal1: 4,
        signal2: 3,
        wifi: true,
        dualSim: true,
        showLayaNotif: true,
        bgStyle: 'portrait-glow', // 'portrait-glow' | 'aurora-nebula' | 'cyber-neon' | 'vibe-photo' | 'custom'
        bgDim: 52,
        vibeIndex: 0,
        showBackBtn: true,
        showMoreBtn: true,
        showOnlineBadge: true,
        onlineBadgeText: '🟢 语音房在线中'
      },
      user: {
        avatarCategory: 'beauties',
        avatarIndex: 0,
        nickname: 'Selina（回关）',
        idPrefix: 'Laya号：',
        userId: 'XU38686149',
        showCopyIcon: true,
        ipText: 'IP：江苏',
        gender: 'female',
        age: '23岁',
        level: 'Lv.26',
        voiceTag: '🎧 户外元气甜妹音',
        extraBadges: []
      },
      stats: {
        items: [
          { id: 'following', num: '1068', label: '关注' },
          { id: 'fans', num: '4355', label: '粉丝' },
          { id: 'likes', num: '4.4万', label: '获赞与收藏' }
        ]
      },
      bio: {
        text: '🏔️ ITRA：619 💪\n2025 Salomon 柴古唐斯越野赛 🥇\n2026 西宏越野赛 56km 🏅\n📮：38686149@qq.com'
      },
      momentBar: {
        enabled: true,
        iconText: '◎ 瞬间',
        descText: '1 条瞬间 · 🎙️ 语音签名 12"'
      },
      actions: {
        followText: '关注',
        isFollowing: false,
        msgText: '发私信',
        showFriendBtn: true
      },
      contentTabs: {
        tabs: ['动态', '视频', '瞬间', '收藏'],
        activeIndex: 0,
        showSearchIcon: true
      },
      feedSettings: {
        showHotCommentOnCard: true,
        showAuthorOnCard: true,
        showTimeOnCard: true,
        syncAuthorFromProfile: true,
        cardRadius: 18,
        colGap: 14,
        rowGap: 16
      },
      posts: [
        {
          id: 'p_1',
          mediaType: 'default',
          coverCategory: 'beauties',
          coverIndex: 12,
          defaultVibeIndex: 2,
          aspectRatio: '3:4',
          pinBadge: '置顶',
          showPlayIcon: true,
          overlayTitle: '',
          watchedTag: '',
          title: 'Salomon 树山越野赛喜获第一☝️',
          hotComment: '💬 网友热评：姐这配速简直开挂了，膝盖还稳吗？',
          publishTime: '2025-12-28',
          likes: '269',
          customAuthor: '',
          mediaName: '内置高清封面 1'
        },
        {
          id: 'p_2',
          mediaType: 'default',
          coverCategory: 'beauties',
          coverIndex: 24,
          defaultVibeIndex: 5,
          aspectRatio: '4:5',
          pinBadge: '置顶',
          showPlayIcon: true,
          overlayTitle: '',
          watchedTag: '',
          title: '柴古唐斯我来啦！夜晚山风超治愈✨',
          hotComment: '💬 网友热评：5796 号选手冲线太帅了！语音房等复盘',
          publishTime: '2025-10-30',
          likes: '824',
          customAuthor: '',
          mediaName: '内置高清封面 2'
        },
        {
          id: 'p_3',
          mediaType: 'default',
          coverCategory: 'vibes',
          coverIndex: 9,
          defaultVibeIndex: 9,
          aspectRatio: '1:1',
          pinBadge: '',
          showPlayIcon: false,
          overlayTitle: '',
          watchedTag: '',
          title: '2026 太湖 100 · 吴越玄冬跑山赛装备清单',
          hotComment: '💬 网友热评：冲锋衣和越野背包求个链接同款～',
          publishTime: '昨天 14:25',
          likes: '71',
          customAuthor: '',
          mediaName: '内置氛围封面 3'
        },
        {
          id: 'p_4',
          mediaType: 'default',
          coverCategory: 'beauties',
          coverIndex: 38,
          defaultVibeIndex: 12,
          aspectRatio: '3:4',
          pinBadge: '',
          showPlayIcon: true,
          overlayTitle: '',
          watchedTag: '',
          title: '西宏越野赛完赛啦，每一步都不算白跑🎉',
          hotComment: '💬 网友热评：这身材管理绝了，下场一起组队跑呀',
          publishTime: '昨天 18:59',
          likes: '31',
          customAuthor: '',
          mediaName: '内置高清封面 4'
        },
        {
          id: 'p_5',
          mediaType: 'default',
          coverCategory: 'vibes',
          coverIndex: 15,
          defaultVibeIndex: 15,
          aspectRatio: '4:5',
          pinBadge: '',
          showPlayIcon: true,
          overlayTitle: '',
          watchedTag: '',
          title: '没有白爬的坡，每一步都算数 ✌️',
          hotComment: '💬 网友热评：听着你的语音电台夜跑太有动力了',
          publishTime: '2天前',
          likes: '84',
          customAuthor: '',
          mediaName: '内置氛围封面 5'
        },
        {
          id: 'p_6',
          mediaType: 'default',
          coverCategory: 'beauties',
          coverIndex: 51,
          defaultVibeIndex: 18,
          aspectRatio: '3:4',
          pinBadge: '',
          showPlayIcon: false,
          overlayTitle: '',
          watchedTag: '刚刚看过',
          title: '西宏越野赛｜秋日的山林与晚霞也太美了吧',
          hotComment: '💬 网友热评：构图满分！人比秋景还要温柔✨',
          publishTime: '3天前',
          likes: '43',
          customAuthor: '',
          mediaName: '内置高清封面 6'
        }
      ],
      commentSection: {
        enabled: true,
        headerTitle: '精选互动评论 (86)',
        inputPlaceholder: '喜欢她的动态就留下一句暖心评论吧…',
        replyPrefix: '作者回复：',
        items: [
          {
            id: 'c_1',
            nickname: '阿凯 · 台北信义',
            avatarCategory: 'guys',
            avatarIndex: 3,
            text: '昨晚在 Laya 语音房听你复盘越野赛，声音又飒又温柔，直接圈粉！',
            timeLoc: '刚刚 · 台北',
            likes: '128',
            authorReply: '哈哈谢谢阿凯！下次赛前再连麦聊装备～'
          },
          {
            id: 'c_2',
            nickname: 'Leon_吉隆坡夜跑',
            avatarCategory: 'guys',
            avatarIndex: 14,
            text: '56km 完赛真的太强了，这几张实拍光影质感直接拉满🔥',
            timeLoc: '18分钟前 · 马来西亚',
            likes: '64',
            authorReply: ''
          },
          {
            id: 'c_3',
            nickname: '林屿森Sean',
            avatarCategory: 'guys',
            avatarIndex: 27,
            text: '刚刚点开主页看瞬间语音条，反差感绝了，求回关一起组队跑步！',
            timeLoc: '1小时前 · 新加坡',
            likes: '39',
            authorReply: ''
          }
        ]
      },
      bottomNav: {
        enabled: true,
        activeIndex: 4,
        tabs: [
          { id: 'discover', label: '发现', assetActive: 'tab_1', assetInactive: 'tab_1-1' },
          { id: 'video', label: '视频', assetActive: 'tab_2', assetInactive: 'tab_2-2' },
          { id: 'party', label: '派对', assetActive: 'tab_3', assetInactive: 'tab_3-3' },
          { id: 'message', label: '消息', assetActive: 'tab_4', assetInactive: 'tab_4-4', badge: '99+' },
          { id: 'profile', label: '我的', assetActive: 'tab_5', assetInactive: 'tab_5-5' }
        ]
      }
    };
  }

  function createDefaultState() {
    return {
      // 当前工作台模式：'store'（商店截图生成器） | 'profile'（Laya 风格个人中心）
      activeWorkspace: 'store',

      // 画布文案语言状态：'zh-CN'（简体） | 'zh-TW'（繁体）
      posterLang: 'zh-CN',

      // 全局画布与背景模式：dark(深色) | transparent(透明外背景) | full-transparent(全透明无黑底) | light(浅色白底)
      layout: {
        canvasTheme: 'dark',
        enableAnim: true,
        globalFontScale: 100,
        bgColor: '#080611',
        borderColor: '#2a2342',
        cardRadius: 20,
        colGap: 44,
        outerPadX: 48,
        outerPadY: 24
      },

      // 三大步骤引导大标题
      steps: {
        step1: '1、点击链接谷歌商店安装 Laya',
        step2: '2、点击娱乐，再点击 🔍',
        step3: '3、搜索 3157',
        step3Prefix: '3、搜索 ',
        fontSize: 40,
        syncStep3WithId: true
      },

      // 可选顶部手机状态栏
      statusBar: {
        enabled: false,
        time: '11:39',
        battery: 70,
        charging: false,
        notifChat: true,
        notifSocial: true,
        notifNews: true,
        alarm: true,
        bluetooth: true,
        vpn: true,
        wifi: false,
        networkType: '5G',
        dualSim: true,
        signal1: 4,
        signal2: 3,
        paddingX: 28,
        height: 48
      },

      // 模块 1：左栏上方 Google Play 商店详情卡
      playEntry: {
        storeHeader: 'Google Play',
        showCloseBtn: true,
        appName: DEFAULT_PLAY_STATE.appName,
        company: DEFAULT_PLAY_STATE.company,
        installText: DEFAULT_PLAY_STATE.installText,
        inAppText: DEFAULT_PLAY_STATE.inAppText,
        rating: DEFAULT_PLAY_STATE.rating,
        reviews: DEFAULT_PLAY_STATE.reviews,
        appSize: DEFAULT_PLAY_STATE.appSize,
        ageBadge: DEFAULT_PLAY_STATE.ageBadge,
        ageText: DEFAULT_PLAY_STATE.ageText,
        showPreviewStrip: true,
        iconRadius: 26,
        paddingX: 34,
        paddingY: 20
      },

      // 模块 2：左栏下方 内容标签栏 + 底部导航 + 指引箭头
      navModule: {
        topTabs: ['关注', '全部', '推荐', '扩列'],
        activeTopIndex: 2,
        showTrophy: true,
        showSearchIcon: true,
        showGuideArrows: true,
        bottomTabs: [
          { id: 'discover', label: '发现', iconKey: 'bot_discover', customIconKey: null },
          { id: 'moment', label: '瞬间', iconKey: 'bot_moment', customIconKey: null },
          { id: 'fun', label: '娱乐', iconKey: 'bot_fun', customIconKey: null },
          { id: 'message', label: '消息', iconKey: 'bot_message', customIconKey: null },
          { id: 'profile', label: '我的', iconKey: 'bot_profile', customIconKey: null }
        ],
        activeBottomIndex: 2,
        paddingX: 38,
        paddingY: 20,
        rowGap: 24
      },

      // 模块 3：右栏上方 搜索框 + 丰富个人信息胶囊卡片（含年龄、地区、距离状态）
      userModule: {
        searchQuery: '3157',
        highlightSearch: true,
        searchCallout: '认准此号搜索',
        showCursor: true,
        showClearBtn: true,
        cancelText: '取消',
        sectionTitle: '用户',
        nickname: '清玥🍷',
        avatarCategory: 'beauties',
        avatarIndex: 9,
        gender: 'female',
        age: '22岁',
        level: 'Lv.22',
        region: '桃园县',
        distance: '1.2km · 当前在线',
        bioTag: '🎧 温柔甜妹音',
        userId: '3157',
        syncIdWithSearch: true,
        paddingX: 26,
        paddingY: 16,
        itemGap: 12
      },

      // 模块 4：右栏下方 双列视频卡片流（底部自动同步上方用户头像与昵称）
      feedModule: {
        paddingX: 0,
        paddingY: 0,
        cardGap: 16,
        mediaHeight: 530,
        footerHeight: 92,
        showFooterTitle: true,
        syncAuthorFromUser: true,
        titleFontSize: 38,
        subtitleFontSize: 24,
        cards: [
          {
            id: 'card_1',
            overlayTitle: DEFAULT_CARD_1_TITLE,
            overlaySubtitle: DEFAULT_CARD_1_SUB,
            footerTitle: '展示猪肝',
            likes: '2337',
            mediaType: 'default',
            defaultVariant: 'boy',
            mediaName: '原图封面（左）',
            showPlayBadge: true
          },
          {
            id: 'card_2',
            overlayTitle: DEFAULT_CARD_2_TITLE,
            overlaySubtitle: DEFAULT_CARD_2_SUB,
            footerTitle: '被束缚的爱',
            likes: '1437',
            mediaType: 'default',
            defaultVariant: 'girl',
            mediaName: '原图封面（右）',
            showPlayBadge: true
          }
        ]
      },

      // 个人中心工作台配置（风格长图瀑布流 / 9:16 竖屏）
      profileCenter: createDefaultProfileCenter(),

      // AI 配置（请在界面「高级 API 设置」中填入自己的密钥，会自动保存在本地浏览器，不会上传公开仓库）
      aiConfig: {
        apiKey: '',
        gasProxyUrl: '',
        topicPrompt: '年轻人语音交友、声音控吐槽、生活日常分享',
        targetCard: 'all',
        includeOverlayText: false
      },

      // 自由拖动偏移量：横版 offsets / 竖版 portraitOffsets 各自独立对齐，内容全同步
      offsets: {},
      portraitOffsets: {},

      // 全页面任意元素隐藏/删除状态表 { [key]: labelString }
      hiddenElements: {},

      // 全页面任意文字独立字号表 { [key]: numberPx }
      fontSizes: {},

      // 自由添加的自定义画布元素（默认包含图3指向「安装」按钮的金色箭头，全可拖动/删除/修改）
      customElements: [
        {
          id: 'ce_default_install_arrow',
          workspace: 'store',
          type: 'arrow',
          text: '',
          x: 716,
          y: 286,
          px: 814,
          py: 249,
          scale: 0.74,
          rotation: -35,
          color: '#facc15',
          bgStyle: 'purple',
          shape: 'round',
          w: 160,
          h: 64
        }
      ]
    };
  }

  const _libraryImgCache = new Map();

  function getLibraryImage(src) {
    if (!src || typeof src !== 'string') return null;
    if (_libraryImgCache.has(src)) {
      return _libraryImgCache.get(src);
    }
    const img = new Image();
    img.src = src;
    _libraryImgCache.set(src, img);
    return img;
  }

  function getAvatarFromLibrary(category, index) {
    const db = global.LAYA_ASIAN_AVATARS || {};
    const order = ['beauties', 'guys', 'vibes', 'pets', 'anime', 'cartoons', 'memes'];
    let list = Array.isArray(db[category]) && db[category].length ? db[category] : null;
    if (!list) {
      for (let i = 0; i < order.length; i++) {
        if (Array.isArray(db[order[i]]) && db[order[i]].length) {
          list = db[order[i]];
          break;
        }
      }
    }
    if (!list || !list.length) return null;
    const safeIdx = ((Number(index) || 0) % list.length + list.length) % list.length;
    return getLibraryImage(list[safeIdx]);
  }

  function createRawImageMap(onReady) {
    const rawData = global.LayaRawAssets || {};
    const appAssets = global.LAYA_APP_ASSETS || {};
    const brandLogos = global.LAYA_BRAND_LOGOS || {};
    const map = {};

    const entries = [];
    Object.keys(rawData).forEach((k) => entries.push([k, rawData[k]]));
    Object.keys(appAssets).forEach((k) => entries.push([`app_${k}`, appAssets[k]]));
    if (brandLogos['Laya.png']) entries.push(['brand_laya', brandLogos['Laya.png']]);
    if (brandLogos['Laya2.png']) entries.push(['brand_laya2', brandLogos['Laya2.png']]);

    let remaining = entries.length;

    if (remaining === 0 && onReady) {
      onReady(map);
      return map;
    }

    entries.forEach(([k, src]) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        remaining -= 1;
        if (remaining <= 0 && onReady) onReady(map);
      };
      img.src = src;
      map[k] = img;
    });

    return map;
  }

  function isCardUneditedDefault() {
    // 卡片画面默认不附带预置花字与字幕（始终保持干净背景，由底部标题展示）
    return false;
  }

  /**
   * 随机生成丰富真实的个人信息（年龄、等级、地区城市、距离在线状态、声音标签）
   */
  function randomizeUserProfile(currentUser) {
    const regions = [
      '台湾 · 台北市',
      '台北 · 信义区',
      '台北 · 大安区',
      '桃园县',
      '新北 · 板桥区',
      '台中 · 西屯区',
      '高雄 · 左营区',
      '台南 · 安平区',
      '新加坡 · 乌节路',
      '新加坡 · 滨海湾',
      '新加坡 · 裕廊东',
      '香港 · 尖沙咀',
      '香港 · 铜锣湾',
      '香港 · 旺角',
      '香港 · 中环',
      '澳门 · 氹仔',
      '澳门 · 新口岸',
      '澳门 · 大三巴',
      '马来西亚 · 吉隆坡',
      '吉隆坡 · 武吉免登',
      '马来西亚 · 槟城',
      '马来西亚 · 新山',
      '马来西亚 · 马六甲'
    ];
    const statuses = [
      '当前在线',
      '刚刚活跃',
      '语音房连麦中',
      '深夜电台在线',
      '正在找人聊天'
    ];
    const bios = [
      '🎧 温柔甜妹音',
      '✨ 清冷御姐音',
      '🌙 深夜哄睡电台',
      '🐾 声控福利秒回',
      '🎤 唱歌超好听',
      '💜 扩列滴滴秒回'
    ];
    const ageNum = Math.floor(Math.random() * 8) + 19; // 19 ~ 26岁
    const lvNum = Math.floor(Math.random() * 35) + 12; // Lv.12 ~ Lv.46
    const distKm = (Math.random() * 4.2 + 0.3).toFixed(1);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    return Object.assign({}, currentUser, {
      age: `${ageNum}岁`,
      level: `Lv.${lvNum}`,
      region: pick(regions),
      distance: `${distKm}km · ${pick(statuses)}`,
      bioTag: pick(bios)
    });
  }

  function randomizeStatusBar(currentStatusBar) {
    const hours = String(Math.floor(Math.random() * 15) + 8).padStart(2, '0');
    const mins = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    const networks = ['5G', '5G', '5G', '4G'];
    const useWifi = Math.random() < 0.35;

    return Object.assign({}, currentStatusBar, {
      enabled: true,
      time: `${hours}:${mins}`,
      battery: Math.floor(Math.random() * 74) + 24,
      charging: Math.random() < 0.22,
      notifChat: Math.random() < 0.75,
      notifSocial: Math.random() < 0.65,
      notifNews: Math.random() < 0.55,
      alarm: Math.random() < 0.7,
      bluetooth: Math.random() < 0.65,
      vpn: Math.random() < 0.75,
      wifi: useWifi,
      networkType: networks[Math.floor(Math.random() * networks.length)],
      dualSim: Math.random() < 0.8,
      signal1: Math.floor(Math.random() * 2) + 3,
      signal2: Math.floor(Math.random() * 3) + 2
    });
  }

  /**
   * 获取指定文字元素的默认基础字号与区间元数据（同时支持固定文字项、导航项与动态视频卡片文字项）
   */
  const STATIC_TEXT_META = {
    step_title_1: { label: '步骤 1 标题', group: '① 步骤与状态栏', min: 22, max: 72, getDef: (s) => Number(s.steps && s.steps.fontSize) || 40 },
    step_title_2: { label: '步骤 2 标题', group: '① 步骤与状态栏', min: 22, max: 72, getDef: (s) => Number(s.steps && s.steps.fontSize) || 40 },
    step_title_3: { label: '步骤 3 标题', group: '① 步骤与状态栏', min: 22, max: 72, getDef: (s) => Number(s.steps && s.steps.fontSize) || 40 },
    sb_time: { label: '状态栏时间', group: '① 步骤与状态栏', min: 14, max: 38, getDef: () => 22 },
    play_header: { label: 'Google Play 顶栏标题', group: '② 商店应用卡', min: 18, max: 52, getDef: () => 30 },
    play_title: { label: '商店应用名称', group: '② 商店应用卡', min: 16, max: 48, getDef: () => 28 },
    play_meta: { label: '商店公司名称', group: '② 商店应用卡', min: 14, max: 40, getDef: () => 22 },
    play_install: { label: '安装按钮文字', group: '② 商店应用卡', min: 16, max: 44, getDef: () => 26 },
    play_inapp: { label: '包含内购小字', group: '② 商店应用卡', min: 11, max: 30, getDef: () => 16 },
    play_stats: { label: '评分/大小/分级说明文字', group: '② 商店应用卡', min: 12, max: 34, getDef: () => 19 },
    play_stats_num: { label: '评分大数字（4.8）', group: '② 商店应用卡', min: 16, max: 44, getDef: () => 26 },
    user_search_box: { label: '搜索框输入文字', group: '④ 搜索与个人卡', min: 18, max: 52, getDef: () => 30 },
    user_search_callout: { label: '搜索重点提示词', group: '④ 搜索与个人卡', min: 13, max: 32, getDef: () => 18 },
    user_cancel_btn: { label: '搜索框右侧「取消」', group: '④ 搜索与个人卡', min: 16, max: 46, getDef: () => 27 },
    user_section_label: { label: '「用户」分组小标题', group: '④ 搜索与个人卡', min: 14, max: 42, getDef: () => 23 },
    user_nickname: { label: '个人卡片用户昵称', group: '④ 搜索与个人卡', min: 18, max: 50, getDef: () => 29 },
    user_age_badge: { label: '年龄性别徽章文字', group: '④ 搜索与个人卡', min: 12, max: 32, getDef: () => 17 },
    user_level_badge: { label: '等级徽章文字', group: '④ 搜索与个人卡', min: 12, max: 32, getDef: () => 17 },
    user_bio_tag: { label: '声音个性标签文字', group: '④ 搜索与个人卡', min: 12, max: 32, getDef: () => 17 },
    user_id_row: { label: '个人卡片 ID 文字', group: '④ 搜索与个人卡', min: 14, max: 40, getDef: () => 22 },
    user_region: { label: '地区位置标签文字', group: '④ 搜索与个人卡', min: 12, max: 32, getDef: () => 17 },
    user_distance: { label: '距离与在线状态文字', group: '④ 搜索与个人卡', min: 12, max: 32, getDef: () => 17 }
  };

  const PROFILE_STATIC_TEXT_META = {
    prof_sb_time: { label: '顶部状态栏时间', group: '① 背景与顶栏', min: 16, max: 40, getDef: () => 24 },
    prof_online_badge: { label: '顶部在线状态胶囊', group: '① 背景与顶栏', min: 14, max: 34, getDef: () => 19 },
    prof_nickname: { label: '个人主页昵称', group: '② 头像与身份资料', min: 24, max: 64, getDef: () => 40 },
    prof_id_row: { label: 'Laya号 / 账号栏', group: '② 头像与身份资料', min: 14, max: 38, getDef: () => 22 },
    prof_ip_text: { label: 'IP 属地文字', group: '② 头像与身份资料', min: 14, max: 36, getDef: () => 20 },
    prof_age_badge: { label: '年龄性别徽章', group: '② 头像与身份资料', min: 13, max: 34, getDef: () => 18 },
    prof_level_badge: { label: '等级徽章', group: '② 头像与身份资料', min: 13, max: 34, getDef: () => 18 },
    prof_voice_tag: { label: '声音个性标签', group: '② 头像与身份资料', min: 13, max: 34, getDef: () => 18 },
    prof_bio_text: { label: '多行个性签名简介', group: '③ 数据与个性简介', min: 16, max: 42, getDef: () => 25 },
    prof_moment_icon: { label: '瞬间栏左侧文字', group: '③ 数据与个性简介', min: 14, max: 36, getDef: () => 22 },
    prof_moment_desc: { label: '瞬间栏右侧说明', group: '③ 数据与个性简介', min: 14, max: 34, getDef: () => 21 },
    prof_btn_follow: { label: '主按钮（关注）', group: '③ 数据与个性简介', min: 16, max: 42, getDef: () => 26 },
    prof_btn_msg: { label: '次按钮（发私信）', group: '③ 数据与个性简介', min: 16, max: 42, getDef: () => 26 },
    prof_comments_header: { label: '底部评论区标题', group: '⑤ 评论与底部导航', min: 16, max: 42, getDef: () => 26 },
    prof_comments_placeholder: { label: '评论输入框提示词', group: '⑤ 评论与底部导航', min: 14, max: 34, getDef: () => 21 }
  };

  function getTextElementMeta(state, key) {
    if (!key) return null;
    if (STATIC_TEXT_META[key]) {
      const m = STATIC_TEXT_META[key];
      return {
        key,
        label: m.label,
        group: m.group,
        min: m.min,
        max: m.max,
        defaultSize: m.getDef(state || {})
      };
    }
    if (PROFILE_STATIC_TEXT_META[key]) {
      const m = PROFILE_STATIC_TEXT_META[key];
      return {
        key,
        label: m.label,
        group: m.group,
        min: m.min,
        max: m.max,
        defaultSize: m.getDef(state || {})
      };
    }
    if (key.startsWith('prof_stat_num_')) {
      const idx = Number(key.slice('prof_stat_num_'.length));
      const item = state && state.profileCenter && state.profileCenter.stats && state.profileCenter.stats.items && state.profileCenter.stats.items[idx];
      return {
        key,
        label: `统计数字「${(item && item.label) || idx + 1}」`,
        group: '③ 数据与个性简介',
        min: 18,
        max: 52,
        defaultSize: 32
      };
    }
    if (key.startsWith('prof_stat_lbl_')) {
      const idx = Number(key.slice('prof_stat_lbl_'.length));
      const item = state && state.profileCenter && state.profileCenter.stats && state.profileCenter.stats.items && state.profileCenter.stats.items[idx];
      return {
        key,
        label: `统计标签「${(item && item.label) || idx + 1}」`,
        group: '③ 数据与个性简介',
        min: 13,
        max: 34,
        defaultSize: 20
      };
    }
    if (key.startsWith('prof_tab_')) {
      const idx = Number(key.slice('prof_tab_'.length));
      const tabs = (state && state.profileCenter && state.profileCenter.contentTabs && state.profileCenter.contentTabs.tabs) || [];
      return {
        key,
        label: `分区标签「${tabs[idx] || idx + 1}」`,
        group: '④ 内容分区与卡片',
        min: 16,
        max: 44,
        defaultSize: 26
      };
    }
    if (key.startsWith('prof_bot_nav_')) {
      const idx = Number(key.slice('prof_bot_nav_'.length));
      const tabs = (state && state.profileCenter && state.profileCenter.bottomNav && state.profileCenter.bottomNav.tabs) || [];
      return {
        key,
        label: `底部导航「${(tabs[idx] && tabs[idx].label) || idx + 1}」`,
        group: '⑤ 评论与底部导航',
        min: 12,
        max: 34,
        defaultSize: 19
      };
    }
    if (key.startsWith('prof_extra_badge_')) {
      const bId = key.slice('prof_extra_badge_'.length);
      const list = (state && state.profileCenter && state.profileCenter.user && state.profileCenter.user.extraBadges) || [];
      const bItem = list.find((b) => b && b.id === bId);
      return {
        key,
        label: `个性徽章「${(bItem && bItem.text) || bId}」`,
        group: '② 个人身份与资料',
        min: 12,
        max: 32,
        defaultSize: 18
      };
    }
    if (key.startsWith('custom_el_')) {
      const elId = key.slice('custom_el_'.length);
      const list = (state && state.customElements) || [];
      const el = list.find((it) => it && it.id === elId);
      if (el && el.type === 'image') return null;
      const typeNames = { text: '自由文字', badge: '胶囊标签', arrow: '指引箭头', box: '高亮框' };
      const labelPrefix = el ? typeNames[el.type] || '自定义元素' : '自定义元素';
      const shortTxt = el && el.text ? `「${String(el.text).replace(/\n+/g, ' ').slice(0, 12)}」` : '';
      return {
        key,
        label: `${labelPrefix}${shortTxt}`,
        group: '✨ 自由添加元素',
        min: 12,
        max: 110,
        defaultSize: el && el.type === 'text' ? 38 : 24
      };
    }
    if (key.startsWith('prof_bot_badge_')) {
      const idx = Number(key.slice('prof_bot_badge_'.length));
      const tabs = (state && state.profileCenter && state.profileCenter.bottomNav && state.profileCenter.bottomNav.tabs) || [];
      return {
        key,
        label: `导航角标「${(tabs[idx] && tabs[idx].label) || idx + 1}」`,
        group: '⑤ 评论与底部导航',
        min: 10,
        max: 24,
        defaultSize: 12
      };
    }
    const profPostMatch = key.match(/^prof_post_(pin|overlay|watched|title|hotcmt|author|time|likes)_(.+)$/);
    if (profPostMatch) {
      const kind = profPostMatch[1];
      const postId = profPostMatch[2];
      const posts = (state && state.profileCenter && state.profileCenter.posts) || [];
      const idx = posts.findIndex((p) => p.id === postId);
      const tag = idx >= 0 ? `作品 ${idx + 1}` : '作品';
      const map = {
        pin: { label: `${tag} 置顶角标`, min: 12, max: 30, def: 17 },
        overlay: { label: `${tag} 画面花字`, min: 16, max: 56, def: 30 },
        watched: { label: `${tag} 状态角标`, min: 12, max: 32, def: 18 },
        title: { label: `${tag} 标题文案`, min: 15, max: 40, def: 24 },
        hotcmt: { label: `${tag} 热评摘要`, min: 13, max: 32, def: 18 },
        author: { label: `${tag} 作者昵称`, min: 12, max: 30, def: 18 },
        time: { label: `${tag} 发布时间`, min: 12, max: 28, def: 17 },
        likes: { label: `${tag} 点赞数字`, min: 12, max: 30, def: 18 }
      };
      const cfg = map[kind];
      return {
        key,
        label: cfg.label,
        group: '④ 内容分区与卡片',
        min: cfg.min,
        max: cfg.max,
        defaultSize: cfg.def
      };
    }
    const profCmtMatch = key.match(/^prof_cmt_(nick|text|reply|meta|likes)_(.+)$/);
    if (profCmtMatch) {
      const kind = profCmtMatch[1];
      const cmtId = profCmtMatch[2];
      const items = (state && state.profileCenter && state.profileCenter.commentSection && state.profileCenter.commentSection.items) || [];
      const idx = items.findIndex((c) => c.id === cmtId);
      const tag = idx >= 0 ? `评论 ${idx + 1}` : '评论';
      const map = {
        nick: { label: `${tag} 评论者昵称`, min: 14, max: 34, def: 21 },
        text: { label: `${tag} 评论正文`, min: 15, max: 38, def: 23 },
        reply: { label: `${tag} 作者回复`, min: 14, max: 34, def: 21 },
        meta: { label: `${tag} 时间属地`, min: 12, max: 28, def: 17 },
        likes: { label: `${tag} 点赞数`, min: 12, max: 30, def: 18 }
      };
      const cfg = map[kind];
      return {
        key,
        label: cfg.label,
        group: '⑤ 评论与底部导航',
        min: cfg.min,
        max: cfg.max,
        defaultSize: cfg.def
      };
    }
    if (key.startsWith('top_tab_')) {
      const idx = Number(key.slice('top_tab_'.length));
      const isAct = state && state.navModule && Number(state.navModule.activeTopIndex) === idx;
      const tabName = (state && state.navModule && state.navModule.topTabs && state.navModule.topTabs[idx]) || `标签 ${idx + 1}`;
      return {
        key,
        label: `顶部标签「${tabName}」`,
        group: '③ 标签与底部导航',
        min: 18,
        max: 64,
        defaultSize: isAct ? 40 : 33
      };
    }
    if (key.startsWith('bot_nav_')) {
      const idx = Number(key.slice('bot_nav_'.length));
      const navItem = state && state.navModule && state.navModule.bottomTabs && state.navModule.bottomTabs[idx];
      return {
        key,
        label: `底部导航「${(navItem && navItem.label) || idx + 1}」`,
        group: '③ 标签与底部导航',
        min: 13,
        max: 38,
        defaultSize: 22
      };
    }
    const cardMatch = key.match(/^card_(title|sub|ft|likes|author)_(.+)$/);
    if (cardMatch) {
      const kind = cardMatch[1];
      const cardId = cardMatch[2];
      const cards = (state && state.feedModule && state.feedModule.cards) || [];
      const idx = cards.findIndex((c) => c.id === cardId);
      const tag = idx >= 0 ? `卡片 ${idx + 1}` : '卡片';
      if (kind === 'title') {
        return {
          key,
          label: `${tag} 画面大标题`,
          group: '⑤ 视频卡片流',
          min: 18,
          max: 72,
          defaultSize: Number(state && state.feedModule && state.feedModule.titleFontSize) || 38
        };
      }
      if (kind === 'sub') {
        return {
          key,
          label: `${tag} 画面下方字幕`,
          group: '⑤ 视频卡片流',
          min: 14,
          max: 48,
          defaultSize: Number(state && state.feedModule && state.feedModule.subtitleFontSize) || 24
        };
      }
      if (kind === 'ft') {
        return {
          key,
          label: `${tag} 底栏标题摘要`,
          group: '⑤ 视频卡片流',
          min: 13,
          max: 38,
          defaultSize: 20
        };
      }
      if (kind === 'author') {
        return {
          key,
          label: `${tag} 同步作者昵称`,
          group: '⑤ 视频卡片流',
          min: 12,
          max: 34,
          defaultSize: 18
        };
      }
      if (kind === 'likes') {
        return {
          key,
          label: `${tag} 点赞数字`,
          group: '⑤ 视频卡片流',
          min: 12,
          max: 34,
          defaultSize: 18
        };
      }
    }
    return null;
  }

  function getBaseFontSize(state, key, fallbackPx) {
    if (state && state.fontSizes && Number(state.fontSizes[key]) > 0) {
      return Number(state.fontSizes[key]);
    }
    const meta = getTextElementMeta(state, key);
    if (meta) return meta.defaultSize;
    return Number(fallbackPx) || 20;
  }

  function getEffectiveFontSize(state, key, fallbackPx) {
    const base = getBaseFontSize(state, key, fallbackPx);
    const scale = (Number(state && state.layout && state.layout.globalFontScale) || 100) / 100;
    return Math.max(9, Math.round(base * scale * 10) / 10);
  }

  function listAllTextItems(state) {
    const items = [];
    if (state && state.activeWorkspace === 'profile') {
      Object.keys(PROFILE_STATIC_TEXT_META).forEach((k) => {
        items.push(getTextElementMeta(state, k));
      });
      const pc = state.profileCenter || {};
      const statsItems = (pc.stats && pc.stats.items) || [];
      statsItems.forEach((_, idx) => {
        items.push(getTextElementMeta(state, `prof_stat_num_${idx}`));
        items.push(getTextElementMeta(state, `prof_stat_lbl_${idx}`));
      });
      const cTabs = (pc.contentTabs && pc.contentTabs.tabs) || [];
      cTabs.forEach((_, idx) => items.push(getTextElementMeta(state, `prof_tab_${idx}`)));
      const posts = pc.posts || [];
      posts.forEach((p) => {
        ['title', 'hotcmt', 'pin', 'overlay', 'watched', 'author', 'time', 'likes'].forEach((kind) => {
          items.push(getTextElementMeta(state, `prof_post_${kind}_${p.id}`));
        });
      });
      const cmts = (pc.commentSection && pc.commentSection.items) || [];
      cmts.forEach((c) => {
        ['nick', 'text', 'reply', 'meta', 'likes'].forEach((kind) => {
          items.push(getTextElementMeta(state, `prof_cmt_${kind}_${c.id}`));
        });
      });
      const bTabs = (pc.bottomNav && pc.bottomNav.tabs) || [];
      bTabs.forEach((_, idx) => items.push(getTextElementMeta(state, `prof_bot_nav_${idx}`)));
      const extraBadges = (pc.user && pc.user.extraBadges) || [];
      extraBadges.forEach((b) => items.push(getTextElementMeta(state, `prof_extra_badge_${b.id}`)));
      const customElsProf = (state && state.customElements) || [];
      customElsProf
        .filter((el) => (el.workspace || 'store') === 'profile' && el.type !== 'image')
        .forEach((el) => items.push(getTextElementMeta(state, `custom_el_${el.id}`)));
      return items.filter(Boolean);
    }

    Object.keys(STATIC_TEXT_META).forEach((k) => {
      items.push(getTextElementMeta(state, k));
    });
    const topTabs = (state && state.navModule && state.navModule.topTabs) || [];
    topTabs.forEach((_, idx) => items.push(getTextElementMeta(state, `top_tab_${idx}`)));
    const botTabs = (state && state.navModule && state.navModule.bottomTabs) || [];
    botTabs.forEach((_, idx) => items.push(getTextElementMeta(state, `bot_nav_${idx}`)));
    const cards = (state && state.feedModule && state.feedModule.cards) || [];
    cards.forEach((c) => {
      ['title', 'sub', 'ft', 'author', 'likes'].forEach((kind) => {
        items.push(getTextElementMeta(state, `card_${kind}_${c.id}`));
      });
    });
    const customElsStore = (state && state.customElements) || [];
    customElsStore
      .filter((el) => (el.workspace || 'store') === 'store' && el.type !== 'image')
      .forEach((el) => items.push(getTextElementMeta(state, `custom_el_${el.id}`)));
    return items.filter(Boolean);
  }

  function pickRandomDistinct(pool, curVal) {
    if (!Array.isArray(pool) || !pool.length) return '';
    const filtered = pool.filter((item) => String(item) !== String(curVal || ''));
    const list = filtered.length ? filtered : pool;
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * 为编辑栏任意字段的「🎲 筛子随机」按钮生成贴合语境的高质量随机内容
   */
  function rollRandomFieldValue(fieldKey, currentVal, state) {
    const k = String(fieldKey || '').trim();
    const isTrad = Boolean(state && state.posterLang === 'zh-TW');
    const conv = (s) =>
      isTrad && global.LayaPosterLang && typeof global.LayaPosterLang.convertString === 'function'
        ? global.LayaPosterLang.convertString(s, true)
        : s;

    const pools = {
      searchId: ['3157', '5209', '6812', '9527', '7391', '2048', '8866', '6182189', '10492', '4748'],
      searchCallout: ['认准此号搜索', '输入此 ID 查找', '重点搜索此号', '搜索房号直达', '点此输入号码'],
      step1: [
        '1、点击链接谷歌商店安装 Laya',
        '1、打开应用商店搜索下载体验',
        '1、点击下方链接前往商店获取 App',
        '1、在 Google Play 一键安装客户端'
      ],
      step2: [
        '2、点击娱乐，再点击 🔍',
        '2、切换到发现页，点击右上 🔍',
        '2、进入推荐频道，点击顶部搜索',
        '2、打开语聊大厅，点击放大镜 🔍'
      ],
      step3Prefix: ['3、搜索 ', '3、输入房号 ', '3、查找 ID ', '3、搜索用户 '],
      time: () => {
        const hh = String(Math.floor(Math.random() * 16) + 8).padStart(2, '0');
        const mm = String(Math.floor(Math.random() * 60)).padStart(2, '0');
        return `${hh}:${mm}`;
      },
      battery: () => Math.floor(Math.random() * 76) + 22,
      storeHeader: ['Google Play', 'App Store', '应用商店', '精选应用'],
      appName: [
        'Laya – 世界另一端，也有等你上线的人',
        'Laya – 深夜语音连麦交友社区',
        '声音派对 – 发现身边同频好声音',
        '微光社交 – 即刻开启高颜值语聊'
      ],
      company: ['HK Sennar Trading Limited', 'Starlight Interactive Ltd.', 'CloudWave Studio', 'Aurora Social Lab'],
      installText: ['安装', '获取', '打开', '免费下载'],
      inAppText: ['包含内购商品', '免费下载 · 含精选装扮', '官方正版认证', '无广告纯净版'],
      rating: ['4.8', '4.9', '4.7', '5.0', '4.6'],
      reviews: ['18万 条评价 ⓘ', '26万 条好评 ⓘ', '9.4万 条评价 ⓘ', '32万+ 下载口碑 ⓘ'],
      appSize: ['133 MB', '98 MB', '116 MB', '142 MB', '86 MB'],
      ageBadge: ['M', '17+', '12+', 'E'],
      ageText: ['年满 17 周岁的成年', '建议 18 岁以上交友使用', '青少年模式守护中', '实名认证社交社区'],
      cancelText: ['取消', '返回', '关闭'],
      sectionTitle: ['用户', '搜索结果', '推荐好友', '同城在线'],
      nickname: [
        '清玥🍷',
        '微醺小鹿🦌',
        '晚风甜妹',
        '小猫/花泽类',
        '苏苏不熬夜✨',
        '奶糖味的猫',
        '桃桃汽水🍑',
        '星野奈奈',
        '阿泽在台北',
        '林屿森Sean',
        '白茶清欢',
        '月下小狐狸🌙',
        '汐汐想听歌',
        '新加坡Jay'
      ],
      age: ['19岁', '20岁', '21岁', '22岁', '23岁', '24岁', '25岁', '26岁'],
      level: ['Lv.18', 'Lv.20', 'Lv.22', 'Lv.26', 'Lv.29', 'Lv.33', 'Lv.38', 'Lv.42'],
      region: [
        '桃园县',
        '台湾 · 台北市',
        '台北 · 信义区',
        '台北 · 大安区',
        '新北 · 板桥区',
        '台中 · 西屯区',
        '高雄 · 左营区',
        '台南 · 安平区',
        '新竹市 · 东区',
        '新加坡 · 乌节路',
        '新加坡 · 滨海湾',
        '新加坡 · 裕廊东',
        '香港 · 尖沙咀',
        '香港 · 铜锣湾',
        '香港 · 旺角',
        '香港 · 中环',
        '澳门 · 氹仔',
        '澳门 · 新口岸',
        '澳门 · 路环',
        '马来西亚 · 吉隆坡',
        '吉隆坡 · 武吉免登',
        '马来西亚 · 槟城',
        '马来西亚 · 新山',
        '马来西亚 · 马六甲'
      ],
      ipText: [
        'IP：台湾',
        'IP：台湾 · 台北',
        'IP：台湾 · 桃园',
        'IP：台湾 · 台中',
        'IP：台湾 · 高雄',
        'IP：新加坡',
        'IP：香港',
        'IP：香港 · 九龙',
        'IP：澳门',
        'IP：澳门 · 氹仔',
        'IP：马来西亚',
        'IP：马来西亚 · 吉隆坡',
        'IP：马来西亚 · 槟城',
        'IP：马来西亚 · 新山'
      ],
      distance: [
        '1.2km · 当前在线',
        '0.4km · 当前在线',
        '800m · 语音房在线',
        '2.5km · 刚刚活跃',
        '0.9km · 深夜连麦中',
        '1.8km · 正在听歌',
        '500m · 当前在线',
        '3.1km · 5分钟前在线'
      ],
      voiceTag: [
        '🎧 温柔甜妹音',
        '🎙️ 磁性低音炮',
        '🌙 深夜电台治愈音',
        '✨ 元气少女御姐音',
        '🎶 质感清冷学姐音',
        '☕ 懒散少年青叔音',
        '💜 哄睡ASMR声线'
      ],
      idPrefix: ['Laya号：', '账号 ID：', 'UID：', '房号：'],
      onlineBadgeText: ['🟢 语音房在线中', '🎙️ 深夜连麦中', '🎧 正在听歌', '✨ 同城热聊中', '🔥 直播互动中'],
      bio: [
        '🏔️ 热爱生活与夜间电台 💪\n每晚 22:00 语音房准时等你\n📮：欢迎留言互动与点歌 🎶',
        '✨ 声控聚集地｜主接连麦聊天\n日常分享美食、穿搭与城市夜景 🌙\n评论区留言抽粉丝连麦呀 💜',
        '🎧 音色微甜｜慢热但超能聊\n坐标亚太时区，周末喜欢逛展跑步\n戳右上角头像记得回关哦 👋'
      ],
      momentIcon: ['◎ 瞬间', '🎙️ 语音瞬间', '✨ 今日动态', '🌙 夜聊瞬间'],
      momentDesc: [
        '1 条瞬间 · 🎙️ 语音签名 12"',
        '3 条瞬间 · 🎵 刚刚唱完一首歌',
        '2 条语音 · 🎧 点击收听自我介绍',
        '今日最新动态 · 18 人赞过'
      ],
      followText: ['关注', '+ 关注', '回关', '追随'],
      msgText: ['发私信', '私聊TA', '打招呼', '进语音房'],
      headerTitle: ['精选互动评论', '网友实时热评', '听众互动区', '最新留言（28）'],
      replyPrefix: ['作者回复：', '博主回复：', '本人回复：', 'UP回复：'],
      inputPlaceholder: ['留下一句评论吧…', '说说此刻听完的感受…', '敲一句暗号互动一下吧 ✨'],
      footerTitle: [
        '今天这状态也太绝了吧 ✨',
        '谁懂这一刻的松弛氛围感',
        '原声直出｜这嗓音真的听醉了',
        '随手一拍就是电影截图质感',
        '晚上十点语音房不见不散 💜',
        '这眼神跟微表情谁顶得住！',
        '今日份心头好必须收藏起来',
        '越看越上头的宝藏日常瞬间'
      ],
      overlayTitle: [
        '耳机党慎入\n一开口就*沦陷*',
        '这种反差感\n谁看谁*心动*',
        '深夜上线\n遇见*对频*的人',
        '镜头直出\n氛围感*拉满*'
      ],
      overlaySubtitle: ['这种音色真的顶不住', '看到最后真的破防了', '今晚评论区等你连麦', '谁懂这个微表情的杀伤力'],
      likes: () => String(Math.floor(Math.random() * 3200) + 128),
      pinBadge: ['置顶', '精选', '热播', '热门', ''],
      watchedTag: ['刚刚看过', '正在播放', '10分钟前赞', ''],
      publishTime: ['刚刚', '5分钟前', '28分钟前', '2小时前', '昨天 22:15', '2025-10-30', '3天前'],
      commentMeta: [
        '刚刚 · 台北',
        '6分钟前 · 桃园',
        '12分钟前 · 新加坡',
        '15分钟前 · 香港',
        '22分钟前 · 澳门',
        '35分钟前 · 吉隆坡',
        '1小时前 · 槟城',
        '2小时前 · 高雄',
        '昨天 · 新山'
      ],
      commentText: [
        '刚看完这条动态，氛围跟声音反差感也太戳人了吧！',
        '质感好绝啊，已经点赞关注，晚上去语音房蹲一波～',
        '笑起来也太甜了吧！评论区举手求回关 👋',
        '这个角度绝美，循环看了好多遍，多发爱看 ✨'
      ],
      commentReply: [
        '谢谢支持呀！今晚十点记得来房间连麦 💜',
        '哈哈被你发现了，后续还会继续分享日常～',
        '已回关啦，欢迎常来逛我的主页！',
        ''
      ]
    };

    const spec = pools[k];
    if (typeof spec === 'function') {
      return String(spec());
    }
    if (Array.isArray(spec)) {
      return conv(pickRandomDistinct(spec, currentVal));
    }
    return '';
  }

  global.LayaDefaults = {
    STAGE_WIDTH,
    STAGE_HEIGHT,
    PORTRAIT_STAGE_WIDTH,
    PORTRAIT_STAGE_HEIGHT,
    DEFAULT_PLAY_STATE,
    createDefaultState,
    createDefaultProfileCenter,
    createRawImageMap,
    getLibraryImage,
    getAvatarFromLibrary,
    isCardUneditedDefault,
    randomizeUserProfile,
    randomizeStatusBar,
    rollRandomFieldValue,
    getTextElementMeta,
    getBaseFontSize,
    getEffectiveFontSize,
    listAllTextItems
  };
})(window);
