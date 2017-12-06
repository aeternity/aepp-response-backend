import pluralize from 'pluralize';
import _ from 'lodash';
import { twitter, userId } from './twitter';
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
const tweetRegexp = /^@\S+, .+\n\n\(Reply to this via a video answer and \S+ Æ \w+ will get donated to .+\. Go here for more info \S+\)$/;
const tweetTemplate = (account, title, amount, foundationName, questionId) =>
  [
    `@${account}, ${title}\n\n`,
    `(Reply to this via a video answer and ${pluralize('Æ token', amount, true)} `,
    `will get donated to ${foundationName}. `,
    `Go here for more info https://response.aepps.com/question/${questionId})`,
  ].join('');

(async () => {
  const questions = {};
  let stream;

  const addTweet = ({ id_str, entities: { user_mentions, urls } }) => {
    questions[urls.pop().expanded_url.split('/').pop()] = {
      questionTweetId: id_str,
      askedTwitterUserId: user_mentions[0].id_str,
      deadline: new Date(Date.now() + (60 * 60 * 1000)),
    };
  };

  const reopenStream = _.throttle(() => {
    if (stream) stream.destroy();
    const follow = Array.from(new Set(Object.keys(questions)
      .map(questionId => questions[questionId])
      .filter(question => !question.answered && question.deadline > new Date())
      .map(question => question.askedTwitterUserId))).join(',');
    if (!follow.length) return;
    stream = twitter.stream('statuses/filter', { follow });
    stream.on('data', async (tweet) => {
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
        question.askedTwitterUserId !== tweet.user.id_str ||
        question.answered ||
        question.deadline < new Date()
      ) return;
      await setQuestionAnswer(questionId, tweet.id_str);
      questions[questionId].answered = true;
      reopenStream();
    });
  }, 10000);

  (await twitter.get('statuses/user_timeline', {
    user_id: userId,
    trim_user: true,
    tweet_mode: 'extended',
  }))
    .filter(({ full_text }) => tweetRegexp.test(full_text))
    .forEach(addTweet);
  reopenStream();

  await subscribeForQuestions(async ({
    account, title, amount, id, foundationId, deadline, tweetId,
  }) => {
    if (!questions[id]) {
      addTweet(await twitter.post('statuses/update', {
        status: tweetTemplate(account, title, amount, foundations[foundationId].name, id),
        tweet_mode: 'extended',
      }));
    }
    questions[id].deadline = deadline;
    questions[id].answered = !!tweetId;
    if (questions[id].answered || questions[id].deadline < new Date()) reopenStream();
  });
})();