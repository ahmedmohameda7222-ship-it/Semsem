export type DailyMessage = {
  id: string
  title: string
  message: string
  emoji: string
}

/** Statements of affection, never tasks or requests requiring an answer. */
export const dailyMessages: readonly DailyMessage[] = [
  { id: 'i_love_you', title: 'I love you ❤️', message: 'I love you so much, mi amor ❤️', emoji: '❤️' },
  { id: 'thinking_of_you', title: 'Thinking of you all day 🥰', message: 'You have been on my mind all day 🥰', emoji: '🥰' },
  { id: 'love_you_more', title: 'I love you more every day 💗', message: 'My love for you grows a little more every day 💗', emoji: '💗' },
  { id: 'favorite_person', title: 'My favorite person 🌷', message: 'You are my favorite person in the whole world 🌷', emoji: '🌷' },
  { id: 'missing_you', title: 'I miss you ❤️', message: 'I miss you, even in the middle of a busy day ❤️', emoji: '❤️' },
  { id: 'good_morning', title: 'Good morning, love ☀️', message: 'Good morning, my love. You are my first happy thought ☀️', emoji: '☀️' },
  { id: 'good_night', title: 'Good night, my heart 🌙', message: 'Sleep well, my love. I am sending you all my love 🌙', emoji: '🌙' },
  { id: 'proud_of_you', title: 'I am proud of you ✨', message: 'I am so proud of you and everything you do ✨', emoji: '✨' },
  { id: 'beautiful_smile', title: 'Your smile makes my day 😊', message: 'Just thinking about your smile makes my whole day better 😊', emoji: '😊' },
  { id: 'always_here', title: 'I am always here 🫶', message: 'No matter how your day goes, I am always here for you 🫶', emoji: '🫶' },
  { id: 'grateful', title: 'So grateful for you 💕', message: 'I am grateful that I get to love you every day 💕', emoji: '💕' },
  { id: 'sending_love', title: 'Sending you all my love 💌', message: 'A little reminder that my heart is with you today 💌', emoji: '💌' },
  { id: 'your_voice', title: 'Your voice is my favorite 🎶', message: 'Hearing your voice always makes me smile 🎶', emoji: '🎶' },
  { id: 'made_me_smile', title: 'You made me smile today 😘', message: 'You made me smile today without even trying 😘', emoji: '😘' },
  { id: 'you_are_home', title: 'You feel like home 🏡', message: 'Wherever you are feels like home to me 🏡', emoji: '🏡' },
  { id: 'wish_here', title: 'Wish you were here 💖', message: 'I wish I could be next to you right now 💖', emoji: '💖' },
  { id: 'my_person', title: 'You are my person 💞', message: 'Every day I choose you, my person 💞', emoji: '💞' },
  { id: 'little_hug', title: 'A little hug from me 🤗', message: 'Sending you a big warm hug through the screen 🤗', emoji: '🤗' },
  { id: 'beautiful_soul', title: 'You have a beautiful soul 🌸', message: 'I love your beautiful heart and the way you see the world 🌸', emoji: '🌸' },
  { id: 'brightest_part', title: 'The best part of my day 💓', message: 'Knowing I have you is the best part of my day 💓', emoji: '💓' },
]
