import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
  TokenCreateTransaction,
  TokenSupplyType,
  TokenType,
  Status,
  TokenInfoQuery,
  TokenMintTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  TransactionId,
} from "@hashgraph/sdk";
import assert from "node:assert";

import dotenv from "dotenv";

dotenv.config();

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
client.setOperator(operatorId, operatorKey);

//============================== Custom Functions =======================================
/**
 * 1. Token Association Function
 * it is used to associate a token to an account
 * should be called before token transfer
 * @param TokenId,
 * @param AccountId
 * @param AccountPrivKey
 * // token id type: shardNum.realmNum.tokenNum
 */

async function tokenAssociation(
  accountId: AccountId,
  tokenId: any,
  accountPrivKey: PrivateKey
) {
  try {
    const tx = new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds([tokenId])
      .freezeWith(client);

    const signTx = await tx.sign(accountPrivKey);
    const txRes = await signTx.execute(client);
    const txReceipt = await txRes.getReceipt(client);
    assert.strictEqual(
      txReceipt.status,
      Status.Success,
      "Failed to associate a token with account"
    );
  } catch (error) {
    // console.log("Error while tokenAssociation Transaction", error);
  }
}

/**
 * 2. Mint Tokens
 */

async function mintTokens(
  tokenId: string,
  tokenAmount: number,
  treasuryAccKey: PrivateKey
) {
  //mint given no of tokens to first account
  try {
    const mintTx = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setAmount(tokenAmount)
      .freezeWith(client);

    const signTx = await mintTx.sign(treasuryAccKey);
    const txRes = await signTx.execute(client);

    const txReceipt = await txRes.getReceipt(client);
    assert.strictEqual(
      txReceipt.status,
      Status.Success,
      "Failed to mint new tokens"
    );
  } catch (error) {
    console.log("Error while mintTokens Transaction", error);
  }
}

/**
 * 3. Transfer Tokens
 */
async function transferTokens(
  tokenId: any,
  toAccountId: AccountId,
  treasuryAccountId: AccountId,
  treasuryAccKey: PrivateKey,
  tokenAmount: number
) {
  try {
    const tx = new TransferTransaction()
      .addTokenTransfer(tokenId, treasuryAccountId, -tokenAmount)
      .addTokenTransfer(tokenId, toAccountId, tokenAmount)
      .freezeWith(client);

    const signTx = await tx.sign(treasuryAccKey);
    const txRes = await signTx.execute(client);
    const txReceipt = await txRes.getReceipt(client);
    assert.strictEqual(
      txReceipt.status,
      Status.Success,
      "Failed to transfer tokens"
    );
  } catch (error) {
    console.log("Error while transferTokens Transaction", error);
  }
}
//============================== End of Custom Functions ======================================

Given(
  /^A Hedera account with more than (\d+) hbar$/,
  async function (expectedBalance: number) {
    const account = accounts[0];
    const MY_ACCOUNT_ID = AccountId.fromString(account.id);
    const MY_PRIVATE_KEY = PrivateKey.fromStringECDSA(account.privateKey);
    client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);
    this.accountId = MY_ACCOUNT_ID;
    this.privKey = MY_PRIVATE_KEY;

    //Create the query request
    const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
    const balance = await query.execute(client);

    console.log("Balance ", balance.hbars.toBigNumber().toNumber());

    assert.ok(
      balance.hbars.toBigNumber().toNumber() > expectedBalance,
      `Account HBAR balance ${balance} is not more than expected amount of ${expectedBalance}`
    );
  }
);

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const tx = await new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setDecimals(2)
    .setInitialSupply(0)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTokenType(TokenType.FungibleCommon)
    .setAdminKey(this.privKey)
    .setSupplyKey(this.privKey)
    .setTreasuryAccountId(this.accountId)
    .setFreezeDefault(false)
    .freezeWith(client)
    .execute(client);

  const txReceipt = await tx.getReceipt(client);
  //   console.log("Tx ", txReceipt);

  this.tokenId = txReceipt?.tokenId;

  assert.strictEqual(
    txReceipt.status,
    Status.Success,
    "Failed to create a Token"
  );
});

Then(/^The token has the name "([^"]*)"$/, async function (tokenName: string) {
  const token = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);
  assert.strictEqual(token.name, tokenName, `Token Name does not match`);
});

Then(
  /^The token has the symbol "([^"]*)"$/,
  async function (tokenSymbol: string) {
    const token = await new TokenInfoQuery()
      .setTokenId(this.tokenId)
      .execute(client);
    assert.strictEqual(
      token.symbol,
      tokenSymbol,
      `Token Symbol does not match`
    );
  }
);

Then(/^The token has (\d+) decimals$/, async function (tokenDecimal: number) {
  const token = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);
  assert.strictEqual(
    token.decimals,
    tokenDecimal,
    `Token Decimals does not match`
  );
});

Then(/^The token is owned by the account$/, async function () {
  const token = await new TokenInfoQuery()
    .setTokenId(this.tokenId)
    .execute(client);
  assert.ok(token.treasuryAccountId, "Treasury account ID is not set");

  assert.strictEqual(
    token.treasuryAccountId?.toString(),
    this.accountId.toString(),
    `Token Owner does not match`
  );
});

Then(
  /^An attempt to mint (\d+) additional tokens succeeds$/,
  async function (tokenAmount: number) {
    const tx = await new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(tokenAmount)
      .execute(client);

    const txReceipt = await tx.getReceipt(client);
    assert.strictEqual(
      txReceipt.status,
      Status.Success,
      "Failed to mint new tokens"
    );
  }
);

When(
  /^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/,
  async function (initialSupply: number) {
    const tx = await new TokenCreateTransaction()
      .setTokenName("Test Token")
      .setTokenSymbol("HTT")
      .setDecimals(2)
      .setInitialSupply(initialSupply)
      .setTreasuryAccountId(this.accountId)
      .setSupplyType(TokenSupplyType.Finite)
      .setTokenType(TokenType.FungibleCommon)
      .setMaxSupply(initialSupply)
      .setAdminKey(this.privKey)
      .freezeWith(client)
      .execute(client);

    const txReceipt = await tx.getReceipt(client);
    this.tokenId = txReceipt.tokenId;
    assert.strictEqual(
      txReceipt.status,
      Status.Success,
      "Failed to create a Token"
    );
  }
);
Then(
  /^The total supply of the token is (\d+)$/,
  async function (totalSupply: number) {
    const token = await new TokenInfoQuery()
      .setTokenId(this.tokenId)
      .execute(client);
    assert.strictEqual(
      token.totalSupply.toNumber(),
      totalSupply,
      `Total Supply does not match`
    );
  }
);
Then(/^An attempt to mint tokens fails$/, async function () {
  try {
    const tx = await new TokenMintTransaction()
      .setTokenId(this.tokenId)
      .setAmount(9)
      .execute(client);
    const txReceipt = await tx.getReceipt(client);
    // console.log(txReceipt);

    assert.fail("it shouldn't mint new tokens for fixed supply tokens");
  } catch (error: any) {
    // console.log(error);
    assert.ok(error.toString().includes("TOKEN_HAS_NO_SUPPLY_KEY"));
  }
});

Given(
  /^A first hedera account with more than (\d+) hbar$/,
  async function (expectedHBAR: number) {
    const account = accounts[1];
    const accountId = AccountId.fromString(account.id);
    const privateKey = PrivateKey.fromStringECDSA(account.privateKey);

    this.firstAccountId = accountId;
    this.firstAccountPrivKey = privateKey;
    client.setOperator(accountId, privateKey);

    const balance = await new AccountBalanceQuery()
      .setAccountId(accountId)
      .execute(client);

    assert.ok(
      balance.hbars.toBigNumber().toNumber() > expectedHBAR,
      `Account balance ${balance} is not more than the expected balance ${expectedHBAR}`
    );
  }
);
Given(/^A second Hedera account$/, async function () {
  const account = accounts[2];
  this.secondAccountId = AccountId.fromString(account.id);
  this.secondAccountPrivateKey = PrivateKey.fromStringED25519(
    account.privateKey
  );
  client.setOperator(this.secondAccountId, this.secondAccountPrivateKey);
});
Given(
  /^A token named Test Token \(HTT\) with (\d+) tokens$/,
  { timeout: 40000 },
  async function (initialSupply: number) {
    const account = accounts[0];
    const accountId = AccountId.fromString(account.id);
    const privateKey = PrivateKey.fromStringECDSA(account.privateKey);

    this.accountId = accountId;
    this.privKey = privateKey;
    client.setOperator(accountId, privateKey);

    const tx = await new TokenCreateTransaction()
      .setTokenName("Test Token")
      .setTokenSymbol("HTT")
      .setDecimals(2)
      .setInitialSupply(initialSupply)
      .setTreasuryAccountId(accountId)
      .setSupplyType(TokenSupplyType.Infinite)
      .setTokenType(TokenType.FungibleCommon)
      .setSupplyKey(privateKey.publicKey)
      .setAdminKey(privateKey.publicKey)
      .freezeWith(client)
      .execute(client);

    const txReceipt = await tx.getReceipt(client);
    this.tokenId = txReceipt.tokenId;
    this.initialSupply = initialSupply;

    assert.strictEqual(
      txReceipt.status,
      Status.Success,
      "Failed to create a Token"
    );
  }
);
Given(
  /^The first account holds (\d+) HTT tokens$/,
  { timeout: 40000 },
  async function (tokenAmount: number) {
    await tokenAssociation(
      this.firstAccountId,
      this.tokenId,
      this.firstAccountPrivKey
    );

    await mintTokens(this.tokenId, tokenAmount, this.privKey);
    //TODO: transfer the tokens to given account
    await transferTokens(
      this.tokenId,
      this.firstAccountId,
      this.accountId,
      this.privKey,
      tokenAmount
    );

    const queryTx = await new AccountBalanceQuery()
      .setAccountId(this.firstAccountId)
      .execute(client);

    const balance = queryTx.tokens?.get(this.tokenId)?.toNumber();
    assert.strictEqual(tokenAmount, balance, `Token balance does not match`);

    // console.log("Query", queryTx.tokens?._map.get(this.tokenId.toString()));
    // console.log("Balance: ", queryTx.tokens?.get(this.tokenId)?.toNumber());
  }
);
Given(
  /^The second account holds (\d+) HTT tokens$/,
  async function (tokenAmount: number) {
    await tokenAssociation(
      this.secondAccountId,
      this.tokenId,
      this.secondAccountPrivateKey
    );

    const queryTx = await new AccountBalanceQuery()
      .setAccountId(this.secondAccountId)
      .execute(client);
    const balance = queryTx.tokens?.get(this.tokenId)?.toNumber();
    // console.log("Balance: ", queryTx.tokens?.get(this.tokenId)?.toNumber());
    assert.strictEqual(tokenAmount, balance, `Token balance does not match`);

    // console.log("Query", queryTx.tokens?._map.get(this.tokenId.toString()));
  }
);

When(
  /^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/,
  async function (tokenAmount: number) {
    // create a txId before hand from the first account
    const txId = TransactionId.generate(this.firstAccountId);

    this.transferTx = new TransferTransaction()
      .addTokenTransfer(this.tokenId, this.firstAccountId, -tokenAmount)
      .addTokenTransfer(this.tokenId, this.secondAccountId, tokenAmount)
      .setTransactionId(txId)
      .setTransactionValidDuration(120)
      // .setNodeAccountIds([this.secondAccountId])
      .setNodeAccountIds([new AccountId(3)])
      .freezeWith(client);
  }
);
When(/^The first account submits the transaction$/, async function () {
  const signTransferTx = await this.transferTx.sign(this.firstAccountPrivKey);
  const txRes = await signTransferTx.execute(client);
  const txReceipt = await txRes.getReceipt(client);
  this.txReceipt = txReceipt;

  assert.strictEqual(
    txReceipt.status,
    Status.Success,
    "Failed to transfer a Token"
  );
});

// TODO: Note: muliple step function declaration of same feature is note required.
// gives error as  Multiple step definitions match:

When(
  /^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/,
  async function (tokenAmount: number) {
    const txId = TransactionId.generate(this.secondAccountId);

    this.transferTx = new TransferTransaction()
      .addTokenTransfer(this.tokenId, this.secondAccountId, -tokenAmount)
      .addTokenTransfer(this.tokenId, this.firstAccountId, tokenAmount)
      .setTransactionId(txId)
      .setTransactionValidDuration(120)
      // .setNodeAccountIds([this.firstAccountId])
      .setNodeAccountIds([new AccountId(3)])
      .freezeWith(client);
  }
);
Then(
  /^The first account has paid for the transaction fee$/,
  { timeout: 30000 },
  async function () {
    const receipt = await this.txReceipt.getRecord(client);
    console.log("receipt ", receipt);
  }
);

// Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function () {

// });
// Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

// });
// Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

// });
// Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

// });
// When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function () {

// });
// Then(/^The third account holds (\d+) HTT tokens$/, async function () {

// });
// Then(/^The fourth account holds (\d+) HTT tokens$/, async function () {

// });
