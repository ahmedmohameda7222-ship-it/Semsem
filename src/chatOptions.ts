export const reactionOptions = Array.from(
  new Intl.Segmenter().segment('❤️🩷💕💖😍🥰😘💋🫶🥹😂🤣😭🥺😊😢😮😡🔥✨👍👀'),
  (item) => item.segment,
)
