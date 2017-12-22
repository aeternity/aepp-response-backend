/* eslint-disable no-console */

import pluralize from 'pluralize';
import _ from 'lodash';
import fetch from 'node-fetch';
import { twitter, userId, usersShow } from './twitter';
import { subscribeForQuestions, setQuestionTweetId, setAnswerTweetId } from './ethereum';

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
const tweetTemplate = (account, title, amount, amountInUSD, foundationName, questionId) =>
  [
    `@${account}, ${title}\n\n`,
    `Reply to this via a video answer and ${pluralize('Æ token', amount, true)} `,
    `($${amountInUSD} USD) will get donated to ${foundationName}. `,
    `Go here for more info https://response.aepps.com/question/${questionId}`,
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

  const reopenStream = _.throttle(() => {
    try {
      if (stream) stream.destroy();
      Object.keys(questions).forEach((qId) => {
        if (questions[qId].deadlineAt < new Date()) delete questions[qId];
      });
      const follow = Array.from(new Set(Object.values(questions)
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
          if (question.deadlineAt < new Date()) {
            delete questions[questionId];
            return;
          }
          if (question.twitterUserId !== tweet.user.id_str) return;
          delete questions[questionId];
          await setAnswerTweetId(questionId, tweet.id_str);
          console.log('reply tweet', questionId, tweet.id_str);
        } catch (e) {
          console.error('reply tweet failed', e);
        }
        reopenStream();
      });
      stream.on('error', e => console.error('stream error', e));
      console.log('stream follow', follow);
    } catch (e) {
      console.error('stream failed', e);
    }
  }, 10000, { leading: false });

  reopenStream();

  await subscribeForQuestions(async ({
    id, twitterUserId, amount, title, deadlineAt, questionTweetId, answerTweetId, foundationId,
  }) => {
    try {
      if (!answerTweetId && deadlineAt > new Date()) {
        questions[id] = { twitterUserId, deadlineAt, questionTweetId };
        if (!questions[id].questionTweetId) {
          const { screen_name } = await usersShow(twitterUserId);
          const r = await fetch('https://min-api.cryptocompare.com/data/price?fsym=AE&tsyms=USD');
          const { USD } = await r.json();
          const foundation = foundations[foundationId].name;
          const { id_str: tweetId } = await twitter.post('statuses/update', {
            status: tweetTemplate(screen_name, title, amount, USD * amount, foundation, id),
            tweet_mode: 'extended',
          });
          questions[id].questionTweetId = tweetId;
          setQuestionTweetId(id, tweetId);
        }
        reopenStream();
      }
      console.log('question contract', id);
    } catch (e) {
      console.error('question contract failed', e);
    }
  });

  console.log('listener running');
})().catch(e => console.error('listener error', e));
