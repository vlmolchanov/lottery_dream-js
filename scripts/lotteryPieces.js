const { ethers, getNamedAccounts } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

const LotteryStatesDescriptions = [
  "Open",
  "Close",
  "Calculating winner",
  "Winner selected",
];

async function startLottery() {
  const lottery = await ethers.getContract("Lottery");
  console.log(`Starting lottery`);
  try {
    const tx = await lottery.startLottery();
    await tx.wait(1);
    console.log("Lottery is started!");
  } catch (e) {
    console.log(e);
  }
}

async function enterLottery(playerNumber) {
  const lottery = await ethers.getContract("Lottery");
  const entranceFee = await lottery.getEntranceFee();
  console.log(`Player sending ${entranceFee} wei`);
  await lottery.enterLottery({ value: entranceFee });
  console.log(`Player ${playerNumber} entered lottery!`);
}

async function finishLottery() {
  const lottery = await ethers.getContract("Lottery");

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
}

async function transferFundsToWinner() {
  const lottery = await ethers.getContract("Lottery");

  const lotteryState = await lottery.getLotteryState();

  if (lotteryState === 3) {
    console.log("Lottery is finished");
    console.log(`Winner is ${await lottery.getRecentWinner()}`);
    console.log("Sending money to winner");
    const tx = await lottery.transferFundsToWinner();
    tx.wait(2);
    console.log("Money is sent");
  }
}

module.exports = {
  enterLottery,
  startLottery,
  finishLottery,
  transferFundsToWinner,
  LotteryStatesDescriptions,
};
