import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
  RequestType,
  TopicCreateTransaction,
  TopicInfoQuery,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
  Status,
  KeyList,
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";
import ConsensusSubmitMessage = RequestType.ConsensusSubmitMessage;
import dotenv from "dotenv";

dotenv.config();

// Pre-configured client for test network (testnet)
const client = Client.forTestnet();

//Set the operator with the account ID and private key
const operatorIdStr = process.env.MY_ACCOUNT_ID;
const operatorKeyStr = process.env.MY_PRIVATE_KEY;

if (!operatorIdStr || !operatorKeyStr) {
  throw new Error(
    "Missing environment variables: MY_ACCOUNT_ID or MY_PRIVATE_KEY"
  );
}
const operatorId = AccountId.fromString(operatorIdStr);
const operatorKey = PrivateKey.fromStringECDSA(operatorKeyStr);

// console.log(" User Account: ", operatorIdStr);

// The client operator ID and key is the account that will be automatically set to pay for the transaction fees for each transaction
client.setOperator(operatorId, operatorKey);

Given(
  /^a first account with more than (\d+) hbars$/,
  async function (expectedBalance: number) {
    const acc = accounts[0];
    // console.log("Acc ", acc);

    const account: AccountId = AccountId.fromString(acc.id);
    this.account = account;
    const privKey: PrivateKey = PrivateKey.fromStringECDSA(acc.privateKey);
    this.privKey = privKey;
    // console.log('Account', this.account);
    // console.log('privKey', this.privKey);

    client.setOperator(this.account, privKey);

    //Create the query request
    const query = new AccountBalanceQuery().setAccountId(account);
    const balance = await query.execute(client);
    assert.ok(
      balance.hbars.toBigNumber().toNumber() > expectedBalance,
      `Account HBAR balance ${balance} is not more than expected amount of ${expectedBalance}`
    );
  }
);

When(
  /^A topic is created with the memo "([^"]*)" with the first account as the submit key$/,
  async function (memo: string) {
    // console.log("Memo: ", memo);
    // console.log("Priv Key", this.privKey);

    const tx = await new TopicCreateTransaction()
      .setSubmitKey(this.privKey)
      .setTopicMemo(memo)
      .execute(client);

    const receipt = await tx.getReceipt(client);
    this.topicId = receipt.topicId;
    // console.log("Receipt ", receipt);
    // console.log("Topic Id ", receipt.topicId?.toString());
  }
);

When(
  /^The message "([^"]*)" is published to the topic$/,
  async function (message: string) {
    const tx = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(message)
      .execute(client);
    const receipt = await tx.getReceipt(client);
    // console.log("Receipt ", receipt);
    assert.strictEqual(
      receipt.status,
      Status.Success,
      "Message submission failed"
    );
  }
);

Then(
  /^The message "([^"]*)" is received by the topic and can be printed to the console$/,
  { timeout: 40000 },
  async function (message: string) {
    const receivedMessage = await new Promise<string>((resolve, reject) => {
      const sub = new TopicMessageQuery()
        .setTopicId(this.topicId)
        .setStartTime(0)
        .subscribe(client, null, (msg) => {
          const receivedMessage = Buffer.from(msg.contents).toString("utf8");
          if (receivedMessage) {
            sub.unsubscribe();
            resolve(receivedMessage);
          }
          console.log(`Received message: ${receivedMessage}`);
        });
    });
    assert.strictEqual(
      receivedMessage,
      message,
      `Publised message ${receivedMessage} and expected message: ${message} are no same`
    );
  }
);

Given(
  /^A second account with more than (\d+) hbars$/,
  async function (expectedBalance: number) {
    const secondAcc = accounts[1];
    const secondAccount: AccountId = AccountId.fromString(secondAcc.id);
    this.secondAccount = secondAccount;
    const secondAccPrivKey: PrivateKey = PrivateKey.fromStringECDSA(
      secondAcc.privateKey
    );
    this.secondAccPrivKey = secondAccPrivKey;
    client.setOperator(this.secondAccount, secondAccPrivKey);
    //Create the query request
    const query = new AccountBalanceQuery().setAccountId(secondAccount);
    const balance = await query.execute(client);
    assert.ok(
      balance.hbars.toBigNumber().toNumber() > expectedBalance,
      `Account HBAR balance ${balance} is not more than expected amount of ${expectedBalance}`
    );
  }
);

Given(
  /^A (\d+) of (\d+) threshold key with the first and second account$/,
  async function (threshold: number, total: number) {
    this.threshouldKeys = new KeyList(
      [this.privKey, this.secondAccPrivKey],
      threshold
    );
  }
);

When(
  /^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/,
  { timeout: 20000 },
  async function (memo: string) {
    const tx = new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setSubmitKey(this.threshouldKeys)
      .freezeWith(client);

    // sign the tx with required account (0th account)
    const signedTx = await tx.sign(this.privKey);
    const txRes = await signedTx.execute(client);
    const txReceipt = await txRes.getReceipt(client);
    this.topicId = txReceipt.topicId;

    console.log("Topic Id ", txReceipt.topicId?.toString());
  }
);
