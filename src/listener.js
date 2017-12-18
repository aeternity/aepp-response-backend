/* eslint-disable no-console */

import pluralize from 'pluralize';
import _ from 'lodash';
import fetch from 'node-fetch';
import { twitter, userId, usersShow } from './twitter';
import { subscribeForQuestions, setQuestionAnswer } from './ethereum';

const foundations = {
  '0xfA491DF8780761853D127A9f7b2772D688A0E3B5': {
    name: 'Refugees foundation E.V.',
    url: 'http://example.com/',
  },
  '0x45992982736870Fe45c41049C5F785d4E4cc38Ec': {
    name: 'Foundation 2',
    url: 'http://example.com/',
  },
};
const tweetRegexp = /^@\S+, .+\n\n\(Reply to this via a video answer and \S+ Æ \w+ \(\$\S+ USD\) will get donated to .+\. Go here for more info \S+\)$/;
const tweetTemplate = (account, title, amount, amountInUSD, foundationName, questionId) =>
  [
    `@${account}, ${title}\n\n`,
    `(Reply to this via a video answer and ${pluralize('Æ token', amount, true)} `,
    `($${amountInUSD} USD) will get donated to ${foundationName}. `,
    `Go here for more info https://response.aepps.com/question/${questionId})`,
  ].join('');

(async () => {
  const questions = {};
  let stream;

  setInterval(async () => {
    const {
      resources: {
        statuses: { '/statuses/user_timeline': timeLine },
        users: { '/users/search': usersSearch },
      },
    } = await twitter.get('application/rate_limit_status', {});
    console.log(
      `rate limits: timeLine ${timeLine.remaining}, search ${usersSearch.remaining},`,
      'reset at', (new Date(usersSearch.reset * 1000)).toISOString().slice(11, 16),
    );
  }, 10 * 1000);

  const addTweet = ({ id_str, entities: { user_mentions, urls } }) => {
    questions[urls.pop().expanded_url.split('/').pop()] = {
      questionTweetId: id_str,
      twitterUserId: user_mentions[0].id_str,
      deadlineAt: new Date(Date.now() + (60 * 60 * 1000)),
    };
  };

  const reopenStream = _.throttle(() => {
    try {
      if (stream) stream.destroy();
      const follow = Array.from(new Set(Object.keys(questions)
        .map(questionId => questions[questionId])
        .filter(question => !question.answered && question.deadlineAt > new Date())
        .map(question => question.twitterUserId))).join(',');
      if (!follow.length) return;
      stream = twitter.stream('statuses/filter', { follow });
      stream.on('data', async (tweet) => {
        try {
          if (tweet.in_reply_to_user_id_str !== userId) return;
          if (
            !tweet.entities.urls.find(url =>
              /https?:\/\/(www\.)?(youtube|vimeo)\.com/.test(url.expanded_url)) &&
            !(tweet.extended_entities &&
              tweet.extended_entities.media.find(media => media.type === 'video'))
          ) return;
          const questionId = Object.keys(questions).find(qId =>
            questions[qId].questionTweetId === tweet.in_reply_to_status_id_str);
          if (!questionId) return;
          const question = questions[questionId];
          if (
            question.twitterUserId !== tweet.user.id_str ||
            question.answered ||
            question.deadlineAt < new Date()
          ) return;
          await setQuestionAnswer(questionId, tweet.id_str);
          questions[questionId].answered = true;
          console.log('reply tweet', questionId, tweet.id_str);
        } catch (e) {
          console.error('reply tweet failed', e);
        }
        reopenStream();
      });
      stream.on('error', e => console.log('stream error', e));
      console.log('stream follow', follow);
    } catch (e) {
      console.log('stream failed', e);
    }
  }, 10000, { leading: false });

  const tweets = (await twitter.get('statuses/user_timeline', {
    user_id: userId,
    trim_user: true,
    tweet_mode: 'extended',
  }))
    .filter(({ full_text }) => tweetRegexp.test(full_text));
  console.log('fetched', tweets.length, 'tweets');
  tweets.forEach(addTweet);
  reopenStream();

  await subscribeForQuestions(async ({
    id, twitterUserId, amount, title, deadlineAt, tweetId, foundationId,
  }) => {
    try {
      if (!questions[id]) {
        const { screen_name } = await usersShow(twitterUserId);
        const r = await fetch('https://min-api.cryptocompare.com/data/price?fsym=AE&tsyms=USD');
        const { USD } = await r.json();
        const foundation = foundations[foundationId].name;
        addTweet(await twitter.post('statuses/update', {
          status: tweetTemplate(screen_name, title, amount, USD * amount, foundation, id),
          tweet_mode: 'extended',
        }));
      }
      questions[id].deadlineAt = deadlineAt;
      questions[id].answered = !!tweetId;
      reopenStream();
      console.log('question contract', id, questions[id].questionTweetId);
    } catch (e) {
      console.error('question contract failed', e);
    }
  });

  console.log('listener running');
})().catch(e => console.error('listener error', e));
