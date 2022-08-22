const {
  LotteryStatesDescriptions,
  enterLottery,
  startLottery,
  finishLottery,
  transferFundsToWinner,
} = require("./lotteryPieces");

async function playLottery() {
  const lottery = await ethers.getContract("Lottery");
  const lotteryState = await lottery.getLotteryState();

  console.log(`Lottery is in ${LotteryStatesDescriptions[lotteryState]} state`);

  if (lotteryState === 2) {
    console.log("Lottery is calculating winner. Come later");
    return "exit";
  }
  if (lotteryState === 3) {
    await transferFundsToWinner();
    return "exit";
  }
  if (lotteryState === 1) {
    await startLottery();
  }

  console.log(`Money can be sent to ${lottery.address} contract`);
  console.log(
    `Entrance fee is ${await lottery.getEntranceFeeUSD()} USD / ${await lottery.getEntranceFee()} `
  );

  const NUM_PLAYERS = 4;
  for (i = 1; i < NUM_PLAYERS; i++) {
    await enterLottery(i);
  }

  try {
    console.log("Setting up Finish Listener");
    await new Promise(async (resolve, reject) => {
      lottery.once("RandomNumberReceived", async () => {
        console.log("Winner is picked");
        try {
          await transferFundsToWinner();
          resolve();
        } catch (error) {
          console.log(error);
          reject(error);
        }
      });

      console.log("Finishing lottery ...");
      const tx = await lottery.endLottery();
      await tx.wait(2);

      console.log("Waiting for winner to be picked ...");
    });
  } catch (e) {
    console.log(e);
  }
}

playLottery()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
