/** Допустимые id сегментов маркетинговых каналов. */
export const CHANNEL_SEGMENT_IDS = [
  'social_instagram',
  'social_telegram',
  'social_vk',
  'context',
  'direct',
];

/** Определение сегмента по названию канала (если в данных нет поля segment). */
export function inferChannelSegment(name) {
  const n = String(name || '').toLowerCase();
  if (/instagram|инстаграм|insta/.test(n)) return 'social_instagram';
  if (/telegram|телеграм|\btg\b/.test(n)) return 'social_telegram';
  if (/\bvk\b|вконтакте|vkontakte/.test(n)) return 'social_vk';
  if (/google|директ|яндекс|context|ads|контекст|рекламн/.test(n)) return 'context';
  return 'direct';
}
