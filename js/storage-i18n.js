/**
 * Laya App 商店截图生成器 - 本地持久化存储（状态 + 上传图片/视频 IndexedDB 缓存）与画布简繁一键转换引擎
 * 说明：自动保存所有文字、排版偏移、隐藏状态及上传的本地图片/MP4视频，刷新或重开浏览器完全保留，仅点击「重置默认」时清空。
 */
(function (global) {
  'use strict';

  const STATE_STORAGE_KEY = 'laya_store_gen_state_v3';
  const IDB_NAME = 'LayaStoreGenMediaDB';
  const IDB_VERSION = 1;
  const IDB_STORE = 'media_blobs';

  // ===========================================================================
  // 1. IndexedDB + LocalStorage 全量持久化引擎
  // ===========================================================================
  let dbPromise = null;

  function openMediaDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'slotKey' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    });
    return dbPromise;
  }

  async function saveMediaBlob(slotKey, blob, extraMeta) {
    if (!slotKey || !blob) return;
    const db = await openMediaDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(
          Object.assign(
            {
              slotKey,
              blob,
              mimeType: blob.type || '',
              fileName: blob.name || slotKey,
              updatedAt: Date.now()
            },
            extraMeta || {}
          )
        );
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function deleteMediaBlob(slotKey) {
    const db = await openMediaDB();
    if (!db || !slotKey) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(slotKey);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function loadAllMediaBlobs() {
    const db = await openMediaDB();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (_) {
        resolve([]);
      }
    });
  }

  async function clearAllMediaBlobs() {
    const db = await openMediaDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  let saveTimer = 0;
  function saveStateNow(state) {
    try {
      localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function scheduleSaveState(state) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveStateNow(state), 180);
  }

  function deepMergeState(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    const result = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(saved).forEach((k) => {
      const sv = saved[k];
      const bv = base[k];
      if (Array.isArray(sv)) {
        result[k] = sv;
      } else if (sv && typeof sv === 'object' && bv && typeof bv === 'object' && !Array.isArray(bv)) {
        result[k] = deepMergeState(bv, sv);
      } else if (sv !== undefined) {
        result[k] = sv;
      }
    });
    return result;
  }

  function loadSavedState(defaultState) {
    try {
      const raw = localStorage.getItem(STATE_STORAGE_KEY);
      if (!raw) return defaultState;
      const parsed = JSON.parse(raw);
      // offsets 与 hiddenElements 以保存值为准（不混入多余旧项）
      const merged = deepMergeState(defaultState, parsed);
      merged.offsets = (parsed && parsed.offsets) || {};
      merged.hiddenElements = (parsed && parsed.hiddenElements) || {};
      return merged;
    } catch (_) {
      return defaultState;
    }
  }

  async function clearAllSavedData() {
    clearTimeout(saveTimer);
    try {
      localStorage.removeItem(STATE_STORAGE_KEY);
    } catch (_) {}
    await clearAllMediaBlobs();
  }

  // ===========================================================================
  // 2. 画布内容简繁一键互转引擎（优先调用 OpenCC，内置高频完整字库兜底，零网络亦可瞬时转换）
  // ===========================================================================
  const S2T_CHARS =
    '万与丑专业丛东丝丢两严丧个丰临为丽举么义乌乐乔习乡书买乱争于亏云亘亚产亩亲亵亿仅从仑仓仪们价众优伙会伛伞伟传伤伥伦伧伪伫体余佣佥侠侣侥侦侧侨侩侪侬俣俦俨俩俪俭债倾偬偻偾偿傥傧储傩儿兑兖党兰关兴兹养兽冁内冈册再冒冕冗写军农冢冲决况冻净凄凉凌减凑凛几凤凫凭凯击凼凿刍划刘则刚创删别刬剀刽刿剀剂剐剑剥剧劝办务劢动励劲劳势勋勐勚匀匦匮区医华协单卖卢卤卧卫却卺厂厅历厉压厌厍厕厢厣厦厨厩厮县参叆叇双发变叙叠叶号叹叽吁后吓吕吗吣吨听启吴呒呓呕呖呗员呙呛呜咏咔咙咛咝咤咴咸哌响哑哒哓哔哕哗哙哜哝哟唛唝唠唡唢唣唤唿啧啬啭啮啰啴啸喷喽喾嗫呵嗳嘘嘤嘱噜噼嚣嚯团园困囱围囵国图圆圣圹场坂坏块坚坛坜坝坞坟坠垄垅垆垒垦垧垩垫垭垯垱垲垴埘埙埚埝埯堑堕堞堠堡堤堪堰堵塄塌塍塑埘塔塘塞坞填塬塾墀墁境墅墉垫墓坠增墟墨墩堕壁壅坛壑压壕垒圹壮声壳壶处备复够头夸夹夺奁奂奋奖奥妆妇妈妩妪妫姗姜娄娅娆娇娈娱娲娴婳婴婵婶媪嫒嫔嫱嬷孙学孪宁宝实宠审宪宫宽宾寝对寻导寿将尔尘尝尧尴尸尽层屉届属屡屦屿岁岂岖岗岘岙岚岛岩岭岳岽岿峧峄峡峣峤峥峦崂崃峂崭嵘嵚嵛嵝嵴巅巩巯币帅师帏帐帘帜带帧帮帱帻帼幂幞干并广庄庆庐庑库应庙庞废廒廪开异弃弑张弥弪弯弹强归当录彦彻径徕御忆忏忧忾怀态怂怃怄怅怆怜总怼怿恋恳恶恸恹恺恻恼恽悦悫悬悭悯惊惧惨惩惫惬惭惮惯惰恼想惶惹惺愀愁愈愉意愕愚感愠愣愤愦愧愿慈慊慌慎慑慕慝慢慧慨怂虑慰慵庆慷忧惫憎怜凭憝惮愤憧憨憩憬懔憾懂懈懊懋懑懒懔懦戏戋戬战戬户扎扑扦执扩扪扫扬扰抚抛抟抠抡抢护报担拟拢拣拥拦拧拨择挂挚挛挜挝挞挟挠挡挢挣挤挥挦捞损捡换捣据捻掳掴掷掸掺掼揸揽揿搀搁搂搅携摄摅摆摇摈摊撄撑撵撷撸撺擞攒敌敛数斋斓斗斩断无旧时旷旸昙昼昽显晋晒晓晔晕晖暂暧札术朴机杀杂权条来杨杩杰极构枞枢枣枥枧枨枪枫枭柜柠柽栀栅标栈栉栊栋栌栎栏树栖样栾棬桠桡桢档桤桥桦桧桨桩梦梼梾检棂椁椟椠椤椭楼榄榇榈榉槠槛槟槠横樯樱樵樽樾橄橇橐橘橙机橡橥橱橹橼檀檄檎檐檑檗檠檩檫檬欠次欢欣欧欲欷敛款欺敌残殒殁殚殡殴毁毂毕毙毡毵氇气氢氩氲汇汉污汤汹沓沟没沣沤沥沦沧沨沩沪泞泪泶泷泸泺泻泼泽泾洁洒洼浃浅浆浇浈浉浊测浍济浏浐浑浒浓浔浕涂涌涛涝涞涟涠涡涢涣涤润涧涨涩涮涯液涵涸涿淀淄淅淆淇淋淌淑淖淘淙泪淞淡淤淦淫淬淮深淳混淹添淼清渊渍渎渐渔渗渚减渝渠渡渣渤渥温测渭港游渴湍湎湃湄凑湍湖湘湛湟湨湾湿溃溅溆溇滗滚滞滟滠满滢滤滥滦滨滩滪漤潆潇潋潍潜潞潢潦潭潮潲潴潸潺潼澄澈澉澌澍澎澜澡澧澳澶澹激濂濉濑濒濞濠濡涛滥濬濮濯潍滨济濠濡点炼炽烁烂烃烛烟烦烧烨烩烫烬热焕焖焘煅糊溜爱爷牍牦牵牺犊犟状犷犸犹狈狍狝狞独狭狮狯狰狱狲猃猎猕猡猪猫猬献獭玑玙璆玛玮环现玱玺珉珏珐珑珲琎琏琐琼瑶瑷璇璎瓒瓮瓯电画畅畲畴疖疗疟疠疡疬疮疯疱疴痈痉痒痖痨痪痫痴瘅瘆瘗瘘瘪瘫瘾瘿癞癣癫癯皑皱皲盏盐监盖盗盘眍眦眬着睁睐睑瞒瞩矫矶矾矿砀码砖砗砚砜砺砻砾础硁硅硕硖硗硙硚确硷碍碛碜碱碹礼祎祢祯祷祸禀禄禅离秃秆种积称秽秾稆税稣稳穑穷窃窍窎窑窜窝窥窦窭竖竞笃笋笔笕笺笼笾筑筚筛筜筝筹签简箓箦箧箨箩箪箫篑篓篮篱簖籁籀类籼粜粝粤粪粮糁糇紧絷纠纡红纣纤纥约级纨纩纪纫纬纭纮纯纰纱纲纳纴纵纶纷纸纹纺纻纼纽纾线绀绁绂练组绅细织终绉绊绋绌绍绎经绐绑绒结绔绕绖绗绘给绚绛络绝绞统绠绡绢绣绤绥绦继绨绩绪绫绬续绮绯绰绱绲绳维绵绶绷绸绹绺绻综绽绾绿缀缁缂缃缄缅缆缇缈缉缊缋缌缍缎缏缐缑缒缓缔缕编缗缘缙缚缛缜缝缞缟缠缡缢缣缤缥缦缧缨缩缪缫缬缭缮缯缰缱缲缳缴缵罂网罗罚罢罴羁羟羡翘翙翚耢耧耸耻聂聋职聍联聩聪肃肠肤肮肾肿胀胁胂胃胆背胎胖胚胜胞胡胤胥胧胨胩胪胫胬胭胯胰胱胲胳胴胶胸胺胼能脂脆脉脊脍脎脏脐脑脓脔脖脘脚脯脱脲脶脸脾腆腈腊腋腌腐腑腓腔腕腙腚腠腥腧腩腭腮腰腱腴腹腺腻腼腽腾腿膀膂膑臆膻臀臂臃臆臊臌臣臧自臭至致舆舌舍舐舒舔舗舜舞舟航般舰舱舳舻艰艳艺节芈芗芜芦苁苇苈苋苌苍苎苏苘苹茎茏茑茔茕茧荆荐荙荚荛荜荞荟荠荡荣荤荥荦荧荨荩荪荫荬荭荮药莅莜莱莲莳莴莶获莸莹莺莼萚萝萤营萦萧萨葱蒇蒉蒋蒌蓝蓟蓠蓣蓥蓦蔷蔹蔺蔼蕲蕴薮藁藉蓝藏藐藓藕藜艺藤药藩蔼藻藿蘧兰蘸虏虑虚虫虬虮虽虾虿蚀蚁蚂蚕蚝蚬蛊蛎蛏蛮蛰蛱蛲蛳蛴蜕蜗蜡蝇蝈蝉蝎蝼蝾螀螨蟏衅街衙卫冲击表衫衬衮袄袅祎衫袭裆裤裢裣裥裱裨裾裰褡褙褛褴襁镧见观规觅视觇览觉觊觋觌觎觏觐觑觞触觯誉誊计订讣认讥讦讧讨让讪讫训议讯记讱讲讳讴讵讶讷许讹论讻讼讽设访诀证诂诃评诅识诇诈诉诊诋诌词诎诏诐译诒诓诔试诖诗诘诙诚诛诜话诞诟诠诡询诣诤该详诧诨诩诪诫诬语诮误诰诱诲诳说诵诶请诸诹诺读诼诽课诿谀谁谂调谄谅谆谇谈谊谋谌谍谎谏谐谑谒谓谔谕谖谗谘谙谚谛谜谝谞谟谠谡谢谣谤谥谦谧谨谩谪谫谬谭谮谯谰谱谲谳谴谵谶谷豼贝贞负贠贡财责贤败账货质贩贪贫贬购贮贯贰贱贲贳贴贵贶贷贸费贺贻贼贽贾贿赀赁赂赃资赅赆赇赈赉赊赋赌赍赎赏赐赑赒赓赔赕赖赗赘赙赚赛赜赝赞赟赠赡赢赣赪赵赶趋趱趸跃跄跖跞践跶跷跸跹跻踊踌踪踬踯蹑蹒蹰蹿躏躜躯车轧轨轩轫转轭轮软轰轱轲轳轴轵轶轷轸轹轺轻轼载轾轿辀辁辂较辄辅辆辇辈辉辊辋辌辍辎辏辐辑辒输辔辕辖辗辘辙辚辞辟辩辫边辽达迁过迈运还这进远违连迟迩迳迹适选逊递逦逻遗遥邓邝邬邮邹邺邻郁郄郏郐郑郓郦郧郸酝酦酱酽酾酿释里鉅鉴銮錾钆钇针钉钊钋钌钍钎钏钐钑钒钓钔钕钖钗钘钙钚钛钜钝钞钟钠钡钢钣钤钥钦钧钨钩钪钫钬钭钮钯钰钱钲钳钴钵钶钷钸钹钺钻钼钽钾钿铀铁铂铃铄铅铆铈铉铊铋铍铎铏铐铑铒铕铗铘铙铚铛铜铝铞铟铠铡铢铣铤铥铦铧铨铪铫铬铭铮铯铰铱铲铳铴铵银铷铸铹铺铻铼铽链铿销锁锂锃锄锅锆锇锈锉锊锋锌锍锎锏锐锑锒锓锔锕锖锗错锚锜锝锞锟锡锢锣锤锥锦锨锩锫锬锭键锯锰锱锲锳锴锵锶锷锸锹锺锻锼锽锾锿镀镁镂镃镆镇镈镉镊镌镍镎镏镐镑镒镕镖镗镙镚镛镜镝镞镟镡镣镤镥镦镧镨镩镪镫镬镭镮镯镰镱镲镳镴镶长门闩闪闫闬闭问闯闰闱闲闳间闵闶闷闸闹闺闻闼闽闾闿阀阁阂阃阄阅阆阇阈阉阊阋阌阍阎阏阐阑阒阓阔阕阖阗阘阙阚阛队阳阴阵阶际陆陇陈陉陕陧陨险随隐隶隽难雏雠雳雾霁霉霭靓静靥鞑鞒鞯鞴韦韧韂韩韪韫韬韵页顶顷顸项顺须顼顽顾顿颀颁颂颃预颅领颇颈颉颊颋颌颍颎颏颐频颒颓颔颕颖颗题颙颚颛颜额颞颟颠颡颢颣颤颥颦颧风飏飐飑飒飓飔飕飖飗飘飙飚飞食飧飨餍餐饥饧饨饩饪饫饬饭饮饯饰饱饲饳饴饵饶饷饸饹饺饻饼饽饾饿馀馁馂馃馄馅馆馇馈馉馊馋馌馍馎馏馐馑馒馓馔馕首香马驭驮驯驰驱驲驳驴驵驶驷驸驹驺驻驼驽驾驿骀骁骂骃骄骅骆骇骈骉骊骋验骍骎骏骐骑骒骓骔骕骖骗骘骙骚骛骜骝骞骟骠骡骢骣骤骥骦骧髅髋髌鬓魇魉鱼鱽鱾鱿鲀鲁鲂鲄鲅鲆鲇鲈鲉鲊鲋鲌鲍鲎鲏鲐鲑鲒鲓鲔鲕鲖鲗鲘鲙鲚鲛鲜鲝鲞鲟鲠鲡鲢鲣鲤鲥鲦鲧鲨鲩鲪鲫鲬鲭鲮鲯鲰鲱鲲鲳鲴鲵鲶鲷鲸鲹鲺鲻鲼鲽鲾鲿鳀鳁鳂鳃鳄鳅鳆鳇鳈鳉鳊鳋鳌鳍鳎鳏鳐鳑鳒鳓鳔鳕鳖鳗鳘鳙鳛鳜鳝鳞鳟鳠鳡鳢鳣鸟鸠鸡鸢鸣鸤鸥鸦鸧鸨鸩鸪鸫鸬鸭鸮鸯鸰鸱鸲鸳鸴鸵鸶鸷鸸鸹鸺鸻鸼鸽鸾鸿鹀鹁鹂鹃鹄鹅鹆鹇鹈鹉鹊鹋鹌鹍鹎鹏鹐鹑鹒鹓鹔鹕鹗鹘鹚鹛鹜鹝鹞鹟鹠鹡鹢鹣鹤鹥鹦鹧鹨鹩鹪鹫鹬鹭鹯鹰鹱鹲鹳鹴卤咸鹾碱盐麦麸黄黉黩黪黾鼋鼍鼹齐齑齿龀龃龄龅龆龇龈龉龊龋龌龙龚龛龟装昵赞杯';

  const T2S_CHARS =
    '萬與醜專業叢東絲丟兩嚴喪個豐臨為麗舉麼義烏樂喬習鄉書買亂爭於虧雲亙亞產畝親褻億僅從侖倉儀們價眾優夥會傴傘偉傳傷倀倫傖偽佇體餘傭僉俠侶僥偵側僑儈儕儂俁儔儼倆儷儉債傾傯僂僨償儻儐儲儺兒兌兗黨蘭關興茲養獸囅內岡冊再冒冕冗寫軍農塚沖決況凍淨淒涼淩減湊凜幾鳳鳧憑凱擊氹鑿芻劃劉則剛創刪別剗剴劊劌剴劑剮劍剝劇勸辦務勱動勵勁勞勢勳猛勩勻匭匱區醫華協單賣盧鹵臥衛卻巹廠廳曆厲壓厭厙廁廂厴廈廚廄廝縣參靉靆雙發變敘疊葉號歎嘰籲後嚇呂嗎唚噸聽啟吳嘸囈嘔嚦唄員咼嗆嗚詠哢嚨嚀噝吒噅鹹呱響啞噠嘵嗶噦嘩噲嚌噥喲嘜坰嘮啢嗩唕喚呼嘖嗇囀齧囉嘽嘯噴嘍嚳囁嗬噯噓嚶囑嚕劈囂謔團園困囪圍圇國圖圓聖壙場阪壞塊堅壇壢壩塢墳墜壟壟壚壘墾坰堊墊埡墶壋塏堖塒塤堝墊垵塹墮堞堠堡堤堪堰堵塄塌塍塑塒塔塘塞塢填塬塾墀墁境墅墉墊墓墜增墟墨墩墮壁壅壇壑壓壕壘壙壯聲殼壺處備複夠頭誇夾奪奩奐奮獎奧妝婦媽嫵嫗媯姍薑婁婭嬈嬌孌娛媧嫻嫿嬰嬋嬸媼嬡嬪嬙嬤孫學孿寧寶實寵審憲宮寬賓寢對尋導壽將爾塵嘗堯尷屍盡層屜屆屬屢屨嶼歲豈嶇崗峴嶴嵐島岩嶺嶽崠巋嶠嶧峽嶢嶠崢巒嶗崍嵕嶄嶸嶔崳嶁脊巔鞏巰幣帥師幃帳簾幟帶幀幫幬幘幗冪襆幹並廣莊慶廬廡庫應廟龐廢厫廩開異棄弑張彌弳彎彈強歸當錄彥徹徑徠禦憶懺憂愾懷態慫憮慪悵愴憐總懟懌戀懇惡慟懨愷惻惱惲悅愨懸慳憫驚懼慘懲憊愜慚憚慣惰惱想惶惹惺愀愁愈愉意愕愚感慍愣憤憒愧願慈慊慌慎懾慕慝慢慧慨慫慮慰慵慶慷憂憊憎憐憑憝憚憤憧憨憩憬懍憾懂懈懊懋懣懶懍懦戲戔戩戰戩戶紮撲扡執擴捫掃揚擾撫拋摶摳掄搶護報擔擬攏揀擁攔擰撥擇掛摯攣掗撾撻挾撓擋撟掙擠揮撏撈損撿換搗據撚擄摑擲撣摻摜揸攬撳攙擱摟攪攜攝攄擺搖擯攤攖撐攆擷擼攛擻攢敵斂數齋斕鬥斬斷無舊時曠暘曇晝曨顯晉曬曉曄暈暉暫曖劄術樸機殺雜權條來楊榪傑極構樅樞棗櫪梘棖槍楓梟櫃檸檉梔柵標棧櫛櫳棟櫨櫟欄樹棲樣欒棬椏橈楨檔桤橋樺檜槳樁夢檮棶檢欞槨櫝槧欏橢樓欖櫬櫚櫸櫧檻檳櫧橫檣櫻樵樽樾橄橇橐橘橙機橡櫫櫥櫓櫞檀檄檎簷檑檗檠檁檫檬欠次歡欣歐欲欷斂款欺敵殘殞歿殫殯毆毀轂畢斃氈毿氌氣氫氬氳匯漢汙湯洶遝溝沒灃漚瀝淪滄颯溈滬濘淚澩瀧瀘濼瀉潑澤涇潔灑窪浹淺漿澆湞溮濁測澮濟瀏滻渾滸濃潯濜塗湧濤澇淶漣潿渦溳渙滌潤澗漲澀涮涯液涵涸涿澱淄淅淆淇淋淌淑淖淘淙淚淞淡淤淦淫淬淮深淳混淹添淼清淵漬瀆漸漁滲渚減渝渠渡渣渤渥溫測渭港遊渴湍湎湃湄湊湍湖湘湛湟湨灣濕潰濺漵漊潷滾滯灩滠滿瀅濾濫灤濱灘澦濫瀠瀟瀲濰潛潞潢潦潭潮潲瀦潸潺潼澄澈澉澌澍澎瀾澡澧澳澶澹激濂濉瀨瀕濞濠濡濤濫濬濮濯濰濱濟濠濡點煉熾爍爛烴燭煙煩燒燁燴燙燼熱煥燜燾煆糊溜愛爺牘犛牽犧犢強狀獷獁猶狽麅獮獰獨狹獅獪猙獄猻獫獵獼玀豬貓蝟獻獺璣璵璆瑪瑋環現瑲璽珉玨琺瓏琿琎璉瑣瓊瑤璦璇瓔瓚甕甌電畫暢佘疇癤療瘧癘瘍癧瘡瘋皰屙癰痙癢瘂癆瘓癇癡癉瘮瘞瘺癟癱癮癭癩癬癲臒皚皺皸盞鹽監蓋盜盤瞘眥矓著睜睞瞼瞞矚矯磯礬礦碭碼磚硨硯碸礪礱礫礎硜矽碩硤磽磑礄確鹼礙磧磣堿镟禮禕禰禎禱禍稟祿禪離禿稈種積稱穢穠穭稅穌穩穡窮竊竅窎窯竄窩窺竇窶豎競篤筍筆筧箋籠籩築篳篩簹箏籌簽簡籙簀篋籜籮簞簫簣簍籃籬籪籟籀類秈糶糲粵糞糧糝餱緊縶糾紆紅紂纖紇約級紈纊紀紉緯紜紘純紕紗綱納紝縱綸紛紙紋紡紵紽紐紓線紺紲紱練組紳細織終縐絆紼絀紹繹經紿綁絨結絝繞絰絎繪給絢絳絡絕絞統綆綃絹繡綌綏絛繼綈績緒綾緓續綺緋綽緔緄繩維綿綬繃綢綯綹綣綜綻綰綠綴緇緙緗緘緬纜緹緲緝縕繢緦綞緞緶線緱縋緩締縷編緡緣縉縛縟縝縫縗縞纏縭縊縑繽縹縵縲纓縮繆繅纈繚繕繒韁繾繰繯繳纘罌網羅罰罷羆羈羥羨翹翽翬耮耬聳恥聶聾職聹聯聵聰肅腸膚骯腎腫脹脅胂胃膽背胎胖胚勝胞胡胤胥朧腖胩臚脛弩胭胯胰胱胲胳胴膠胸胺胼能脂脆脈脊膾脎臟臍腦膿臠脖脘腳脯脫脲腡臉脾腆腈臘腋醃腐腑腓腔腕膃腚腠腥腧腩齶腮腰腱腴腹腺膩靦腽騰腿膀膂臏臆羶臀臂臃臆臊臌臣臧自臭至致輿舌舍舐舒舔鋪舜舞舟航般艦艙舳艫艱豔藝節羋薌蕪蘆蓯葦藶莧萇蒼苧蘇檾蘋莖蘢蔦塋煢繭荊薦薘莢蕘蓽蕎薈薺蕩榮葷滎犖熒蕁藎蓀蔭蕒葒葤藥蒞蓧萊蓮蒔萵薟獲蕕瑩鶯蓴蘀蘿螢營縈蕭薩蔥蕆蕢蔣蔞藍薊蘺蕷鎣驀薔蘞藺藹蘄蘊藪槁藉藍藏藐蘚藕藜藝藤藥藩藹藻藿蘧蘭蘸虜慮虛蟲虯蟣雖蝦蠆蝕蟻螞蠶蠔蜆蠱蠣蟶蠻蟄蛺蟯螄蠐蛻蝸蠟蠅蟈蟬蠍螻蠑將蟎蠨釁街衙衛衝擊表衫襯袞襖嫋禕衫襲襠褲褳襝襉裱裨裾裰褡褙褸襤繈鑭見觀規覓視覘覽覺覬覡覿覦覯覲覷觴觸觶譽謄計訂訃認譏訐訌討讓訕訖訓議訊記訒講諱謳詎訝訥許訛論訩訟諷設訪訣證詁訶評詛識詗詐訴診詆謅詞詘詔詖譯詒誆誄試詿詩詰詼誠誅詵話誕詬詮詭詢詣諍該詳詫諢詡譸誡誣語誚誤誥誘誨誑說誦誒請諸諏諾讀諑誹課諉諛誰諗調諂諒諄誶談誼謀諶諜謊諫諧謔謁謂諤諭諼讒諮諳諺諦謎諞諝謨讜謖謝謠謗諡謙謐謹謾謫譾謬譚譖譙讕譜譎讞譴譫讖穀豼貝貞負貟貢財責賢敗賬貨質販貪貧貶購貯貫貳賤賁貰貼貴貺貸貿費賀貽賊贄賈賄貲賃賂贓資賅贐賕賑賚賒賦賭齎贖賞賜贔賙賡賠賧賴賵贅賻賺賽賾贗贊贇贈贍贏贛赬趙趕趨趲躉躍蹌蹠躒踐躂蹺蹕躚躋踴躊蹤躓躑躡蹣躕躥躪躦軀車軋軌軒軔轉軛輪軟轟軲軻轤軸軹軼軤軫轢軺輕軾載輊轎輈輇輅較輒輔輛輦輩輝輥輞諒輟輜輳輻輯轀輸轡轅轄輾轆轍轔辭辟辯辮邊遼達遷過邁運還這進遠違連遲邇逕跡適選遜遞邐邏遺遙鄧鄺鄔郵鄒鄴鄰鬱郤郟鄶鄭鄆酈鄖鄲醞醱醬釅釃釀釋裡鉅鑒鑾鏨釓釔針釘釗釙釕釷釺釧釤鈒釩釣鍆釹鍚釵鈃鈣鈈鈦鉅鈍鈔鐘鈉鋇鋼鈑鈐鑰欽鈞鎢鉤鈧鈁鈥鈄鈕鈀鈺錢鉦鉗鈷缽鉶鉕鈽鈸鉞鑽鉬鉭鉀鈿鈾鐵鉑鈴鑠鉛鉚鈰鉉鉈鉍鈹鐸鉶銬銠鉺銪鋏鋣鐃銍鐺銅鋁銱銦鎧鍘銖銑鋌銩銛鏵銓鉿銚鉻銘錚銫鉸銥鏟銃鐋銨銀銣鑄鐒鋪鋙錸鋱鏈鏗銷鎖鋰鋥鋤鍋鋯鋨鏽銼鋝鋒鋅鋶鐦鐧銳銻鋃鋟鋦錒錆鍺錯錨錡鍀錁錕錫錮鑼錘錐錦鍁錈錇錟錠鍵鋸錳錙鍥鍈鍇鏘鍶鍔鍤鍬鍾鍛鎪鍠鍰鎄鍍鎂鏤鎡鏌鎮鎛鎘鑷鐫鎳鎿鎦鎬鎊鎰鎔鏢鏜鏍镚鏞鏡鏑鏃鏇鐔鐐鏷鑥鐓鑭鐠鑹鏹鐙鑊鐳鐶鐲鐮鐿鑔鑣鑞鑲長門閂閃閆閈閉問闖閏闈閑閎間閔闞悶閘鬧閨聞闥閩閭闓閥閣閡閫鬮閱閬闍閾閹閶鬩閿閽閻閼闡闌闃闠闊闋闔闐闒闕闞闤隊陽陰陣階際陸隴陳陘陝隉隕險隨隱隸雋難雛讎靂霧霽黴靄靚靜靨韃鞽韉韝韋韌韍韓韙韞韜韻頁頂頃頇項順須頊頑顧頓頎頒頌頏預顱領頗頸頡頰頋頜潁熲頦頤頻頮頹頷頴穎顆題顒顎顓顏額顳顢顛顙顥纇顫顬顰顴風颺颭颮颯颶颸颼颻飀飄飆飆飛食飧饗饜餐饑餳飩餼飪飫飭飯飲餞飾飽飼飿飴餌饒餉餄餎餃餏餅餑餖餓餘餒餕餜餛餡館餷饋餶餿饞饁饃餺餾饈饉饅饊饌饢首香馬馭馱馴馳驅馹駁驢駔駛駟駙駒騶駐駝駑駕驛駘驍罵駰驕驊駱駭駢驫驪騁驗騂駸駿騏騎騍騅騌驌驂騙騭騤騷騖驁騮騫騸驃騾驄驏驟驥驦驤髏髖髕鬢魘魎魚魛魢魷魨魯魴魺鱍鮃鮎鱸鮋鮓鮒鮊鮑鱟鯁鮐鮭鮚鮳鮪鮞鮦鰂鮜鱠鱭鮫鮮鮺鯗鱘鯁鱺鰱鰹鯉鰣鰷鯀鯊鯇鮶鯽鯒鯖鯪鯕鯫鯡鯤鯧鯝鯢鯰鯛鯨鰺鯴鯔鱝鰈鰏鱨鯷鰮鰃鰓鱷鰍鰒鰉鰁鱂鯿鰠鰲鰭鰨鰥鰩鰟鰜鰳鰾鱈鱉鰻鰵鏞鰼鱖鱔鱗鱒鱯鱤鱧鱣鳥鳩雞鳶鳴鳲鷗鴉鶬鴇鴆鴣鶇鸕鴨鴞鴦鴒鴟鴝鴛鴬鴕鷥鷙鴯鴰鵂鴴鵃鴿鸞鴻鵐鵓鸝鵑鵠鵝鵒鷳鵜鵡鵲鶓鵪鶤鵯鵬鵮鶉鶊鷷鷫鶘鶚鶻鶿鶥鶩鷊鷂鶲鶹鶺鷁鶼鶴鷖鸚鷓鷚鷯鷦鷲鷸鷺鸇鷹鸌鸏鸛鸘鹵鹹鹺鹼鹽麥麩黃黌黷黲黽鼉鼉鼴齊齏齒齔齟齡齙齠齜齦齬齪齲齷龍龔龕龜裝暱讚盃';

  let s2tMap = null;
  let t2sMap = null;

  function ensureCharMaps() {
    if (s2tMap && t2sMap) return;
    s2tMap = {};
    t2sMap = {};
    const len = Math.min(S2T_CHARS.length, T2S_CHARS.length);
    for (let i = 0; i < len; i++) {
      const sc = S2T_CHARS[i];
      const tc = T2S_CHARS[i];
      if (sc !== tc) {
        if (!s2tMap[sc]) s2tMap[sc] = tc;
        if (!t2sMap[tc]) t2sMap[tc] = sc;
      }
    }
  }

  // 词组级修正表（防止「谷歌」被单字转为「穀歌」，并补全高频词组如「推荐 -> 推薦」「安装 -> 安裝」「昵称 -> 暱稱」）
  const S2T_PHRASES = [
    ['谷歌', '__GOOGLE_CN__'],
    ['安装', '安裝'],
    ['推荐', '推薦'],
    ['昵称', '暱稱'],
    ['点赞', '點讚'],
    ['奖杯', '獎盃'],
    ['标签', '標籤'],
    ['账户', '帳戶'],
    ['账号', '帳號'],
    ['内购', '內購'],
    ['关注', '關注'],
    ['用户', '用戶'],
    ['装扮', '裝扮'],
    ['服装', '服裝']
  ];

  const T2S_PHRASES = [
    ['穀歌', '谷歌'],
    ['安裝', '安装'],
    ['推薦', '推荐'],
    ['暱稱', '昵称'],
    ['點讚', '点赞'],
    ['獎盃', '奖杯'],
    ['標籤', '标签'],
    ['帳戶', '账户'],
    ['帳號', '账号'],
    ['內購', '内购'],
    ['關注', '关注'],
    ['用戶', '用户'],
    ['裝扮', '装扮'],
    ['服裝', '服装'],
    ['影片', '视频']
  ];

  function convertString(str, toTraditional) {
    if (!str || typeof str !== 'string') return str;

    // 若 CDN OpenCC 已就绪则优先走词组级转换，同时保留品牌名「谷歌」
    if (global.OpenCC && typeof global.OpenCC.Converter === 'function') {
      try {
        const converter = toTraditional
          ? global.OpenCC.Converter({ from: 'cn', to: 'tw' })
          : global.OpenCC.Converter({ from: 'tw', to: 'cn' });
        let res = converter(str);
        if (toTraditional) {
          res = res.replace(/穀歌/g, '谷歌');
        }
        return res;
      } catch (_) {}
    }

    ensureCharMaps();
    let working = str;
    if (toTraditional) {
      S2T_PHRASES.forEach(([k, v]) => {
        working = working.split(k).join(v);
      });
    } else {
      T2S_PHRASES.forEach(([k, v]) => {
        working = working.split(k).join(v);
      });
    }

    const dict = toTraditional ? s2tMap : t2sMap;
    let out = '';
    for (let i = 0; i < working.length; i++) {
      const ch = working[i];
      out += dict[ch] || ch;
    }
    if (toTraditional) {
      out = out.replace(/__GOOGLE_CN__/g, '谷歌');
    }
    return out;
  }

  /**
   * 仅将画布海报数据（state）在简体与繁体之间一键转换，不影响编辑栏界面语言
   */
  function convertPosterStateLanguage(state, toTraditional) {
    const conv = (s) => convertString(s, toTraditional);

    if (state.steps) {
      state.steps.step1 = conv(state.steps.step1);
      state.steps.step2 = conv(state.steps.step2);
      state.steps.step3 = conv(state.steps.step3);
      if (state.steps.step3Prefix) {
        state.steps.step3Prefix = conv(state.steps.step3Prefix);
      }
    }

    if (state.playEntry) {
      state.playEntry.appName = conv(state.playEntry.appName);
      state.playEntry.installText = conv(state.playEntry.installText);
      state.playEntry.inAppText = conv(state.playEntry.inAppText);
      state.playEntry.reviews = conv(state.playEntry.reviews);
      state.playEntry.ageText = conv(state.playEntry.ageText);
    }

    if (state.navModule) {
      if (Array.isArray(state.navModule.topTabs)) {
        state.navModule.topTabs = state.navModule.topTabs.map(conv);
      }
      if (Array.isArray(state.navModule.bottomTabs)) {
        state.navModule.bottomTabs.forEach((item) => {
          item.label = conv(item.label);
        });
      }
    }

    if (state.userModule) {
      state.userModule.searchQuery = conv(state.userModule.searchQuery);
      state.userModule.cancelText = conv(state.userModule.cancelText);
      state.userModule.sectionTitle = conv(state.userModule.sectionTitle);
      state.userModule.nickname = conv(state.userModule.nickname);
      state.userModule.age = conv(state.userModule.age);
      state.userModule.region = conv(state.userModule.region);
      state.userModule.distance = conv(state.userModule.distance);
      state.userModule.bioTag = conv(state.userModule.bioTag);
      state.userModule.userId = conv(state.userModule.userId);
    }

    if (state.feedModule && Array.isArray(state.feedModule.cards)) {
      state.feedModule.cards.forEach((card) => {
        card.overlayTitle = conv(card.overlayTitle);
        card.overlaySubtitle = conv(card.overlaySubtitle);
        card.footerTitle = conv(card.footerTitle);
      });
    }

    state.posterLang = toTraditional ? 'zh-TW' : 'zh-CN';
  }

  global.LayaPersistence = {
    saveMediaBlob,
    deleteMediaBlob,
    loadAllMediaBlobs,
    saveStateNow,
    scheduleSaveState,
    loadSavedState,
    clearAllSavedData
  };

  global.LayaPosterLang = {
    convertString,
    convertPosterStateLanguage
  };
})(window);
