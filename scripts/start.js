const { startLottery } = require("./lotteryPieces");

async function start() {
  await startLottery();
}

start().catch((error) => {
  console.log;
  process.exit(1);
});
