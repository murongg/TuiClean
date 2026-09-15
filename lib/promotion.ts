import { compactText } from './text';

const platform = /快手|抖音|小红书|b站|哔哩哔哩|微博|视频号|tiktok|instagram|youtube/u;
const creator = /博主|主播|账号|频道|up主/u;
const explicitDetail = /浪叫|娇喘|奶子|奶沟|乳沟/u;
const intimateDetail =
  /(?:下面|裤裆|内裤)(?:的)?(?:裤子)?(?:明显|都|全|已经|开始|一片|完全|特别|早就){0,3}(?:湿|出水|流水|水(?:都)?(?:溢|流))/u;
const bodyMotion = /(?:胸口|胸部)[^，。！？]{0,8}(?:晃|抖|一起一伏|一上一下)/u;
const affair =
  /偷情|出轨|(?:老婆|媳妇|人妻)[^，。！？]{0,6}(?:背着|瞒着)[^，。！？]{0,6}(?:老公|丈夫)/u;
const eroticTone = /尺度|上头|太[^，。！？]{0,4}撩|特别骚|(?:喘|叫)[^，。！？]{0,6}(?:骚|浪)/u;
const bodyContext =
  /胸部|乳房|身材|身体|身體|(?:丰满|豐滿)[^，。！？]{0,4}(?:摇晃|搖晃|晃动|晃動)/u;
const intimateActivity =
  /(?:下面|敏感点|敏感部位|私密部位|私密区域)[^，。！？]{0,10}(?:把玩|抚摸|揉捏|挑逗|互动|探索)|(?:身体|身體)(?:的)?私密(?:探索|互动)/u;
const eroticResponse = /欲罢不能|意淫|血脉[喷贲]张/u;

export function hasAdultReferral(value: string): boolean {
  const text = compactText(value);
  if (!platform.test(text) || !creator.test(text)) return false;
  if (explicitDetail.test(text) || intimateDetail.test(text)) return true;
  // Euphemisms need all three signals. "Private" settings, intense sports and
  // engaging reviews are ordinary recommendations, so arousal wording alone
  // must not join the softer legacy score below.
  if (bodyContext.test(text) && intimateActivity.test(text) && eroticResponse.test(text))
    return true;
  // Physiological descriptions alone are common in ordinary exercise posts.
  // Softer wording needs two independent sexualized groups plus a destination.
  return [bodyMotion, affair, eroticTone].filter((pattern) => pattern.test(text)).length >= 2;
}

const profileContact = /主页|主頁|私信|联系|聯繫|加我|加群|微信|电报|telegram|\bvx\b/u;
const explicitOffer = /约(?:p(?![a-z])|炮|啪)|裸聊|陪睡/u;
const overnightOffer = /免费过夜|免費過夜/u;
const matchmaking = /实时匹配|同城匹配|同城|速配|约会|即時配對/u;
const seekingPartner = /[寻尋找求招](?:个|個|一位)?(?:长期|長期|固定|稳定|穩定)?(?:炮友|固炮)/u;
const declinedSeeking =
  /(?:不|勿|谢绝|謝絕|拒绝|拒絕|禁止)[寻尋找求招]?(?:个|個|一位)?(?:长期|長期|固定|稳定|穩定)?(?:炮友|固炮)/u;

export function hasAdultProfile(value: string): boolean {
  const name = compactText(value);
  // An explicit partner-seeking phrase already expresses solicitation intent;
  // requiring a separate contact link misses accounts using only numeric replies.
  if (seekingPartner.test(name) && !declinedSeeking.test(name)) return true;
  if (!profileContact.test(name)) return false;
  // An overnight offer can also be a hotel promotion. Matchmaking is required
  // for that ambiguous branch; explicit sexual offers already provide intent.
  return explicitOffer.test(name) || (overnightOffer.test(name) && matchmaking.test(name));
}

const invitationPersona =
  /(?:你的|坏|壞|专属|專屬)(?:姐姐|妹妹|哥哥|弟弟|学姐|學姐|学长|學長|宝贝|寶貝)/u;
const offlineInvitation = /可(?:以)?[线線]下|[线線]下(?:报名|報名|见面|見面|预约|預約)/u;

export function hasProfileSpam(nameValue: string, textValue: string): boolean {
  const name = compactText(nameValue);
  // A role name or offline event alone is not evidence. This weaker rule needs
  // all three signals and is classified as suspected spam, not explicit adult content.
  return (
    /^\d{1,3}$/.test(compactText(textValue)) &&
    invitationPersona.test(name) &&
    offlineInvitation.test(name)
  );
}
