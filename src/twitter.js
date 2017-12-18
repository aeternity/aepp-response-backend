import Twitter from 'twitter';
import memoize from 'memoizee';

const {
  TWITTER_CONSUMER_KEY,
  TWITTER_CONSUMER_SECRET,
  TWITTER_ACCESS_TOKEN_KEY,
  TWITTER_ACCESS_TOKEN_SECRET,
} = process.env;

export const twitter = new Twitter({
  consumer_key: TWITTER_CONSUMER_KEY,
  consumer_secret: TWITTER_CONSUMER_SECRET,
  access_token_key: TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: TWITTER_ACCESS_TOKEN_SECRET,
});

export const userId = TWITTER_ACCESS_TOKEN_KEY.split('-')[0];

export const usersSearch = memoize((q, count) => twitter.get('users/search', { q, count }));

export const usersShow = memoize(uId =>
  twitter.get('users/show', { user_id: uId, include_entities: false }));
