export const RULES = [
  {
    id: 'adult-solicitation',
    category: 'adult',
    name: '色情招揽与引流',
    description: '明确的色情招揽词与私信、主页或外链导流同时出现。',
  },
  {
    id: 'adult-hint',
    category: 'adult',
    name: '疑似成人内容',
    description: '出现成人内容线索但证据不足，标为疑似；按所选模式折叠或标注。',
  },
  {
    id: 'adult-bait',
    category: 'adult',
    name: '挑逗式引流话术',
    description: '匹配完整的成对自我比较话术，忽略表情和隐形字符；单条内容也可识别。',
  },
  {
    id: 'adult-referral',
    category: 'adult',
    name: '站外成人内容引流',
    description:
      '其他平台的博主推荐，加上露骨描述或多组性暗示。普通健身与软件分享不因平台名称单独命中。',
  },
  {
    id: 'adult-profile',
    category: 'adult',
    name: '昵称招揽引流',
    description:
      '昵称明确寻找成人伴侣，或同时出现成人招揽和联系信息；不依据头像、性别或账号语言判断。',
  },
  {
    id: 'spam-profile',
    category: 'spam',
    name: '昵称线下招揽',
    description:
      '招揽式自称与线下邀约同时出现在昵称中，正文仅为短数字且无媒体时标为疑似广告；普通称呼或活动报名不会单独命中。',
  },
  {
    id: 'spam-solicitation',
    category: 'spam',
    name: '高风险广告招揽',
    description: '刷单、博彩或保证收益类话术与招揽动作同时出现。',
  },
  {
    id: 'spam-hint',
    category: 'spam',
    name: '疑似广告话术',
    description: '存在高风险广告用语但缺少组合证据，标为疑似；按所选模式处理。',
  },
  {
    id: 'spam-template',
    category: 'spam',
    name: '跨账号模板刷屏',
    description:
      '帖文详情中，多个账号使用相同文字模板时命中。默认折叠，可展开；重复本身不等于色情内容。',
  },
] as const;

export const adultPattern =
  /裸聊|约炮|福利姬|成人资源|成人视频|私房视频|无码资源|色情|\bporn\b|\bnudes?\b|\bonlyfans\b|\bnsfw\b/i;
export const spamPattern =
  /刷单返佣|代开发票|代办证件|博彩|娱乐城|稳赚不赔|保本高收益|免费领币|包赢|日赚\d+|guaranteed\s*(?:profit|returns)|double\s*your\s*(?:money|crypto)/i;
export const contactPattern =
  /私信|加我|主页|加群|领取|领任务|点击|链接|电报|微信|[微薇]信|vx[:：]|telegram|t\.me\/|link\s*in\s*bio|\bdm\b|click\s*(?:here|link)|join\s*(?:us|now)/i;
export const contextPattern =
  /科普|新闻|警惕|举报|切勿|不要相信|反诈|识别规则|过滤插件|屏蔽工具|防范|打击|beware|scam\s*warning|educational/i;

// Require both comparison halves, not a single suggestive word. This covers
// a family of solicitation templates without depending on names or peers.
const appearance = '(?:好看|漂亮|俊俏|俊|美|帅)';
const teasing = '(?:骚|浪)';
const comparison = '的?(?:都)?(?:没有|没|不如)我';
const appearanceFirst = `比我${appearance}${comparison}${teasing}`;
const teasingFirst = `比我${teasing}${comparison}${appearance}`;
const separator = '[\\p{P}]{0,4}';
export const comparisonBaitPattern = new RegExp(
  `(?:${appearanceFirst}${separator}${teasingFirst}|${teasingFirst}${separator}${appearanceFirst})`,
  'u',
);
