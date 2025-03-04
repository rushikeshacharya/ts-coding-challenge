import { Given, Then, When, setDefaultTimeout } from "@cucumber/cucumber";
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
  EvmAddress,
} from "@hashgraph/sdk";
import assert from "node:assert";

const client = Client.forTestnet();
setDefaultTimeout(15000);
client.setMirrorNetwork(["hcs.testnet.mirrornode.hedera.com:5600"]);

//Set the operator with the account ID and private key
const treasuryAccountId = process.env.MY_ACCOUNT_ID;
const treasuryKeyStr = process.env.MY_PRIVATE_KEY;

if (!treasuryAccountId || !treasuryKeyStr) {
  throw new Error(
    "Missing environment variables: MY_ACCOUNT_ID or MY_PRIVATE_KEY"
  );
}

const treasuryId: AccountId = AccountId.fromString(treasuryAccountId);
const treasuryKey: PrivateKey = PrivateKey.fromStringED25519(treasuryKeyStr);
client.setOperator(treasuryId, treasuryKey);
// client.setOperator(treasuryId, treasuryKey);

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
  treasuryAccKey: PrivateKey,
  client: any
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
    // console.log("Error while mintTokens Transaction", error);
  }
}

/**
 * 3. Transfer Tokens
 */
async function transferTokens(
  tokenId: any,
  fromAccountId: AccountId,
  toAccountId: AccountId,
  fromAccountKey: PrivateKey,
  tokenAmount: number,
  client: any
) {
  try {
    // console.log("TokenAmount", tokenAmount);

    const tx = new TransferTransaction()
      .addTokenTransfer(tokenId, fromAccountId, -tokenAmount)
      .addTokenTransfer(tokenId, toAccountId, tokenAmount)
      .freezeWith(client);

    const signTx = await tx.sign(fromAccountKey);
    const txRes = await signTx.execute(client);
    const txReceipt = await txRes.getReceipt(client);
    assert.strictEqual(
      txReceipt.status,
      Status.Success,
      "Failed to transfer tokens"
    );
  } catch (error) {
    // console.log("Error while transferTokens Transaction", error);
  }
}

/**
 * Function to adjust token balance
 */
async function adjustBalance(
  tokenId: any,
  expectedAmount: number,
  accountId: AccountId,
  accountKey: PrivateKey,
  treasuryId: AccountId,
  treasuryKey: PrivateKey
) {
  // console.log("TokenID", tokenId);
  // console.log("AccountId", tokenId);
  // console.log("accountKey", accountKey);
  // console.log("Expected Amount, ", expectedAmount);

  const balance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(client);
  const currentTokensBal = balance.tokens?.get(tokenId)?.toNumber() || 0;
  // console.log("Current BAlance: ", currentTokensBal);

  if (currentTokensBal === expectedAmount) return;

  const difference = expectedAmount - currentTokensBal;
  // console.log("Difference", difference);
  client.setOperator(treasuryId, treasuryKey);

  if (difference > 0) {
    await mintTokens(tokenId, difference, treasuryKey, client);
    await transferTokens(
      tokenId,
      treasuryId,
      accountId,
      treasuryKey,
      difference,
      client
    );
  } else {
    await transferTokens(
      tokenId,
      accountId,
      treasuryId,
      accountKey,
      -difference,
      client
    );
  }
  //check the balance

  const updatedBalance = await new AccountBalanceQuery()
    .setAccountId(accountId)
    .execute(client);
  const finalBalance = updatedBalance.tokens?.get(tokenId)?.toNumber() || 0;
  // console.log("Final BAlance:", finalBalance);

  assert.ok(finalBalance === expectedAmount, `Token balance does not match`);
}

//============================== End of Custom Functions ======================================

Given(
  /^A Hedera account with more than (\d+) hbar$/,
  async function (expectedBalance: number) {
    // initial account config
    const account = accounts[0];
    const accountId = AccountId.fromString(account.id);
    const privateKey = PrivateKey.fromStringED25519(account.privateKey);

    this.accountId = accountId;
    this.accountPrivateKey = privateKey;
    client.setOperator(accountId, privateKey);

    //Create the query request
    const query = new AccountBalanceQuery().setAccountId(accountId);
    const balance = (await query.execute(client)).hbars
      .toBigNumber()
      .toNumber();

    assert.ok(
      balance > expectedBalance,
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
    .setAdminKey(this.accountPrivateKey.publicKey)
    .setSupplyKey(this.accountPrivateKey.publicKey)
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
      .setAdminKey(this.accountPrivateKey.publicKey)
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
      .setAmount(100)
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
    const privateKey = PrivateKey.fromStringED25519(account.privateKey);

    this.firstAccountId = accountId;
    this.firstAccountPrivateKey = privateKey;
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
    const privateKey = PrivateKey.fromStringED25519(account.privateKey);

    this.accountId = accountId;
    this.accountPrivateKey = privateKey;
    client.setOperator(accountId, privateKey);

    const tx = new TokenCreateTransaction()
      .setTokenName("Test Token")
      .setTokenSymbol("HTT")
      .setDecimals(2)
      .setInitialSupply(initialSupply)
      .setTreasuryAccountId(accountId)
      .setSupplyType(TokenSupplyType.Infinite)
      .setTokenType(TokenType.FungibleCommon)
      .setSupplyKey(privateKey.publicKey)
      .setAdminKey(privateKey.publicKey)
      .freezeWith(client);

    const signTx = await tx.sign(privateKey);
    const txRes = await signTx.execute(client);
    const txReceipt = await txRes.getReceipt(client);

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
  { timeout: 30000 },
  async function (tokenAmount: number) {
    await tokenAssociation(
      this.firstAccountId,
      this.tokenId,
      this.firstAccountPrivateKey
    );

    const balance = await new AccountBalanceQuery()
      .setAccountId(this.firstAccountId)
      .execute(client);
    const currentTokensBal = balance.tokens?.get(this.tokenId)?.toNumber() || 0;
    // console.log("Current BAlance: ---->", currentTokensBal);

    await adjustBalance(
      this.tokenId,
      tokenAmount,
      this.firstAccountId,
      this.firstAccountPrivateKey,
      this.accountId,
      this.accountPrivateKey
    );
    // const balance = queryTx.tokens?.get(this.tokenId)?.toNumber();
    // assert.strictEqual(tokenAmount, balance, `Token balance does not match`);

    // console.log("Query", queryTx.tokens?._map.get(this.tokenId.toString()));
    // console.log("Balance: ", queryTx.tokens?.get(this.tokenId)?.toNumber());
  }
);
Given(
  /^The second account holds (\d+) HTT tokens$/,
  { timeout: 30000 },
  async function (tokenAmount: number) {
    await tokenAssociation(
      this.secondAccountId,
      this.tokenId,
      this.secondAccountPrivateKey
    );
    await adjustBalance(
      this.tokenId,
      tokenAmount,
      this.secondAccountId,
      this.secondAccountPrivateKey,
      this.accountId,
      this.accountPrivateKey
    );
  }
);
When(
  /^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/,
  { timeout: 30000 },
  async function (tokenAmount: number) {
    // create a txId before hand from the first account
    const txId = TransactionId.generate(this.firstAccountId);

    this.transferTx = new TransferTransaction()
      .addTokenTransfer(this.tokenId, this.firstAccountId, -tokenAmount)
      .addTokenTransfer(this.tokenId, this.secondAccountId, tokenAmount)
      .setTransactionId(txId)
      .setNodeAccountIds([new AccountId(3)])
      .freezeWith(client);
  }
);
When(
  /^The first account submits the transaction$/,
  { timeout: 30000 },
  async function () {
    const signer1 = await this.transferTx.sign(
      this.firstAccountPrivateKey
    );
    const signer2 = await signer1.sign(this.secondAccountPrivateKey);
    const txRes = await signer2.execute(client);
    const txReceipt = await txRes.getReceipt(client);
    this.txReceipt = txReceipt;
    this.txRes = txRes;
    assert.strictEqual(
      txReceipt.status,
      Status.Success,
      "Failed to transfer a Token"
    );
  }
);
When(
  /^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/,
  { timeout: 30000 },
  async function (tokenAmount: number) {
    const txId = TransactionId.generate(this.firstAccountId);
    //TODO: call transferFunction here
    this.transferTx = new TransferTransaction()
      .addTokenTransfer(this.tokenId, this.secondAccountId, -tokenAmount)
      .addTokenTransfer(this.tokenId, this.firstAccountId, tokenAmount)
      .setTransactionId(txId)
      .setTransactionValidDuration(120)
      .setNodeAccountIds([new AccountId(3)])
      .freezeWith(client);

    const tx1 = await this.transferTx.sign(this.secondAccountPrivateKey);
    const tx2 = await tx1.sign(this.firstAccountPrivateKey)
    this.transferTx = tx2;
  }
);
Then(
  /^The first account has paid for the transaction fee$/,
  { timeout: 30000 },
  async function () {
    //check the record details for tx fees
    const record = await this.txRes.getRecord(client);
    // console.log("receipt ", record);
    assert.ok(
      record.transactionFee.toTinybars() > 0,
      `Transaction fee shouldn't be 0`
    );
  }
);

// TODO: TESTED TILL HERE

Given(
  /^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/,
  { timeout: 30000 },
  async function (expectedHBAR: number, expectedTokens: number) {
    // mint the required tokens

    const account = accounts[1];
    this.firstAccountId = AccountId.fromString(account.id);
    this.firstAccountPrivateKey = PrivateKey.fromStringED25519(
      account.privateKey
    );
    client.setOperator(this.firstAccountId, this.firstAccountPrivateKey);
    // get the current token amount

    const query = new AccountBalanceQuery().setAccountId(this.firstAccountId);
    const balance = await query.execute(client);
    // console.log(
    //   "Expected HBAR balance",
    //   balance.hbars.toBigNumber().toNumber()
    // );

    assert.ok(
      balance.hbars.toBigNumber().toNumber() > expectedHBAR,
      `HBAR balance does not match`
    );
    assert.ok(balance.tokens !== null, `Token balance shouldn't be null`);

    await tokenAssociation(
      this.firstAccountId,
      this.tokenId,
      this.firstAccountPrivateKey
    );
    await adjustBalance(
      this.tokenId,
      expectedTokens,
      this.firstAccountId,
      this.firstAccountPrivateKey,
      this.accountId,
      this.accountPrivateKey
    );
  }
);
Given(
  /^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  { timeout: 30000 },
  async function (expectedHBAR: number, expectedTokens: number) {
    const secondAccount = accounts[2];
    this.secondAccountId = AccountId.fromString(secondAccount.id);
    this.secondAccountPrivateKey = PrivateKey.fromStringED25519(
      secondAccount.privateKey
    );

    const query = new AccountBalanceQuery().setAccountId(this.secondAccountId);
    const balance = await query.execute(client);

    assert.ok(
      balance.hbars.toBigNumber().toNumber() === expectedHBAR,
      `HBAR balance does not match`
    );

    assert.ok(balance.tokens !== null, `Token balance shouldn't be null`);

    await tokenAssociation(
      this.secondAccountId,
      this.tokenId,
      this.secondAccountPrivateKey
    );
    await adjustBalance(
      this.tokenId,
      expectedTokens,
      this.secondAccountId,
      this.secondAccountPrivateKey,
      this.accountId,
      this.accountPrivateKey
    );

    const newBal = await new AccountBalanceQuery()
      .setAccountId(this.secondAccountId)
      .execute(client);
    const currentTokensBal = newBal.tokens?.get(this.tokenId)?.toNumber() || 0;

    assert.ok(
      currentTokensBal === expectedTokens,
      `Token balance does not match `
    );
  }
);

Given(
  /^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  { timeout: 30000 },
  async function (expectedHBAR: number, expectedTokens: number) {
    const thirdAccount = accounts[3];
    this.thirdAccountId = AccountId.fromString(thirdAccount.id);
    this.thirdAccountPrivateKey = PrivateKey.fromStringED25519(
      thirdAccount.privateKey
    );

    const query = new AccountBalanceQuery().setAccountId(this.thirdAccountId);
    const balance = await query.execute(client);

    assert.ok(
      balance.hbars.toBigNumber().toNumber() >= expectedHBAR,
      `HBAR balance does not match`
    );

    assert.ok(balance.tokens !== null, `Token balance shouldn't be null`);

    await tokenAssociation(
      this.thirdAccountId,
      this.tokenId,
      this.thirdAccountPrivateKey
    );
    await adjustBalance(
      this.tokenId,
      expectedTokens,
      this.thirdAccountId,
      this.thirdAccountPrivateKey,
      this.accountId,
      this.accountPrivateKey
    );

    const newBal = await new AccountBalanceQuery()
      .setAccountId(this.thirdAccountId)
      .execute(client);
    const currentTokensBal = newBal.tokens?.get(this.tokenId)?.toNumber() || 0;

    assert.ok(
      currentTokensBal >= expectedTokens,
      `Token balance does not match `
    );
  }
);
Given(
  /^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/,
  { timeout: 30000 },
  async function (expectedHBAR: number, expectedTokens: number) {
    const fourthAccount = accounts[4];
    this.fourthAccountId = AccountId.fromString(fourthAccount.id);
    this.fourthAccountPrivateKey = PrivateKey.fromStringED25519(
      fourthAccount.privateKey
    );

    const query = new AccountBalanceQuery().setAccountId(this.fourthAccountId);
    const balance = await query.execute(client);

    assert.ok(
      balance.hbars.toBigNumber().toNumber() >= expectedHBAR,
      `HBAR balance does not match`
    );

    assert.ok(balance.tokens !== null, `Token balance shouldn't be null`);

    await tokenAssociation(
      this.fourthAccountId,
      this.tokenId,
      this.fourthAccountPrivateKey
    );
    await adjustBalance(
      this.tokenId,
      expectedTokens,
      this.fourthAccountId,
      this.fourthAccountPrivateKey,
      this.accountId,
      this.accountPrivateKey
    );

    const newBal = await new AccountBalanceQuery()
      .setAccountId(this.fourthAccountId)
      .execute(client);
    const currentTokensBal = newBal.tokens?.get(this.tokenId)?.toNumber() || 0;

    assert.ok(
      currentTokensBal >= expectedTokens,
      `Token balance does not match `
    );
  }
);
When(
  /^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/,
  { timeout: 30000 },
  async function (
    firstAmount: number,
    secondAmount: number,
    thirdAmount: number
  ) {
    const txId = TransactionId.generate(this.firstAccountId);
    this.transferTx = new TransferTransaction()
      .addTokenTransfer(this.tokenId, this.firstAccountId, -firstAmount)
      .addTokenTransfer(this.tokenId, this.secondAccountId, -firstAmount)
      .addTokenTransfer(this.tokenId, this.thirdAccountId, secondAmount)
      .addTokenTransfer(this.tokenId, this.fourthAccountId, thirdAmount)
      .setTransactionId(txId)
      .setTransactionValidDuration(120)
      .setNodeAccountIds([new AccountId(3)])
      .freezeWith(client);
  }
);
Then(
  /^The third account holds (\d+) HTT tokens$/,
  { timeout: 30000 },
  async function (tokenAmount: number) {
    const token = await new AccountBalanceQuery()
      .setAccountId(this.thirdAccountId)
      .execute(client);
    assert.strictEqual(
      token.tokens!.get(this.tokenId)?.toNumber(),
      tokenAmount,
      `Token balance does not match`
    );
  }
);
Then(
  /^The fourth account holds (\d+) HTT tokens$/,
  { timeout: 30000 },
  async function (tokenAmount: number) {
    const token = await new AccountBalanceQuery()
      .setAccountId(this.fourthAccountId)
      .execute(client);
    assert.strictEqual(
      token.tokens!.get(this.tokenId)?.toNumber(),
      tokenAmount,
      `Token balance does not match`
    );
  }
);
