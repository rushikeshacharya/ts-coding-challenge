const {
  AccountId,
  PrivateKey,
  Client,
  AccountCreateTransaction,
  Hbar,
} = require("@hashgraph/sdk"); // v2.46.0
const dotenv = require("dotenv");
dotenv.config();

async function main() {
  let client;
  try {
    // Your account ID and private key from string value
    console.log("", process.env.MY_ACCOUNT_ID);
    console.log("", process.env.MY_PRIVATE_KEY);

    
    const MY_ACCOUNT_ID = AccountId.fromString(process.env.MY_ACCOUNT_ID);
    const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(
      process.env.MY_PRIVATE_KEY
    );

    // Pre-configured client for test network (testnet)
    client = Client.forTestnet();

    //Set the operator with the account ID and private key
    client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

    // Start your code here

    // Generate a new key for the account
    const accountPrivateKey = PrivateKey.generateECDSA();
    const accountPublicKey = accountPrivateKey.publicKey;

    const txCreateAccount = new AccountCreateTransaction()
      .setAlias(accountPublicKey.toEvmAddress()) //Do NOT set an alias if you need to update/rotate keys
      .setKey(accountPublicKey)
      .setInitialBalance(new Hbar(15));

    //Sign the transaction with the client operator private key and submit to a Hedera network
    const txCreateAccountResponse = await txCreateAccount.execute(client);

    //Request the receipt of the transaction
    const receiptCreateAccountTx = await txCreateAccountResponse.getReceipt(
      client
    );

    //Get the transaction consensus status
    const statusCreateAccountTx = receiptCreateAccountTx.status;

    //Get the Account ID o
    const accountId = receiptCreateAccountTx.accountId;

    //Get the Transaction ID
    const txIdAccountCreated = txCreateAccountResponse.transactionId.toString();

    console.log(
      "------------------------------ Create Account ------------------------------ "
    );
    console.log("Receipt status       :", statusCreateAccountTx.toString());
    console.log("Transaction ID       :", txIdAccountCreated);
    console.log(
      "Hashscan URL         :",
      `https://hashscan.io/testnet/tx/${txIdAccountCreated}`
    );
    console.log("Account ID           :", accountId.toString());
    console.log("Private key          :", accountPrivateKey.toString());
    console.log("Public key           :", accountPublicKey.toString());
  } catch (error) {
    console.error(error);
  } finally {
    if (client) client.close();
  }
}

main();
