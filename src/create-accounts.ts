import { accounts, mainAccount } from "./config";
import {
  AccountCreateTransaction,
  AccountId,
  Client,
  PrivateKey,
} from "@hashgraph/sdk";

const client = Client.forTestnet();

async function main() {
  const MAIN_ACCOUNT = AccountId.fromString(mainAccount.id);
  const MAIN_ACCOUNT_KEY = PrivateKey.fromStringED25519(mainAccount.privateKey);
  client.setOperator(MAIN_ACCOUNT, MAIN_ACCOUNT_KEY);

  for (let i = 0; i < 5; i++) {
    const newPrivateKey = PrivateKey.generate();
    const receipt = await (
      await new AccountCreateTransaction()
        .setInitialBalance(100)
        .setKey(newPrivateKey)
        .execute(client)
    ).getReceipt(client);
    console.log(
      `{id: "${receipt.accountId}", privateKey: "${newPrivateKey}"},`
    );
  }
}

main().then(console.log).catch(console.error);
