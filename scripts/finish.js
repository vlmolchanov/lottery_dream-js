const { finishLottery } = require("./lotteryPieces");

async function finish() {
  await finishLottery();
}

finish().catch((error) => {
  console.log;
  process.exit(1);
});
