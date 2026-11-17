/**
 * Laya App 商店截图生成器 - 1920×1080 全功能可隐藏/可移动/透明背景默认配置
 */
(function (global) {
  'use strict';

  const STAGE_WIDTH = 1920;
  const STAGE_HEIGHT = 1080;

  const DEFAULT_CARD_1_TITLE = '最招人讨厌的音色\n青受音';
  const DEFAULT_CARD_1_SUB = '爆雷率肯定很高';
  const DEFAULT_CARD_2_TITLE = '大龄女生\n真正破防的瞬间';
  const DEFAULT_CARD_2_SUB = '你们会 真的因此 pass 吗';

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

  function createDefaultState() {
    return {
      // 画布文案语言状态：'zh-CN'（简体） | 'zh-TW'（繁体）
      posterLang: 'zh-CN',

      // 全局画布与背景模式：dark(深色) | transparent(透明外背景) | full-transparent(全透明无黑底) | light(浅色白底)
      layout: {
        canvasTheme: 'dark',
        enableAnim: true,
        bgColor: '#080611',
        borderColor: '#2a2342',
        cardRadius: 20,
        colGap: 44,
        outerPadX: 48,
        outerPadY: 24
      },

      // 三大步骤引导大标题
      steps: {
        step1: '1、谷歌商店搜索 Laya',
        step2: '2、点击娱乐，再点击 🔍',
        step3: '3、搜索 6182189',
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
        searchQuery: '6182189',
        showCursor: true,
        showClearBtn: true,
        cancelText: '取消',
        sectionTitle: '用户',
        nickname: '小猫/花泽类',
        gender: 'female',
        age: '22岁',
        level: 'Lv.22',
        region: '台北 · 信义区',
        distance: '1.2km · 当前在线',
        bioTag: '🎧 温柔甜妹音',
        userId: '6182189',
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
            footerTitle: '最招人讨厌的声音—青受音',
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
            footerTitle: '大龄女生真正破防的瞬间',
            likes: '1437',
            mediaType: 'default',
            defaultVariant: 'girl',
            mediaName: '原图封面（右）',
            showPlayBadge: true
          }
        ]
      },

      // AI 配置（请在界面「高级 API 设置」中填入自己的密钥，会自动保存在本地浏览器，不会上传公开仓库）
      aiConfig: {
        apiKey: '',
        gasProxyUrl: '',
        topicPrompt: '年轻人语音交友、声音控吐槽、情感破防瞬间',
        targetCard: 'all'
      },

      // 自由拖动偏移量 { [key]: { x, y } }
      offsets: {},

      // 全页面任意元素隐藏/删除状态表 { [key]: labelString }
      hiddenElements: {}
    };
  }

  function createRawImageMap(onReady) {
    const rawData = global.LayaRawAssets || {};
    const map = {};
    const keys = Object.keys(rawData);
    let remaining = keys.length;

    if (remaining === 0 && onReady) {
      onReady(map);
      return map;
    }

    keys.forEach((k) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        remaining -= 1;
        if (remaining <= 0 && onReady) onReady(map);
      };
      img.src = rawData[k];
      map[k] = img;
    });

    return map;
  }

  function isCardUneditedDefault(state, card) {
    if (!card || card.mediaType !== 'default') return false;
    // 若用户切换为了繁体模式，改用去字底图并实时绘制繁体标题与字幕
    if (state.posterLang === 'zh-TW') return false;
    const hid = state.hiddenElements || {};
    if (
      hid[`card_title_${card.id}`] ||
      hid[`card_sub_${card.id}`] ||
      hid[`card_badge_${card.id}`]
    ) {
      return false;
    }
    const tOff = state.offsets && state.offsets[`card_title_${card.id}`];
    const sOff = state.offsets && state.offsets[`card_sub_${card.id}`];
    const bOff = state.offsets && state.offsets[`card_badge_${card.id}`];
    if (
      (tOff && (tOff.x || tOff.y)) ||
      (sOff && (sOff.x || sOff.y)) ||
      (bOff && (bOff.x || bOff.y))
    ) {
      return false;
    }
    if (card.defaultVariant === 'boy') {
      return (
        card.overlayTitle === DEFAULT_CARD_1_TITLE &&
        card.overlaySubtitle === DEFAULT_CARD_1_SUB
      );
    }
    if (card.defaultVariant === 'girl') {
      return (
        card.overlayTitle === DEFAULT_CARD_2_TITLE &&
        card.overlaySubtitle === DEFAULT_CARD_2_SUB
      );
    }
    return false;
  }

  /**
   * 随机生成丰富真实的个人信息（年龄、等级、地区城市、距离在线状态、声音标签）
   */
  function randomizeUserProfile(currentUser) {
    const regions = [
      '台北 · 信义区',
      '台北 · 大安区',
      '香港 · 尖沙咀',
      '香港 · 铜锣湾',
      '新加坡 · 乌节路',
      '吉隆坡 · 武吉免登',
      '东京 · 涩谷区',
      '首尔 · 江南区',
      '上海 · 静安区',
      '杭州 · 西湖区',
      '成都 · 锦江区',
      '广州 · 天河区'
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

  global.LayaDefaults = {
    STAGE_WIDTH,
    STAGE_HEIGHT,
    DEFAULT_PLAY_STATE,
    createDefaultState,
    createRawImageMap,
    isCardUneditedDefault,
    randomizeUserProfile,
    randomizeStatusBar
  };
})(window);
