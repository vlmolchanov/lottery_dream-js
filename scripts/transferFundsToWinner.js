const { transferFundsToWinner } = require("./lotteryPieces");

async function transferFunds() {
  await transferFundsToWinner();
}

transferFunds().catch((error) => {
  console.log;
  process.exit(1);
});
