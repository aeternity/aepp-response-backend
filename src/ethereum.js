/* eslint-disable no-console */

import Web3 from 'web3';
import SignerProvider from 'ethjs-provider-signer';
import { sign } from 'ethjs-signer';
import _ from 'lodash';
import IPFS from 'ipfs-mini';
import Bluebird from 'bluebird';
import BigNumber from 'bignumber.js';
import ContractRegistryMeta from './assets/contracts/ContractRegistry.json';
import QuestionMeta from './assets/contracts/Question.json';

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

ipfs.addJSONAsync = Bluebird.promisify(ipfs.addJSON);
ipfs.catJSONAsync = Bluebird.promisify(ipfs.catJSON);

export const subscribeForQuestions = async (handler) => {
  const networkId = await web3.eth.net.getId();
  console.log('network id', networkId);
  const registryAddress = ContractRegistryMeta.networks[networkId].address;
  console.log('registry address', registryAddress);
  const registry = new web3.eth.Contract(ContractRegistryMeta.abi, registryAddress);

  let fetchedQuestionsCount = 0;
  const fetchQuestions = async () => {
    try {
      const questionsCount = +await registry.methods.getContractsCount().call();
      if (questionsCount < fetchedQuestionsCount) {
        throw new Error(`questions count is invalid: ${questionsCount} can't be less then ${fetchedQuestionsCount}`);
      }

      await Promise.all(_.times(questionsCount - fetchedQuestionsCount, async (i) => {
        const idx = i + fetchedQuestionsCount;
        const questionAddress = await registry.methods.contracts(idx).call();
        const question = new web3.eth.Contract(QuestionMeta.abi, questionAddress);
        const [
          account, amount, ipfsHash, deadline, tweetId, foundationId,
        ] = await Promise.all([
          question.methods.twitterAccount().call(),
          question.methods.donations().call(),
          question.methods.question().call(),
          question.methods.deadline().call(),
          question.methods.tweetId().call(),
          question.methods.charity().call(),
        ]);
        handler({
          id: questionAddress,
          account,
          amount: +(new BigNumber(amount)).shift(-decimals),
          title: (await ipfs.catJSONAsync(ipfsHash)).title,
          deadline: new Date(deadline * 1000),
          tweetId: tweetId === '0' ? 0 : tweetId,
          foundationId,
        });
      }));

      console.log('fetch questions', questionsCount - fetchedQuestionsCount);
      fetchedQuestionsCount = questionsCount;
    } catch (e) {
      console.error('fetch questions failed', e);
    }
  };

  await fetchQuestions();
  setInterval(fetchQuestions, 15 * 1000);
};

export const setQuestionAnswer = async (questionAddress, tweetId) => {
  const question = new web3.eth.Contract(QuestionMeta.abi, questionAddress);
  await question.methods.answer(tweetId).send({
    from: WEB3_ACCOUNT_ADDRESS,
    gas: 100000,
  });
};
