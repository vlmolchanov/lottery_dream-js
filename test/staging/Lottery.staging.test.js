const { assert, expect } = require("chai");
const { network, ethers } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat-config");

const {
  LotteryStatesDescriptions,
  enterLottery,
  startLottery,
  finishLottery,
  transferFundsToWinner,
} = require("../../scripts/lotteryPieces");

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery Staging Tests", function () {
      let lotteryContract;

      beforeEach(async () => {
        lotteryContract = await ethers.getContract("Lottery");
      });

      it("Money is transfered to winner correctly.", async () => {
        console.log("Setting up a listener");
        await new Promise(async (resolve, reject) => {
          lotteryContract.once(
            "RandomNumberReceived",
            async (date, randomNumber, recentWinnerIndex, recentWinner) => {
              console.log("RandomNumberReceived event fired");
              // assert throws an error if it fails, so we need to wrap
              // it in a try/catch so that the promise returns event
              // if it fails.
              try {
                const prizePool = await lotteryContract.getPrizePool();
                const balanceOfPlayerInitial = await ethers.provider.getBalance(
                  recentWinner
                );

                //Taking into account gasCost
                const transactionResponse =
                  await lotteryContract.transferFundsToWinner();
                const transactionReceipt = await transactionResponse.wait(1);
                const { gasUsed, effectiveGasPrice } = transactionReceipt;
                const gasCost = gasUsed.mul(effectiveGasPrice);

                // Balance of winner is increased by prizePool
                const balanceOfPlayerUpdated = await ethers.provider.getBalance(
                  recentWinner
                );

                assert.equal(
                  balanceOfPlayerInitial.add(prizePool).sub(gasCost).toString(),
                  balanceOfPlayerUpdated.toString()
                );

                console.log("Test complete");

                resolve(); // if try passes, resolves the promise
              } catch (e) {
                reject(e); // if try fails, rejects the promise
              }
            }
          );

          const lotteryState = await lotteryContract.getLotteryState();

          console.log(
            `Lottery is in ${LotteryStatesDescriptions[lotteryState]} state`
          );

          if (lotteryState === 2) {
            console.log("Lottery is calculating winner. Come later");
            process.exit("Come later");
          }
          if (lotteryState === 3) {
            await transferFundsToWinner();
            console.log("Money is sent to winner");
          }
          if (lotteryState === 1) {
            await startLottery();
          }

          console.log(`Players should pay ${lotteryEntranceFee} wei to enter`);

          const NUM_PLAYERS = 3;
          for (i = 1; i < NUM_PLAYERS; i++) {
            await enterLottery(i);
          }

          console.log("Time to finish it");
          const tx = await lotteryContract.endLottery();
          console.log("Lottery is requested to be finished");
          await tx.wait(1);
        });
      });
    });
