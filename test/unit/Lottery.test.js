const { assert, expect } = require("chai");
const { network, deployments, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
  ENTRANCE_FEE,
  INITIAL_ANSWER,
  DECIMALS,
} = require("../../helper-hardhat-config");

// Unit tests are performed just for development chains
!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery Unit Tests", function () {
      let lottery, lotteryContract, lotteryEntranceFee, vrfCoordinatorV2Mock;

      beforeEach(async () => {
        accounts = await ethers.getSigners(); // could also do with getNamedAccounts
        deployer = accounts[0];
        player = accounts[1];
        const chainId = network.config.chainId;

        await deployments.fixture(["mocks", "lottery"]); // Deploys modules with the tags "mocks" and "lottery"
        lotteryContract = await ethers.getContract("Lottery", deployer); // Returns a new connection to the Lottery contract
        lottery = lotteryContract.connect(player);
        lotteryEntranceFee = await lottery.getEntranceFee();

        /*vrfCoordinatorV2Mock*/
        /*can put it in a separate script*/
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        // Create Subscription
        // We know, that subId is 1 and put it in `helper-hardhat-config`
        await vrfCoordinatorV2Mock.createSubscription();

        // Fund subscription
        //fundSubscription(uint64 _subId, uint96 _amount)
        const subId = networkConfig[chainId]["subscriptionId"];
        await vrfCoordinatorV2Mock.fundSubscription(subId, "999999999924984");

        // Add a consumer
        //addConsumer(uint64 _subId, address _consumer)
        await vrfCoordinatorV2Mock.addConsumer(subId, lottery.address);
      });

      describe("constructor", function () {
        it("Sets correct entrance fee", async () => {
          const entranceFee = await lottery.getEntranceFeeUSD();
          assert.equal(entranceFee.toString(), ENTRANCE_FEE);
        });
        it("Sets correct lottery state", async () => {
          const lotteryState = await lottery.getLotteryState();
          assert.equal(lotteryState.toString(), "1");
        });
        it("Sets correct owner", async () => {
          const owner = await lottery.getOwner();
          assert.equal(owner.toString(), deployer.address);
        });
      });
      describe("receive function", function () {
        it("Contract can receive ETH", async () => {
          const balanceOfLotteryInitial = await ethers.provider.getBalance(
            lottery.address
          );
          const balanceInEthInitial = ethers.utils.formatEther(
            balanceOfLotteryInitial
          );
          const valueToSend = "0.1";
          await player.sendTransaction({
            to: lottery.address,
            value: ethers.utils.parseEther(valueToSend), // Sends exactly valueToSend (0.1 ether)
          });
          const balanceOfLotteryUpdated = await ethers.provider.getBalance(
            lottery.address
          );
          const balanceInEthUpdated = ethers.utils.formatEther(
            balanceOfLotteryUpdated
          );
          assert.equal(balanceInEthUpdated - balanceInEthInitial, valueToSend);
        });
        it("Event Eth Received is correctly emited", async () => {
          await expect(
            player.sendTransaction({
              to: lottery.address,
              value: ethers.utils.parseEther("0.1"),
            })
          ).to.emit(lottery, "EthReceived");
        });
      });
      describe("checkAaveBalance before any entrances", function () {
        it("Aave balance can be seen by owner", async () => {
          const [totalCollateral, totalDebt] =
            await lotteryContract.checkAaveBalance();
          assert.equal(totalCollateral.toString(), "0");
          assert.equal(totalDebt.toString(), "0");
        });
        it("Aave balance can't be seen by not owner", async () => {
          await expect(lottery.checkAaveBalance()).to.be.revertedWith(
            "Lottery_OnlyOwnerAuthorized"
          );
        });
      });
      describe("start Lottery", function () {
        it("Lottery can be started by owner", async () => {
          await lotteryContract.startLottery();
          const lotteryState = await lottery.getLotteryState();
          assert.equal(lotteryState.toString(), "0");
        });
        it("Lottery can't be started by not owner", async () => {
          await expect(lottery.startLottery()).to.be.revertedWith(
            "Lottery_OnlyOwnerAuthorized"
          );
        });
        it("Lottery can't be started not Closed", async () => {
          await lotteryContract.startLottery();
          await expect(lottery.startLottery()).to.be.revertedWith(
            "Lottery_IncorrectState_CloseRequired"
          );
        });
      });
      describe("enterLottery", function () {
        beforeEach(async () => {
          await lotteryContract.startLottery();
        });
        it("Revert entrance if not enough ETH is sent", async () => {
          await expect(
            // entranceFee - 10wei
            lottery.enterLottery({ value: lotteryEntranceFee.sub(10) })
          ).to.be.revertedWith("Lottery_NotEnoughEthToEnter");
        });
        it("Funds are supplied to Aave", async () => {
          const [totalCollateralInitial, totalDebtInitial] =
            await lotteryContract.checkAaveBalance();
          await lottery.enterLottery({ value: lotteryEntranceFee });
          const [totalCollateralUpdated, totalDebtUpdated] =
            await lotteryContract.checkAaveBalance();
          assert.equal(
            totalCollateralInitial.add(lotteryEntranceFee).toString(),
            totalCollateralUpdated.toString()
          );
          assert.equal(totalDebtInitial, 0);
          assert.equal(totalDebtUpdated, 0);
        });
        it("Prize pool is increased", async () => {
          const prizePoolInitial = await lottery.getPrizePool();
          await lottery.enterLottery({ value: lotteryEntranceFee });
          const prizePoolUpdated = await lottery.getPrizePool();
          assert.equal(
            prizePoolUpdated.sub(prizePoolInitial).toString(),
            lotteryEntranceFee.toString()
          );
        });
        it("Record player after entering", async () => {
          await lottery.enterLottery({ value: lotteryEntranceFee });
          const lotteryPlayer = await lottery.getPlayer(0);
          assert.equal(lotteryPlayer.toString(), player.address);
        });
        it("Event New Player is correctly emited", async () => {
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.emit(lottery, "NewPlayer");
        });
        /*it("Entrance is not allowed if Lottery is not open", async () => {
          await lotteryContract.endLottery();
          await expect(
            lottery.enterLottery({ value: lotteryEntranceFee })
          ).to.be.revertedWith("Lottery_IncorrectState_OpenRequired");
        });*/
      });
      describe("endLottery", function () {
        beforeEach(async () => {
          await lotteryContract.startLottery();
          //enter with defined number of players
          const NUM_PLAYERS = 3;
          for (i = 1; i < NUM_PLAYERS; i++) {
            const lottery = await lotteryContract.connect(accounts[i]);
            await lottery.enterLottery({ value: lotteryEntranceFee });
          }
        });
        it("Lottery can be finished by owner", async () => {
          await lotteryContract.endLottery();
          const lotteryState = await lottery.getLotteryState();
          assert.equal(lotteryState.toString(), "2");
        });
        it("Lottery can't be finished by not owner", async () => {
          await expect(lottery.endLottery()).to.be.revertedWith(
            "Lottery_OnlyOwnerAuthorized"
          );
        });
        it("Lottery can't be finished not in Open state", async () => {
          await lotteryContract.endLottery();
          await expect(lottery.endLottery()).to.be.revertedWith(
            "Lottery_IncorrectState_OpenRequired"
          );
        });
        it("Event Random Request Sent is correctly emited", async () => {
          await expect(lotteryContract.endLottery()).to.emit(
            lottery,
            "RandomRequestSent"
          );
        });
      });
      describe("fulfillRandomWords", function () {
        beforeEach(async () => {
          await lotteryContract.startLottery();
          //enter with defined number of players
          const NUM_PLAYERS = 3;
          for (i = 1; i < NUM_PLAYERS; i++) {
            const lottery = await lotteryContract.connect(accounts[i]);
            await lottery.enterLottery({ value: lotteryEntranceFee });
          }
        });
        /* can try to call with abi.callwithsignature
        it("Can only be called by VRFCoordinatorV2", async () => {         
        })
        */
        /*it("Can't be correctly finished in incorrect state", async () => {
          const tx = await lotteryContract.endLottery();
          const txReceipt = await tx.wait(1);
          const requestId = txReceipt.events[1].args.requestId;

          await lotteryContract.emrgStopLottery();

          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(requestId, lottery.address)
          ).to.be.reverted;
          await vrfCoordinatorV2Mock.fulfillRandomWords(
            requestId,
            lottery.address
          );
        });*/

        it("Can't be correctly finished in incorrect state", async () => {
          const tx = await lotteryContract.endLottery();
          const txReceipt = await tx.wait(1);
          const requestId = txReceipt.events[1].args.requestId;

          await vrfCoordinatorV2Mock.fulfillRandomWordsWithOverride(
            requestId,
            lottery.address,
            [0]
          );

          // 0 number is not accepted, state shouldn't change
          const lotteryState = await lottery.getLotteryState();
          assert.equal(lotteryState.toString(), "2");
        });

        it("Winner is picked correctly. Multiple tests", async () => {
          await new Promise(async (resolve, reject) => {
            lottery.once(
              "RandomNumberReceived",
              async (date, randomNumber, recentWinnerIndex, recentWinner) => {
                // console.log("RandomNumberReceived event fired");
                // assert throws an error if it fails, so we need to wrap
                // it in a try/catch so that the promise returns event
                // if it fails.
                try {
                  console.log("");
                  console.log("---Multiple tests initiated:---");

                  //asserts

                  // winner index is calculated properly
                  const numberOfPlayers = await lottery.getPlayersNumber();
                  assert.equal(
                    recentWinnerIndex.toString(),
                    randomNumber.mod(numberOfPlayers).toString()
                  );
                  console.log("Winner index is calculated correctly PASSED");

                  // winner is picked correctly
                  const recentWinner = await lottery.getRecentWinner();
                  const playerWithSelectedIndex = await lottery.getPlayer(
                    recentWinnerIndex
                  );
                  assert.equal(
                    recentWinner.toString(),
                    playerWithSelectedIndex.toString()
                  );
                  console.log("Winner is picked correctly PASSED");

                  // Lottery state is changed correctly
                  const lotteryState = await lottery.getLotteryState();
                  assert.equal(lotteryState.toString(), "3");
                  console.log("Lottery state is changed correctly PASSED");

                  console.log("-------------------------------");

                  resolve(); // if try passes, resolves the promise
                } catch (e) {
                  reject(e); // if try fails, rejects the promise
                }
              }
            );

            const tx = await lotteryContract.endLottery();
            const txReceipt = await tx.wait(1);
            const requestId = txReceipt.events[1].args.requestId;

            await vrfCoordinatorV2Mock.fulfillRandomWords(
              requestId,
              lottery.address
            );
          });
        });
      });
      describe("transferFundsToWinner", function () {
        beforeEach(async () => {
          await lotteryContract.startLottery();
          //enter with defined number of players
          const NUM_PLAYERS = 3;
          for (i = 1; i < NUM_PLAYERS; i++) {
            const lottery = await lotteryContract.connect(accounts[i]);
            await lottery.enterLottery({ value: lotteryEntranceFee });
          }
        });
        it("Can't be called in incorrect lottery state", async () => {
          await expect(
            lotteryContract.transferFundsToWinner()
          ).to.be.revertedWith("Lottery_IncorrectState_WinnerSelectedRequired");
        });
        it("Money is transfered to winner correctly. Multiple tests.", async () => {
          await new Promise(async (resolve, reject) => {
            lottery.once(
              "RandomNumberReceived",
              async (date, randomNumber, recentWinnerIndex, recentWinner) => {
                //console.log("RandomNumberReceived event fired");
                // assert throws an error if it fails, so we need to wrap
                // it in a try/catch so that the promise returns event
                // if it fails.
                try {
                  const prizePool = await lottery.getPrizePool();
                  const balanceOfPlayerInitial =
                    await ethers.provider.getBalance(recentWinner);

                  console.log("");
                  console.log("---Multiple tests initiated:---");

                  //asserts

                  // Can't be called by not owner
                  await expect(
                    lottery.transferFundsToWinner()
                  ).to.be.revertedWith("Lottery_OnlyOwnerAuthorized");
                  console.log("Can't be called by not owner PASSED");

                  // Event MoneySentToWinner is fired
                  await expect(lotteryContract.transferFundsToWinner()).to.emit(
                    lottery,
                    "MoneySentToWinner"
                  );
                  console.log("Event MoneySentToWinner is fired PASSED");

                  // Balance of winner is increased by prizePool
                  const balanceOfPlayerUpdated =
                    await ethers.provider.getBalance(recentWinner);

                  assert.equal(
                    balanceOfPlayerInitial.add(prizePool).toString(),
                    balanceOfPlayerUpdated.toString()
                  );
                  console.log(
                    "Balance of winner is increased by prizePool PASSED"
                  );

                  // Lottery state is changed correctly
                  const lotteryState = await lottery.getLotteryState();
                  assert.equal(lotteryState.toString(), "1");
                  console.log("Lottery state is changed correctly PASSED");

                  console.log("-------------------------------");

                  resolve(); // if try passes, resolves the promise
                } catch (e) {
                  reject(e); // if try fails, rejects the promise
                }
              }
            );

            const tx = await lotteryContract.endLottery();
            const txReceipt = await tx.wait(1);
            const requestId = txReceipt.events[1].args.requestId;

            await vrfCoordinatorV2Mock.fulfillRandomWords(
              requestId,
              lottery.address
            );
          });
        });
      });
      describe("setEntranceFee", function () {
        it("Lottery entrance fee can be set by owner", async () => {
          const ENTRANCE_FEE = "10";
          await lotteryContract.setEntranceFee(ENTRANCE_FEE);
          const entranceFeeUpdated = await lottery.getEntranceFeeUSD();
          assert.equal(entranceFeeUpdated.toString(), ENTRANCE_FEE);
        });
        it("Lottery entrance fee can't be set by not owner", async () => {
          await expect(lottery.setEntranceFee("10")).to.be.revertedWith(
            "Lottery_OnlyOwnerAuthorized"
          );
        });
        it("Lottery entrance fee can't be set in incorrect state", async () => {
          await lotteryContract.startLottery();
          await expect(lottery.setEntranceFee("10")).to.be.revertedWith(
            "Lottery_IncorrectState_CloseRequired"
          );
        });
        it("Lottery entrance fee can't be set less than 1 USD", async () => {
          const ENTRANCE_FEE = "0";
          await expect(
            lotteryContract.setEntranceFee(ENTRANCE_FEE)
          ).to.be.revertedWith("Lottery_InsufficientEntranceFee");
        });
        it("Event EntranceFeeChanged is correctly emited", async () => {
          await expect(lotteryContract.setEntranceFee("10")).to.emit(
            lottery,
            "EntranceFeeChanged"
          );
        });
      });

      describe("emrgStopLottery", function () {
        beforeEach(async () => {
          await lotteryContract.startLottery();
          //enter with defined number of players
          const NUM_PLAYERS = 3;
          for (i = 1; i < NUM_PLAYERS; i++) {
            const lottery = await lotteryContract.connect(accounts[i]);
            await lottery.enterLottery({ value: lotteryEntranceFee });
          }
        });
        it("Lottery emergency stop can be called by owner", async () => {
          await lotteryContract.emrgStopLottery();
          const lotteryState = await lottery.getLotteryState();
          assert.equal(lotteryState.toString(), "1");
        });
        it("Lottery emergency stop can't be called by not owner", async () => {
          await expect(lottery.emrgStopLottery()).to.be.revertedWith(
            "Lottery_OnlyOwnerAuthorized"
          );
        });
        it("Lottery emergency stop can be called in any state", async () => {
          await lotteryContract.endLottery();
          await lotteryContract.emrgStopLottery();
          const lotteryState = await lottery.getLotteryState();
          assert.equal(lotteryState.toString(), "1");
        });
        it("All funds are withdrawn from Aave", async () => {
          await lotteryContract.emrgStopLottery();
          const [totalCollateral, totalDebt] =
            await lotteryContract.checkAaveBalance();
          assert.equal(totalCollateral.toString(), "0");
          assert.equal(totalDebt.toString(), "0");
        });
        it("Owner balance is correctly updated", async () => {
          const [totalCollateral, totalDebt] =
            await lotteryContract.checkAaveBalance();
          const deployerBalanceInitial = await ethers.provider.getBalance(
            deployer.address
          );
          //Taking into account gasCost
          const transactionResponse = await lotteryContract.emrgStopLottery();
          const transactionReceipt = await transactionResponse.wait(1);
          const { gasUsed, effectiveGasPrice } = transactionReceipt;
          const gasCost = gasUsed.mul(effectiveGasPrice);

          const deployerBalanceUpdated = await ethers.provider.getBalance(
            deployer.address
          );
          assert.equal(
            deployerBalanceInitial.add(totalCollateral).sub(gasCost).toString(),
            deployerBalanceUpdated.toString()
          );
        });
        it("Event EmrgStopLotteryInitiated is correctly emited", async () => {
          await expect(lotteryContract.emrgStopLottery()).to.emit(
            lottery,
            "EmrgStopLotteryInitiated"
          );
        });
      });

      describe("getEntranceFee", function () {
        it("Converts correctly USD to ETH", async () => {
          // Answer = entranceInUSD/convRateFromOracle+10^(ETH_dec+DECIMALS)
          const AggregatorV3 = await ethers.getContract("MockV3Aggregator");
          const [, convRate, , ,] = await AggregatorV3.latestRoundData();

          //console.log(10 ** (18 + DECIMALS));
          const entranceFeeInUSD = await lottery.getEntranceFeeUSD();

          // Calc in Gwei
          const entranceFeeInETHCalculated = entranceFeeInUSD
            .mul(10 ** DECIMALS)
            .mul(10 ** 9)
            .div(convRate);

          // Assert in Gwei
          assert.equal(
            entranceFeeInETHCalculated.toString(),
            lotteryEntranceFee.div(10 ** 9).toString()
          );
        });
      });
    });
