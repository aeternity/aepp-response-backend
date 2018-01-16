/* eslint-disable no-console */

import Web3 from 'web3';
import SignerProvider from 'ethjs-provider-signer';
import { sign } from 'ethjs-signer';
import _ from 'lodash';
import IPFS from 'ipfs-mini';
import Bluebird from 'bluebird';
import BigNumber from 'bignumber.js';
import bs58 from 'bs58';
import Response from './assets/contracts/Response.json';

const {
  WEB3_PROVIDER_URL,
  WEB3_ACCOUNT_ADDRESS,
  WEB3_ACCOUNT_PRIVATE_KEY,
} = process.env;

const web3 = new Web3(new SignerProvider(WEB3_PROVIDER_URL, {
  signTransaction: (rawTx, cb) => cb(null, sign(rawTx, WEB3_ACCOUNT_PRIVATE_KEY)),
  accounts: cb => cb(null, [WEB3_ACCOUNT_ADDRESS]),
}));
const ipfs = new IPFS({ host: 'ipfs.infura.io', port: 5001, protocol: 'https' });
const decimals = 18;
const setQuestionTweetIdGasLimit = 43000;
const setAnswerTweetIdGasLimit = 70000;
const sendOptions = {
  from: WEB3_ACCOUNT_ADDRESS,
  gas: 100000,
};
let response;

ipfs.catJSONAsync = Bluebird.promisify(ipfs.catJSON);

const getQuestionContent = ipfsHash =>
  ipfs.catJSONAsync(bs58.encode(Buffer.from(`1220${ipfsHash.slice(2)}`, 'hex')));

export const subscribeForQuestions = async (handler) => {
  const networkId = await web3.eth.net.getId();
  console.log('network id', networkId);
  const responseAddress = Response.networks[networkId].address;
  console.log('registry address', responseAddress);
  response = new web3.eth.Contract(Response.abi, responseAddress);

  const updateBackendFee = async () => {
    try {
      sendOptions.gasPrice = await web3.eth.getGasPrice();
      const backendFee = await response.methods.backendFee().call();
      const newBackendFee = (new BigNumber(sendOptions.gasPrice))
        .mul(setQuestionTweetIdGasLimit + setAnswerTweetIdGasLimit);
      if (!newBackendFee.equals(backendFee)) {
        await response.methods.setBackendFee(newBackendFee).send(sendOptions);
        console.log('update backend fee', +newBackendFee.shift(-decimals));
      }
    } catch (e) {
      console.error('update backend fee failed', e);
    }
  };

  await updateBackendFee();
  setInterval(updateBackendFee, 24 * 60 * 60 * 1000);

  let fetchedQuestionCount = 0;
  const fetchQuestions = async () => {
    try {
      const questionCount = +await response.methods.questionCount().call();
      if (questionCount < fetchedQuestionCount) {
        throw new Error(`question count is invalid: ${questionCount} can't be less then ${fetchedQuestionCount}`);
      }

      await Promise.all(_.times(questionCount - fetchedQuestionCount, async (i) => {
        const idx = i + fetchedQuestionCount;
        const {
          twitterUserId, content, foundation,
          createdAt, tweetId, answered, amount,
        } = { ...await response.methods.questions(idx).call() };
        handler({
          id: String(idx),
          twitterUserId,
          amount: +(new BigNumber(amount)).shift(-decimals),
          title: (await getQuestionContent(content)).title,
          createdAt: new Date(createdAt * 1000),
          tweetId: tweetId === '0' ? 0 : tweetId,
          answered,
          foundationId: foundation,
        });
      }));

      console.log('fetch questions', questionCount - fetchedQuestionCount);
      fetchedQuestionCount = questionCount;
    } catch (e) {
      console.error('fetch questions failed', e);
    }
  };

  await fetchQuestions();
  setInterval(fetchQuestions, 15 * 1000);
};

export const setQuestionTweetId = (questionIdx, tweetId) =>
  response.methods.setQuestionTweetId(questionIdx, tweetId)
    .send({ ...sendOptions, gas: setQuestionTweetIdGasLimit });

export const setAnswerTweetId = (questionIdx, tweetId) =>
  response.methods.setAnswerTweetId(questionIdx, tweetId)
    .send({ ...sendOptions, gas: setAnswerTweetIdGasLimit });
