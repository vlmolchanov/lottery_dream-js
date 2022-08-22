const { enterLottery } = require("./lotteryPieces");

async function enter() {
  await enterLottery("");
}

enter()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
